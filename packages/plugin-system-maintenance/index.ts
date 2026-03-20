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
      // Dynamically fetch all tables instead of using a hardcoded list
      const tableRows = await ctx.db.query<Record<string, string>>('SHOW TABLES')
      const tables = tableRows.map((row: Record<string, string>) => Object.values(row)[0])
      const results: { table: string; status: string }[] = []

      for (const table of tables) {
        try {
          await ctx.db.query(`OPTIMIZE TABLE \`${table}\``)
          results.push({ table, status: 'OK' })
        } catch (err: unknown) {
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
      // Dynamically fetch all tables instead of using a hardcoded list
      const tableRows = await ctx.db.query<Record<string, string>>('SHOW TABLES')
      const tables = tableRows.map((row: Record<string, string>) => Object.values(row)[0])
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

    // ---- Full SQL Export (for migration) ----
    'GET /export/sql': async (_req, ctx) => {
      if (!ctx.session.role.includes('admin')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

      const tables = await ctx.db.query<Record<string, string>>('SHOW TABLES')
      const dbName = process.env.DB_NAME || 'helpdesk'
      let sql = `-- HelpDesk Full Export\n-- Date: ${new Date().toISOString()}\n-- Database: ${dbName}\n\nSET FOREIGN_KEY_CHECKS=0;\n\n`

      for (const row of tables) {
        const table = Object.values(row)[0]
        try {
          // Get CREATE TABLE
          const [createRow] = await ctx.db.query(`SHOW CREATE TABLE \`${table}\``) as any[]
          const createSql = createRow?.['Create Table'] || createRow?.['Create View']
          if (createSql) {
            sql += `DROP TABLE IF EXISTS \`${table}\`;\n${createSql};\n\n`
          }

          // Get data
          const rows = await ctx.db.query(`SELECT * FROM \`${table}\``)
          if ((rows as any[]).length > 0) {
            const cols = Object.keys((rows as any[])[0])
            for (const r of rows as any[]) {
              const vals = cols.map(c => {
                const v = r[c]
                if (v === null) return 'NULL'
                if (typeof v === 'number') return String(v)
                if (v instanceof Date) return `'${v.toISOString().slice(0, 19).replace('T', ' ')}'`
                // Escape backslashes FIRST, then quotes, then newlines
                return `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '\\r')}'`
              })
              sql += `INSERT INTO \`${table}\` (\`${cols.join('`,`')}\`) VALUES (${vals.join(',')});\n`
            }
            sql += '\n'
          }
        } catch {}
      }

      sql += 'SET FOREIGN_KEY_CHECKS=1;\n'

      const filename = `helpdesk-export-${new Date().toISOString().slice(0, 10)}.sql`
      return new NextResponse(sql, {
        headers: {
          'Content-Type': 'application/sql; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      })
    },

    // ---- Import SQL ----
    'POST /import/sql': async (req, ctx) => {
      if (!ctx.session.role.includes('admin')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

      const formData = await req.formData()
      const file = formData.get('file') as File
      if (!file) return NextResponse.json({ error: 'Keine Datei' }, { status: 400 })

      const text = await file.text()

      // Strip comment-only lines, then split on semicolons respecting quoted strings
      const cleaned = text
        .split('\n')
        .filter(line => {
          const t = line.trim()
          return t && !t.startsWith('--') && !t.startsWith('#')
        })
        .join('\n')

      // Split on semicolons that are NOT inside single quotes
      const statements: string[] = []
      let current = ''
      let inString = false
      let escaped = false
      for (let i = 0; i < cleaned.length; i++) {
        const ch = cleaned[i]
        if (escaped) {
          current += ch
          escaped = false
          continue
        }
        if (ch === '\\') {
          current += ch
          escaped = true
          continue
        }
        if (ch === "'" && !escaped) {
          inString = !inString
          current += ch
          continue
        }
        if (ch === ';' && !inString) {
          const trimmed = current.trim()
          if (trimmed) statements.push(trimmed)
          current = ''
          continue
        }
        current += ch
      }
      // Last statement without trailing semicolon
      const lastTrimmed = current.trim()
      if (lastTrimmed) statements.push(lastTrimmed)

      let executed = 0
      let errors = 0
      // Group errors by message to see patterns
      const errorMap: Record<string, { count: number; example: string }> = {}
      for (const stmt of statements) {
        if (stmt.length < 3) continue
        try {
          await ctx.db.query(stmt)
          executed++
        } catch (err: unknown) {
          errors++
          const msg = err instanceof Error ? err.message.slice(0, 120) : 'Unknown'
          if (!errorMap[msg]) {
            errorMap[msg] = { count: 0, example: stmt.slice(0, 80) }
          }
          errorMap[msg].count++
        }
      }

      // Format grouped errors
      const errorDetails = Object.entries(errorMap)
        .sort((a, b) => b[1].count - a[1].count)
        .map(([msg, { count, example }]) => `${count}x: ${msg}\n   → ${example}...`)

      return NextResponse.json({ success: true, executed, errors, total: statements.length, errorDetails })
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
      const updateScript = path.join(appDir, 'update.sh')

      if (!fs.existsSync(updateScript)) {
        return NextResponse.json({ error: 'update.sh nicht gefunden' }, { status: 500 })
      }

      // Launch update script detached — it will stop this service, pull, build, restart
      const { spawn } = require('child_process')
      spawn('bash', [updateScript], {
        detached: true,
        stdio: 'ignore',
        cwd: appDir,
      }).unref()

      return NextResponse.json({
        success: true,
        log: [
          'Update gestartet — der Server wird gleich neu gestartet.',
          'Fortschritt auf der Konsole: journalctl -u helpdesk -f',
          'Update-Log: cat /tmp/helpdesk-update.log',
        ],
        restartRequired: false,
      })
    },

    // ---- Factory Reset ----
    'POST /factory-reset': async (req, ctx) => {
      if (!ctx.session.role.includes('admin')) {
        return NextResponse.json({ error: 'Nur Admins' }, { status: 403 })
      }

      const body = await req.json().catch(() => ({}))
      if (body.confirm !== 'WERKSZUSTAND') {
        return NextResponse.json({ error: 'Bestätigung fehlt' }, { status: 400 })
      }

      const log: string[] = []

      try {
        // 1. Get all tables
        const tableRows = await ctx.db.query<Record<string, string>>('SHOW TABLES')
        const tables = tableRows.map(r => Object.values(r)[0])

        // 2. Disable FK checks
        await ctx.db.query('SET FOREIGN_KEY_CHECKS=0')

        // 3. Drop all tables
        for (const table of tables) {
          try {
            await ctx.db.query(`DROP TABLE IF EXISTS \`${table}\``)
            log.push(`Tabelle ${table} gelöscht`)
          } catch (err: any) {
            log.push(`${table}: ${err.message?.slice(0, 80)}`)
          }
        }

        await ctx.db.query('SET FOREIGN_KEY_CHECKS=1')

        // 4. Delete uploads (except .gitkeep)
        const uploadsDir = path.join(process.cwd(), 'uploads')
        if (fs.existsSync(uploadsDir)) {
          const files = fs.readdirSync(uploadsDir).filter(f => f !== '.gitkeep')
          for (const f of files) {
            try { fs.unlinkSync(path.join(uploadsDir, f)) } catch {}
          }
          log.push(`${files.length} Uploads gelöscht`)
        }

        // 5. Delete backups (except .gitkeep)
        if (fs.existsSync(BACKUP_DIR)) {
          const files = fs.readdirSync(BACKUP_DIR).filter(f => f !== '.gitkeep')
          for (const f of files) {
            try { fs.unlinkSync(path.join(BACKUP_DIR, f)) } catch {}
          }
          log.push(`${files.length} Backups gelöscht`)
        }

        log.push('Werkszustand hergestellt — Setup wird beim nächsten Aufruf gestartet')

        return NextResponse.json({ success: true, log })
      } catch (err: any) {
        log.push(`Fehler: ${err.message}`)
        return NextResponse.json({ success: false, log, error: err.message }, { status: 500 })
      }
    },
  },

  Component: MaintenancePage,
}

export default plugin
