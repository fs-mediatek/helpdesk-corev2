'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { Server, Database, HardDrive, Loader2, Trash2, Download, RefreshCw, CloudDownload, CheckCircle, AlertTriangle, ArrowUpCircle, Upload, FolderSync } from 'lucide-react'

type SystemInfo = {
  appVersion: string
  nodeVersion: string
  platform: string
  uptime: number
  memory: {
    rss: number
    heapUsed: number
    heapTotal: number
    external: number
  }
}

type BackupFile = {
  name: string
  size: number
  date: string
}

type DbResult = {
  table: string
  status: string
}

const TABS = [
  { id: 'system', label: 'System', icon: Server },
  { id: 'update', label: 'Aktualisierung', icon: CloudDownload },
  { id: 'database', label: 'Datenbank', icon: Database },
  { id: 'backups', label: 'Backups', icon: HardDrive },
  { id: 'migration', label: 'Migration', icon: FolderSync },
] as const

type TabId = (typeof TABS)[number]['id']

function Spinner() {
  return (
    <div className="flex justify-center py-16">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  )
}

function InfoCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-bold truncate">{value}</p>
    </div>
  )
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const parts: string[] = []
  if (d > 0) parts.push(`${d}d`)
  if (h > 0) parts.push(`${h}h`)
  parts.push(`${m}m`)
  return parts.join(' ')
}

