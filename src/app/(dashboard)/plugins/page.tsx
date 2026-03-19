'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Upload, Puzzle, Trash2, RotateCw, CheckCircle2,
  AlertCircle, Loader2, Package, CloudUpload, X, Shield,
} from 'lucide-react'

interface PluginInfo {
  id: string
  name: string
  version: string
  description: string
  icon: string
  packageName?: string
  isCore?: boolean
}

export default function PluginsPage() {
  const [plugins, setPlugins] = useState<PluginInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [dragOver, setDragOver] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [restarting, setRestarting] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const loadPlugins = useCallback(() => {
    setLoading(true)
    fetch('/api/plugins')
      .then(r => r.json())
      .then(data => { setPlugins(Array.isArray(data) ? data : []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => { loadPlugins() }, [loadPlugins])

  async function uploadPlugin(file: File) {
    if (!file.name.endsWith('.zip')) { setUploadResult({ ok: false, message: 'Nur .zip-Dateien erlaubt' }); return }
    setUploading(true); setUploadResult(null)
    const form = new FormData(); form.append('plugin', file)
    try {
      const res = await fetch('/api/admin/plugins/upload', { method: 'POST', body: form })
      const data = await res.json()
      if (res.ok) { setUploadResult({ ok: true, message: `"${data.plugin?.name}" installiert. Bitte Server neu starten.` }); loadPlugins() }
      else setUploadResult({ ok: false, message: data.error || 'Upload fehlgeschlagen' })
    } catch { setUploadResult({ ok: false, message: 'Netzwerkfehler' }) } finally { setUploading(false) }
  }

  function handleFiles(files: FileList | null) { if (files?.[0]) uploadPlugin(files[0]) }

  async function removePlugin(packageName: string) {
    setRemoving(packageName)
    try {
      const res = await fetch('/api/admin/plugins/uninstall', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ packageName }) })
      if (res.ok) { setUploadResult({ ok: true, message: 'Plugin entfernt. Bitte Server neu starten.' }); loadPlugins() }
      else { const data = await res.json(); setUploadResult({ ok: false, message: data.error || 'Fehler' }) }
    } finally { setRemoving(null); setConfirmRemove(null) }
  }

  async function restart() {
    setRestarting(true)
    await fetch('/api/admin/restart', { method: 'POST' })
    setTimeout(() => window.location.reload(), 3000)
  }

  const corePlugins = plugins.filter(p => p.isCore)
  const extraPlugins = plugins.filter(p => !p.isCore)

  return (
    <div className="space-y-6 animate-fade-in max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Module & Add-ons</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Integrierte Module und optionale Erweiterungen</p>
        </div>
        <Button variant="outline" onClick={restart} disabled={restarting} className="gap-2 text-amber-600 border-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950">
          {restarting ? <><Loader2 className="h-4 w-4 animate-spin" /> Neustart...</> : <><RotateCw className="h-4 w-4" /> Server neu starten</>}
        </Button>
      </div>

      {restarting && (
        <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/20">
          <CardContent className="flex items-center gap-3 p-4">
            <Loader2 className="h-5 w-5 animate-spin text-amber-600 shrink-0" />
            <div><p className="font-medium text-sm text-amber-800 dark:text-amber-400">Server wird neu gestartet…</p></div>
          </CardContent>
        </Card>
      )}

      {/* Core modules */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="h-4 w-4 text-muted-foreground" />
            Integrierte Module
            <Badge variant="secondary" className="ml-1">{corePlugins.length}</Badge>
          </CardTitle>
          <CardDescription>Fester Bestandteil von HelpDesk Core — können nicht deinstalliert werden.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="divide-y">
              {corePlugins.map(plugin => (
                <div key={plugin.id} className="flex items-center gap-4 px-6 py-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                    <Puzzle className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm">{plugin.name}</p>
                      <Badge variant="secondary" className="text-xs font-mono">v{plugin.version}</Badge>
                      <Badge variant="success" className="text-xs">Aktiv</Badge>
                      <Badge variant="info" className="text-xs">Core</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{plugin.description}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Optional add-ons */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Puzzle className="h-4 w-4 text-muted-foreground" />
            Optionale Add-ons
            {!loading && <Badge variant="secondary" className="ml-1">{extraPlugins.length}</Badge>}
          </CardTitle>
          <CardDescription>Zusätzlich installierte Erweiterungen.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {!loading && extraPlugins.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
              <Package className="h-8 w-8 mb-2 opacity-30" />
              <p className="text-sm">Keine optionalen Add-ons installiert</p>
            </div>
          ) : (
            <div className="divide-y">
              {extraPlugins.map(plugin => (
                <div key={plugin.id} className="flex items-center gap-4 px-6 py-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted">
                    <Puzzle className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm">{plugin.name}</p>
                      <Badge variant="secondary" className="text-xs font-mono">v{plugin.version}</Badge>
                      <Badge variant="success" className="text-xs">Aktiv</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{plugin.description}</p>
                  </div>
                  <div className="shrink-0">
                    {confirmRemove === plugin.id ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Wirklich?</span>
                        <Button size="sm" variant="destructive" disabled={removing === plugin.id} onClick={() => removePlugin(plugin.id)}>
                          {removing === plugin.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Entfernen'}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setConfirmRemove(null)}>Abbrechen</Button>
                      </div>
                    ) : (
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => setConfirmRemove(plugin.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Upload area */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><CloudUpload className="h-4 w-4 text-muted-foreground" /> Add-on installieren</CardTitle>
          <CardDescription>ZIP-Datei hochladen — nach der Installation den Server neu starten.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className={`relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center transition-colors cursor-pointer
            ${dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-muted/40'}`}
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files) }}
            onClick={() => fileRef.current?.click()}>
            <input ref={fileRef} type="file" accept=".zip" className="hidden" onChange={e => handleFiles(e.target.files)} />
            {uploading ? (
              <><Loader2 className="h-8 w-8 text-primary animate-spin mb-2" /><p className="text-sm font-medium">Installiere…</p></>
            ) : (
              <><Upload className="h-8 w-8 text-muted-foreground mb-2" /><p className="text-sm font-medium">ZIP-Datei hier ablegen</p><p className="text-xs text-muted-foreground mt-1">oder klicken zum Auswählen</p></>
            )}
          </div>
          {uploadResult && (
            <div className={`flex items-start gap-2.5 mt-3 rounded-lg px-4 py-3 text-sm ${uploadResult.ok ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'bg-destructive/10 text-destructive'}`}>
              {uploadResult.ok ? <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" /> : <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />}
              <span>{uploadResult.message}</span>
              <button onClick={() => setUploadResult(null)} className="ml-auto shrink-0 opacity-60 hover:opacity-100"><X className="h-4 w-4" /></button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
