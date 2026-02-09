import React from 'react'
import type { TemplateListItem } from '../../domain/types'
import { useI18n } from '../../i18n'

type Props = {
  templateIndex: TemplateListItem[]
  templateIndexLoading: boolean
  reloadTemplateIndex: () => void
  loadTemplateSnapshot: (templateId: string) => Promise<void>
  renameTemplate: (templateId: string, name: string) => Promise<void>
  deleteTemplate: (templateId: string) => Promise<void>
  reportError: (e: unknown) => void

  templateId: string
  setTemplateId: (v: string) => void

  newTemplateId: string
  setNewTemplateId: (v: string) => void
  newTemplateName: string
  setNewTemplateName: (v: string) => void
  generateTemplateSnapshot: (file: File) => void
}

export default function TemplateLibraryPanel(props: Props) {
  const { t } = useI18n()
  const {
    templateIndex,
    templateIndexLoading,
    reloadTemplateIndex,
    loadTemplateSnapshot,
    renameTemplate,
    deleteTemplate,
    reportError,
    setTemplateId,
    setNewTemplateId,
    setNewTemplateName,
    newTemplateId,
    newTemplateName,
    generateTemplateSnapshot
  } = props

  const [snapshotFileName, setSnapshotFileName] = React.useState('')
  const [editingTemplateId, setEditingTemplateId] = React.useState<string | null>(null)
  const lastAutoNameRef = React.useRef<string>('')

  const baseNameFromFileName = React.useCallback((name: string) => {
    const s = (name || '').trim()
    if (!s) return ''
    const withoutPath = s.split(/[/\\]/).slice(-1)[0] || s
    return withoutPath.replace(/\.(docx|doc)\s*$/i, '')
  }, [])

  return (
    <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ fontWeight: 800 }}>{t('rules.templateLibrary.title')}</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn-secondary" onClick={reloadTemplateIndex} disabled={templateIndexLoading}>
            {templateIndexLoading ? t('common.loading') : t('rules.templateLibrary.refresh')}
          </button>
        </div>
      </div>

      <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div style={{ border: '1px solid var(--control-border)', borderRadius: 12, padding: 12, background: 'rgba(255,255,255,0.06)' }}>
          <div style={{ fontWeight: 750, marginBottom: 8 }}>{t('rules.templateLibrary.existing')}</div>
          {templateIndex.length > 0 ? (
            <div style={{ display: 'grid', gap: 8, maxHeight: 220, overflow: 'auto', paddingRight: 2 }}>
              {templateIndex.map((tpl) => (
                <div key={tpl.templateId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, border: '1px solid var(--control-border)', borderRadius: 10, padding: '8px 10px', background: 'var(--control-bg)' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 750, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tpl.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tpl.templateId}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <button
                      className="btn-secondary"
                      onClick={async () => {
                        const isEditing = editingTemplateId === tpl.templateId
                        if (isEditing) {
                          setEditingTemplateId(null)
                          setNewTemplateId('')
                          if (lastAutoNameRef.current) setNewTemplateName(lastAutoNameRef.current)
                          return
                        }
                        setEditingTemplateId(tpl.templateId)
                        setTemplateId(tpl.templateId)
                        setNewTemplateId(tpl.templateId)
                        setNewTemplateName(tpl.name || tpl.templateId)
                        setSnapshotFileName('')
                        try {
                          await loadTemplateSnapshot(tpl.templateId)
                        } catch (e) {
                          reportError(e)
                        }
                      }}
                      style={{ height: 34, padding: '0 10px' }}
                    >
                      {editingTemplateId === tpl.templateId ? t('common.detach') : t('common.edit')}
                    </button>
                    <button
                      className="btn-secondary"
                      onClick={async () => {
                        const nextName = (window.prompt(t('rules.templateLibrary.renamePrompt'), tpl.name || '') || '').trim()
                        if (!nextName) return
                        try {
                          await renameTemplate(tpl.templateId, nextName)
                        } catch (e) {
                          reportError(e)
                        }
                      }}
                      style={{ height: 34, padding: '0 10px' }}
                    >
                      {t('rules.templateLibrary.rename')}
                    </button>
                    <button
                      className="btn-secondary"
                      onClick={async () => {
                        if (!window.confirm(t('rules.templateLibrary.deleteConfirm', { name: tpl.name || tpl.templateId }))) return
                        try {
                          await deleteTemplate(tpl.templateId)
                        } catch (e) {
                          reportError(e)
                        }
                      }}
                      style={{ height: 34, padding: '0 10px', borderColor: 'rgba(239,68,68,0.55)', color: 'rgba(239,68,68,0.95)' }}
                    >
                      {t('common.delete')}
                    </button>
                    <button
                      className="btn-secondary"
                      onClick={async () => {
                        setEditingTemplateId(null)
                        setTemplateId(tpl.templateId)
                        try {
                          await loadTemplateSnapshot(tpl.templateId)
                        } catch (e) {
                          reportError(e)
                        }
                      }}
                      style={{ height: 34, padding: '0 10px' }}
                    >
                      {t('common.use')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>{templateIndexLoading ? t('common.loading') : t('rules.templateLibrary.empty')}</div>
          )}
        </div>

        <div style={{ border: '1px solid var(--control-border)', borderRadius: 12, padding: 12, background: 'rgba(255,255,255,0.06)' }}>
          <div style={{ fontWeight: 750, marginBottom: 8 }}>{t('rules.templateLibrary.generate')}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 8, alignItems: 'center' }}>
            <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 700 }}>templateId</div>
            <input
              value={newTemplateId}
              onChange={(e) => setNewTemplateId(e.target.value)}
              disabled={!!editingTemplateId}
              style={{ height: 36, borderRadius: 10, border: '1px solid var(--control-border)', background: 'var(--control-bg)', color: 'var(--text)', padding: '0 10px' }}
            />
            <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 700 }}>{t('rules.templateLibrary.name')}</div>
            <input value={newTemplateName} onChange={(e) => setNewTemplateName(e.target.value)} style={{ height: 36, borderRadius: 10, border: '1px solid var(--control-border)', background: 'var(--control-bg)', color: 'var(--text)', padding: '0 10px' }} />
          </div>
          <div style={{ marginTop: 10 }}>
            <input
              id="template-snapshot-upload"
              type="file"
              accept=".docx"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (!f) return
                setSnapshotFileName(f.name)
                if (!editingTemplateId) {
                  const nextAuto = baseNameFromFileName(f.name)
                  if (nextAuto) {
                    lastAutoNameRef.current = nextAuto
                    setNewTemplateName(nextAuto)
                  }
                }
                generateTemplateSnapshot(f)
                window.setTimeout(() => {
                  const el = document.getElementById('block-config-panel')
                  el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }, 0)
              }}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <label htmlFor="template-snapshot-upload" className="btn-secondary" style={{ height: 34, padding: '0 10px', display: 'inline-flex', alignItems: 'center' }}>
                {t('rules.templateLibrary.chooseFile')}
              </label>
              <div style={{ fontSize: 12, color: 'var(--text)', border: '1px solid var(--control-border)', borderRadius: 999, padding: '6px 10px', background: 'var(--control-bg)', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {snapshotFileName || t('rules.templateLibrary.noFile')}
              </div>
            </div>
            {snapshotFileName && (
              <div style={{ marginTop: 8, fontSize: 12, color: 'var(--muted)' }}>{t('rules.templateLibrary.draftHint')}</div>
            )}
          </div>
          <div style={{ marginTop: 10, fontSize: 12, color: 'var(--muted)' }}>{t('rules.templateLibrary.uploadHint')}</div>
        </div>
      </div>
    </div>
  )
}