function toMB(bytes: number): string {
  return `${Math.round((bytes / 1024 / 1024) * 10) / 10} MB`
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${Math.round(bytes / 1024)} KB`
}

// ---- System Tab ----
function SystemTab() {
  const [info, setInfo] = useState<SystemInfo | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    fetch('/api/plugins/system-maintenance/info')
      .then((r) => r.json())
      .then((d) => { setInfo(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) return <Spinner />
  if (!info) return <p className="text-sm text-muted-foreground py-8 text-center">Keine Daten</p>

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <InfoCard label="App-Version" value={`v${info.appVersion}`} />
        <InfoCard label="Node.js" value={info.nodeVersion} />
        <InfoCard label="Platform" value={info.platform} />
        <InfoCard label="Uptime" value={formatUptime(info.uptime)} />
        <InfoCard
          label="Memory (verwendet)"
          value={`${toMB(info.memory.heapUsed)} / ${toMB(info.memory.heapTotal)}`}
        />
      </div>

      <div className="rounded-xl border bg-card p-5 shadow-sm space-y-2">
        <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
          Memory Details
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div>
            <p className="text-muted-foreground text-xs">RSS</p>
            <p className="font-medium">{toMB(info.memory.rss)}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Heap Used</p>
            <p className="font-medium">{toMB(info.memory.heapUsed)}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Heap Total</p>
            <p className="font-medium">{toMB(info.memory.heapTotal)}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">External</p>
            <p className="font-medium">{toMB(info.memory.external)}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ---- Database Tab ----
function DatabaseTab() {
  const [optimizeLoading, setOptimizeLoading] = useState(false)
  const [optimizeResults, setOptimizeResults] = useState<DbResult[] | null>(null)
  const [checkLoading, setCheckLoading] = useState(false)
  const [checkResults, setCheckResults] = useState<DbResult[] | null>(null)

  async function runOptimize() {
    setOptimizeLoading(true)
    setOptimizeResults(null)
    try {
      const res = await fetch('/api/plugins/system-maintenance/db/optimize', { method: 'POST' })
      const data = await res.json()
      setOptimizeResults(data.results ?? [])
    } catch {
      setOptimizeResults([{ table: 'Fehler', status: 'Anfrage fehlgeschlagen' }])
    }
    setOptimizeLoading(false)
  }

  async function runCheck() {
    setCheckLoading(true)
    setCheckResults(null)
    try {
      const res = await fetch('/api/plugins/system-maintenance/db/check', { method: 'POST' })
      const data = await res.json()
      setCheckResults(data.results ?? [])
    } catch {
      setCheckResults([{ table: 'Fehler', status: 'Anfrage fehlgeschlagen' }])
    }
    setCheckLoading(false)
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {/* Optimize */}
      <div className="rounded-xl border bg-card p-5 shadow-sm space-y-3">
        <h3 className="font-semibold">Tabellen optimieren</h3>
        <p className="text-sm text-muted-foreground">
          Führt OPTIMIZE TABLE auf den Kern-Tabellen aus, um die Performance zu verbessern.
        </p>
        <button
          onClick={runOptimize}
          disabled={optimizeLoading}
          className="inline-flex items-center gap-2 rounded-lg border bg-card px-4 py-2 text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50"
        >
          {optimizeLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Tabellen optimieren
        </button>
        {optimizeResults && (
          <div className="mt-2 rounded-lg border overflow-auto max-h-48">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-3 py-2 text-left font-medium">Tabelle</th>
                  <th className="px-3 py-2 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {optimizeResults.map((r) => (
                  <tr key={r.table} className="border-b last:border-0">
                    <td className="px-3 py-1.5 font-mono">{r.table}</td>
                    <td className={`px-3 py-1.5 ${r.status === 'OK' ? 'text-emerald-600' : 'text-amber-600'}`}>
                      {r.status}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Check */}
      <div className="rounded-xl border bg-card p-5 shadow-sm space-y-3">
        <h3 className="font-semibold">Tabellenintegrität prüfen</h3>
        <p className="text-sm text-muted-foreground">
          Führt CHECK TABLE aus und zeigt Fehler oder Inkonsistenzen an.
        </p>
        <button
          onClick={runCheck}
          disabled={checkLoading}
          className="inline-flex items-center gap-2 rounded-lg border bg-card px-4 py-2 text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50"
        >
          {checkLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
          Tabellenintegrität prüfen
        </button>
        {checkResults && (
          <div className="mt-2 rounded-lg border overflow-auto max-h-48">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-3 py-2 text-left font-medium">Tabelle</th>
                  <th className="px-3 py-2 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {checkResults.map((r) => (
                  <tr key={r.table} className="border-b last:border-0">
                    <td className="px-3 py-1.5 font-mono">{r.table}</td>
                    <td className={`px-3 py-1.5 ${r.status === 'OK' ? 'text-emerald-600' : 'text-red-500'}`}>
                      {r.status}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ---- Backups Tab ----
function BackupsTab() {
  const [backups, setBackups] = useState<BackupFile[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    fetch('/api/plugins/system-maintenance/backups')
      .then((r) => r.json())
      .then((d) => { setBackups(Array.isArray(d) ? d : []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  async function createBackup() {
    setCreating(true)
    try {
      await fetch('/api/plugins/system-maintenance/backup', { method: 'POST' })
      load()
    } finally {
      setCreating(false)
    }
  }

  async function deleteBackup(filename: string) {
    await fetch(`/api/plugins/system-maintenance/backups/${encodeURIComponent(filename)}`, {
      method: 'DELETE',
    })
    setConfirmDelete(null)
    load()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Datenbank-Backups</h3>
        <button
          onClick={createBackup}
          disabled={creating}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <HardDrive className="h-4 w-4" />}
          Backup erstellen
        </button>
      </div>

      {loading ? (
        <Spinner />
      ) : backups.length === 0 ? (
        <div className="rounded-xl border bg-card py-16 text-center text-muted-foreground text-sm">
          Keine Backups vorhanden
        </div>
      ) : (
        <div className="rounded-xl border bg-card shadow-sm overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                {['Dateiname', 'Größe', 'Erstellt', 'Aktionen'].map((h) => (
                  <th key={h} className="h-10 px-4 text-left font-medium text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {backups.map((b) => (
                <tr key={b.name} className="border-b hover:bg-muted/40 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs">{b.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{formatSize(b.size)}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">
                    {new Date(b.date).toLocaleString('de-DE')}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() =>
                          window.open(
                            `/api/plugins/system-maintenance/backups/${encodeURIComponent(b.name)}/download`
                          )
                        }
                        className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium hover:bg-muted transition-colors"
                        title="Herunterladen"
                      >
                        <Download className="h-3.5 w-3.5" />
                        Download
                      </button>

                      {confirmDelete === b.name ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => deleteBackup(b.name)}
                            className="rounded-lg bg-red-500 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-600 transition-colors"
                          >
                            Löschen
                          </button>
                          <button
                            onClick={() => setConfirmDelete(null)}
                            className="rounded-lg border px-2.5 py-1 text-xs font-medium hover:bg-muted transition-colors"
                          >
                            Abbruch
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDelete(b.name)}
                          className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                          title="Löschen"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ---- Main Component ----
export function MaintenancePage({ slug }: { slug: string[] }) {
  const [activeTab, setActiveTab] = useState<TabId>('system')

  void slug

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Systemwartung</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Backups, Datenbank und Systeminformationen
        </p>
      </div>

      {/* Tab navigation */}
      <div className="flex gap-1 rounded-xl bg-muted p-1 w-fit">
        {TABS.map((tab) => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-background shadow-sm text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          )
        })}
      </div>

      {activeTab === 'system' && <SystemTab />}
      {activeTab === 'update' && <UpdateTab />}
      {activeTab === 'database' && <DatabaseTab />}
      {activeTab === 'backups' && <BackupsTab />}
      {activeTab === 'migration' && <MigrationTab />}
    </div>
  )
}

// ── Migration Tab ──
function MigrationTab() {
  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<any>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const doExport = async () => {
    setExporting(true)
    window.location.href = '/api/plugins/system-maintenance/export/sql'
    setTimeout(() => setExporting(false), 3000)
  }

  const doImport = async (file: File) => {
    if (!file.name.endsWith('.sql')) { setImportResult({ error: 'Nur .sql-Dateien' }); return }
    if (!confirm('ACHTUNG: Alle bestehenden Daten werden überschrieben! Fortfahren?')) return
    setImporting(true); setImportResult(null)
    const form = new FormData()
    form.append('file', file)
    try {
      const res = await fetch('/api/plugins/system-maintenance/import/sql', { method: 'POST', body: form })
      const data = await res.json()
      setImportResult(data)
    } catch (e: any) {
      setImportResult({ error: e.message })
    } finally { setImporting(false) }
  }

  return (
    <div className="space-y-4">
      {/* Export */}
      <div className="rounded-xl border bg-card p-5 shadow-sm">
        <h3 className="font-semibold flex items-center gap-2 mb-2">
          <Download className="h-5 w-5 text-muted-foreground" />
          Daten exportieren
        </h3>
        <p className="text-sm text-muted-foreground mb-4">
          Exportiert die komplette Datenbank als SQL-Datei. Diese kann auf einem neuen System importiert werden.
        </p>
        <button onClick={doExport} disabled={exporting}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors">
          {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          {exporting ? 'Exportiere...' : 'SQL-Export herunterladen'}
        </button>
      </div>

      {/* Import */}
      <div className="rounded-xl border bg-card p-5 shadow-sm">
        <h3 className="font-semibold flex items-center gap-2 mb-2">
          <Upload className="h-5 w-5 text-muted-foreground" />
          Daten importieren
        </h3>
        <p className="text-sm text-muted-foreground mb-4">
          Importiert eine SQL-Exportdatei von einem anderen System. Bestehende Tabellen werden überschrieben.
        </p>

        <div className="flex items-center gap-3">
          <input ref={fileRef} type="file" accept=".sql" className="hidden"
            onChange={e => { if (e.target.files?.[0]) doImport(e.target.files[0]) }} />
          <button onClick={() => fileRef.current?.click()} disabled={importing}
            className="inline-flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm font-medium text-amber-500 hover:bg-amber-500/20 disabled:opacity-50 transition-colors">
            {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {importing ? 'Importiere...' : 'SQL-Datei importieren'}
          </button>
        </div>

        {importResult && (
          <div className={`mt-3 rounded-lg px-4 py-3 text-sm ${importResult.error ? 'bg-red-500/10 text-red-500' : 'bg-emerald-500/10 text-emerald-500'}`}>
            {importResult.error ? (
              <p>Fehler: {importResult.error}</p>
            ) : (
              <>
                <p>Import abgeschlossen: {importResult.executed} Statements ausgeführt{importResult.errors > 0 ? `, ${importResult.errors} Fehler` : ''}</p>
                {importResult.errorDetails?.length > 0 && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-yellow-500 hover:underline">Fehlerdetails anzeigen</summary>
                    <ul className="mt-1 space-y-1 text-xs text-muted-foreground font-mono">
                      {importResult.errorDetails.map((d: string, i: number) => <li key={i}>{d}</li>)}
                    </ul>
                  </details>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Instructions */}
      <div className="rounded-lg border bg-muted/20 px-5 py-4 text-sm text-muted-foreground space-y-2">
        <p className="font-medium text-foreground text-xs uppercase tracking-wide">Anleitung: Server-Migration</p>
        <p><strong>1.</strong> Auf dem alten System: SQL-Export herunterladen</p>
        <p><strong>2.</strong> Neues System installieren: <code className="bg-muted rounded px-1 py-0.5 text-xs">sudo bash install.sh</code></p>
        <p><strong>3.</strong> Auf dem neuen System einloggen (admin@helpdesk.local / admin)</p>
        <p><strong>4.</strong> Systemwartung → Migration → SQL-Datei importieren</p>
        <p><strong>5.</strong> Server neu starten</p>
        <p className="text-xs text-muted-foreground/60 mt-2">Uploads und Bilder müssen manuell kopiert werden (Ordner: /opt/helpdesk/uploads, /opt/helpdesk/public/catalog-images)</p>
      </div>
    </div>
  )
}

// ── Update Tab ──
function UpdateTab() {
  const [checking, setChecking] = useState(false)
  const [updateInfo, setUpdateInfo] = useState<any>(null)
  const [updating, setUpdating] = useState(false)
  const [updateResult, setUpdateResult] = useState<any>(null)
  const [restarting, setRestarting] = useState(false)

  const checkForUpdates = async () => {
    setChecking(true); setUpdateInfo(null); setUpdateResult(null)
    try {
      const res = await fetch('/api/plugins/system-maintenance/update/check')
      const data = await res.json()
      setUpdateInfo(data)
    } catch (e: any) {
      setUpdateInfo({ error: e.message, upToDate: true, behind: 0 })
    } finally { setChecking(false) }
  }

  useEffect(() => { checkForUpdates() }, [])

  const applyUpdate = async () => {
    if (!confirm('System wird aktualisiert. Dies kann einige Minuten dauern. Fortfahren?')) return
    setUpdating(true); setUpdateResult(null)
    try {
      const res = await fetch('/api/plugins/system-maintenance/update/apply', { method: 'POST' })
      const data = await res.json()
      setUpdateResult(data)
      if (data.success) setUpdateInfo(null) // clear to re-check
    } catch (e: any) {
      setUpdateResult({ success: false, log: [], error: e.message })
    } finally { setUpdating(false) }
  }

  const restartService = async () => {
    setRestarting(true)
    await fetch('/api/admin/restart', { method: 'POST' }).catch(() => {})
    setTimeout(() => window.location.reload(), 5000)
  }

  return (
    <div className="space-y-4">
      {/* Status card */}
      <div className="rounded-xl border bg-card p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold flex items-center gap-2">
            <ArrowUpCircle className="h-5 w-5 text-muted-foreground" />
            Systemaktualisierung
          </h3>
          <button onClick={checkForUpdates} disabled={checking}
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50">
            {checking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Prüfen
          </button>
        </div>

        {checking && (
          <div className="flex items-center gap-3 py-6 justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Prüfe auf Updates...</span>
          </div>
        )}

        {updateInfo && !checking && (
          <>
            {updateInfo.error ? (
              <div className="flex items-start gap-3 rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3">
                <AlertTriangle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-red-500">Fehler bei der Update-Prüfung</p>
                  <p className="text-xs text-red-400 mt-1">{updateInfo.error}</p>
                </div>
              </div>
            ) : updateInfo.upToDate ? (
              <div className="flex items-center gap-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-4 py-3">
                <CheckCircle className="h-5 w-5 text-emerald-500 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-emerald-500">System ist aktuell</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Version {updateInfo.currentVersion} · Commit {updateInfo.localCommit}</p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-start gap-3 rounded-lg bg-amber-500/10 border border-amber-500/20 px-4 py-3">
                  <CloudDownload className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-amber-500">Update verfügbar</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {updateInfo.currentVersion} → <strong>{updateInfo.remoteVersion}</strong> · {updateInfo.behind} neue Commits
                    </p>
                  </div>
                </div>

                {/* Commit list */}
                {updateInfo.commits?.length > 0 && (
                  <div className="rounded-lg border bg-muted/20 p-3 max-h-48 overflow-y-auto">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Änderungen</p>
                    <div className="space-y-1">
                      {updateInfo.commits.map((c: string, i: number) => (
                        <div key={i} className="flex items-start gap-2 text-xs">
                          <span className="font-mono text-muted-foreground shrink-0">{c.slice(0, 8)}</span>
                          <span>{c.slice(9)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <button onClick={applyUpdate} disabled={updating}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors">
                  {updating ? <><Loader2 className="h-4 w-4 animate-spin" /> Aktualisiere...</> : <><CloudDownload className="h-4 w-4" /> Jetzt aktualisieren</>}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Update result */}
      {updateResult && (
        <div className={`rounded-xl border p-5 shadow-sm ${updateResult.success ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-red-500/5 border-red-500/20'}`}>
          <div className="flex items-center gap-2 mb-3">
            {updateResult.success ? <CheckCircle className="h-5 w-5 text-emerald-500" /> : <AlertTriangle className="h-5 w-5 text-red-500" />}
            <h3 className="font-semibold text-sm">{updateResult.success ? 'Update erfolgreich' : 'Update fehlgeschlagen'}</h3>
            {updateResult.version && <span className="text-xs font-mono bg-muted px-2 py-0.5 rounded">v{updateResult.version}</span>}
          </div>

          {/* Log output */}
          {updateResult.log?.length > 0 && (
            <div className="rounded-lg bg-black/20 p-3 font-mono text-xs max-h-48 overflow-y-auto space-y-0.5">
              {updateResult.log.map((line: string, i: number) => (
                <div key={i} className="text-muted-foreground">{line}</div>
              ))}
            </div>
          )}

          {updateResult.restartRequired && (
            <div className="mt-4 flex items-center gap-3">
              <p className="text-sm text-amber-500">Server-Neustart erforderlich</p>
              <button onClick={restartService} disabled={restarting}
                className="inline-flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-sm font-medium text-amber-500 hover:bg-amber-500/20 disabled:opacity-50 transition-colors">
                {restarting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                {restarting ? 'Neustart...' : 'Jetzt neu starten'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Info */}
      <div className="rounded-lg border bg-muted/20 px-4 py-3 text-xs text-muted-foreground space-y-1">
        <p>Die Aktualisierung führt folgende Schritte aus:</p>
        <p>1. <code className="bg-muted px-1 rounded">sudo git pull origin main</code> — Neueste Version herunterladen</p>
        <p>2. <code className="bg-muted px-1 rounded">npm install</code> — Abhängigkeiten aktualisieren</p>
        <p>3. <code className="bg-muted px-1 rounded">npx next build</code> — Anwendung neu bauen</p>
        <p>4. Server-Neustart zum Aktivieren</p>
      </div>
    </div>
  )
}
