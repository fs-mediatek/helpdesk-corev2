import type { HelpdeskPlugin } from '../../src/lib/plugins/types'
import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'
import { MaintenancePage } from './components/MaintenancePage'

const BACKUP_DIR = path.join(process.cwd(), 'backups')

function ensureBackupDir() {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true })
  }
}

const plugin: HelpdeskPlugin = {
  manifest: {
    id: 'system-maintenance',
    name: 'Systemwartung',
    version: '1.0.0',
    description: 'System-Wartung, Backups und Datenbankpflege',
    icon: 'Wrench',
    navItems: [
      { label: 'Systemwartung', href: '/', icon: 'Wrench' },
    ],
  },

  api: {
    // ---- System Info ----
    'GET /info': async (_req, _ctx) => {
      const pkgPath = path.join(process.cwd(), 'package.json')
      let appVersion = '?'
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
        appVersion = pkg.version || '?'
      } catch {
        // ignore
      }

      return NextResponse.json({
        appVersion,
        nodeVersion: process.version,
        platform: process.platform,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
      })
    },

    // ---- Optimize Tables ----
    'POST /db/optimize': async (_req, ctx) => {
      const tables = ['tickets', 'users', 'ticket_comments', 'assets', 'inventory_items', 'knowledge_base']
      const results: { table: string; status: string }[] = []

      for (const table of tables) {
        try {
          await ctx.db.query(`OPTIMIZE TABLE \`${table}\``)
          results.push({ table, status: 'OK' })
        } catch (err: unknown) {
          // Table may not exist — record but don't fail
          results.push({
            table,
            status: err instanceof Error ? err.message.slice(0, 80) : 'Error',
          })
        }
      }

      return NextResponse.json({ results, message: `${results.length} Tabellen verarbeitet` })
    },

    // ---- Check Tables ----
    'POST /db/check': async (_req, ctx) => {
      const tables = ['tickets', 'users', 'ticket_comments', 'assets', 'inventory_items', 'knowledge_base']
      const results: { table: string; status: string }[] = []

      for (const table of tables) {
        try {
          const check = await ctx.db.query<Record<string, unknown>>(
            `CHECK TABLE \`${table}\``
          )
          const row = check[0] ?? {}
          results.push({
            table,
            status: String(row['Msg_text'] ?? row['msg_text'] ?? 'OK'),
          })
        } catch (err: unknown) {
          results.push({
            table,
            status: err instanceof Error ? err.message.slice(0, 80) : 'Error',
          })
        }
      }

      return NextResponse.json({ results })
    },

    // ---- Create Backup ----
    'POST /backup': async (_req, ctx) => {
      ensureBackupDir()

      const timestamp = new Date()
        .toISOString()
        .replace(/[:.]/g, '-')
        .slice(0, 19)
      const filename = `backup-${timestamp}.json`
      const filePath = path.join(BACKUP_DIR, filename)

      // Collect table names
      const tableRows = await ctx.db.query<Record<string, string>>(
        'SHOW TABLES'
      )
      const backup: Record<string, unknown[]> = {}

      for (const row of tableRows) {
        const tableName = Object.values(row)[0]
        try {
          const rows = await ctx.db.query(`SELECT * FROM \`${tableName}\``)
          backup[tableName] = rows
        } catch {
          backup[tableName] = []
        }
      }

      fs.writeFileSync(filePath, JSON.stringify(backup, null, 2), 'utf8')
      const stat = fs.statSync(filePath)

      return NextResponse.json({
        filename,
        size: stat.size,
      })
    },

    // ---- List Backups ----
    'GET /backups': async (_req, _ctx) => {
      ensureBackupDir()

      let files: { name: string; size: number; date: string }[] = []
      try {
        files = fs
          .readdirSync(BACKUP_DIR)
          .filter((f) => f.endsWith('.json') || f.endsWith('.sql'))
          .map((f) => {
            const stat = fs.statSync(path.join(BACKUP_DIR, f))
            return { name: f, size: stat.size, date: stat.mtime.toISOString() }
          })
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      } catch {
        // empty
      }

      return NextResponse.json(files)
    },

    // ---- Delete Backup ----
    'DELETE /backups/:filename': async (_req, ctx) => {
      const rawName = ctx.params.filename
      // Prevent path traversal
      const safe = path.basename(rawName).replace(/[^a-zA-Z0-9._-]/g, '')
      if (!safe) {
        return NextResponse.json({ error: 'Ungültiger Dateiname' }, { status: 400 })
      }
      const filePath = path.join(BACKUP_DIR, safe)
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath)
      }
      return NextResponse.json({ success: true })
    },

    // ---- Download Backup ----
    'GET /backups/:filename/download': async (_req, ctx) => {
      const rawName = ctx.params.filename
      const safe = path.basename(rawName).replace(/[^a-zA-Z0-9._-]/g, '')
      if (!safe) {
        return NextResponse.json({ error: 'Ungültiger Dateiname' }, { status: 400 })
      }
      const filePath = path.join(BACKUP_DIR, safe)
      if (!fs.existsSync(filePath)) {
        return NextResponse.json({ error: 'Backup nicht gefunden' }, { status: 404 })
      }
      const content = fs.readFileSync(filePath)
      return new NextResponse(content, {
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Disposition': `attachment; filename="${safe}"`,
        },
      })
    },

    // ---- Check for Updates ----
    'GET /update/check': async (_req, _ctx) => {
      const appDir = process.cwd()
      try {
        // Fetch latest from remote
        execSync('git fetch origin 2>&1', { cwd: appDir, timeout: 15000 })
        const local = execSync('git rev-parse HEAD', { cwd: appDir }).toString().trim()
        const remote = execSync('git rev-parse origin/main', { cwd: appDir }).toString().trim()
        const behind = execSync('git rev-list HEAD..origin/main --count', { cwd: appDir }).toString().trim()
        const currentPkg = JSON.parse(fs.readFileSync(path.join(appDir, 'package.json'), 'utf8'))

        let remoteVersion = currentPkg.version
        try {
          const remotePkg = execSync('git show origin/main:package.json', { cwd: appDir }).toString()
          remoteVersion = JSON.parse(remotePkg).version || currentPkg.version
        } catch {}

        // Recent commits on remote
        let commits: string[] = []
        if (parseInt(behind) > 0) {
          const log = execSync('git log HEAD..origin/main --oneline --max-count=10', { cwd: appDir }).toString().trim()
          commits = log.split('\n').filter(Boolean)
        }

        return NextResponse.json({
          currentVersion: currentPkg.version,
          remoteVersion,
          localCommit: local.slice(0, 8),
          remoteCommit: remote.slice(0, 8),
          behind: parseInt(behind),
          upToDate: local === remote,
          commits,
        })
      } catch (err: any) {
        return NextResponse.json({ error: err.message || 'Git-Fehler', upToDate: true, behind: 0 }, { status: 500 })
      }
    },

    // ---- Perform Update ----
    'POST /update/apply': async (_req, ctx) => {
      if (!ctx.session.role.includes('admin')) {
        return NextResponse.json({ error: 'Nur Admins' }, { status: 403 })
      }
      const appDir = process.cwd()
      const log: string[] = []
      try {
        // 1. Git pull
        log.push('Git pull...')
        const pullResult = execSync('git pull origin main 2>&1', { cwd: appDir, timeout: 30000 }).toString()
        log.push(pullResult.trim())

        // 2. npm install
        log.push('Abhängigkeiten aktualisieren...')
        const npmResult = execSync('npm install --silent 2>&1', { cwd: appDir, timeout: 120000 }).toString()
        log.push(npmResult.trim() || 'OK')

        // 3. Rebuild
        log.push('Build...')
        const buildResult = execSync('npx next build 2>&1', { cwd: appDir, timeout: 180000 }).toString()
        log.push(buildResult.includes('Ready') || buildResult.includes('Compiled') ? 'Build erfolgreich' : 'Build abgeschlossen')

        // Read new version
        const newPkg = JSON.parse(fs.readFileSync(path.join(appDir, 'package.json'), 'utf8'))

        return NextResponse.json({
          success: true,
          version: newPkg.version,
          log,
          restartRequired: true,
        })
      } catch (err: any) {
        log.push(`Fehler: ${err.message}`)
        return NextResponse.json({ success: false, log, error: err.message }, { status: 500 })
      }
    },
  },

  Component: MaintenancePage,
}

export default plugin
