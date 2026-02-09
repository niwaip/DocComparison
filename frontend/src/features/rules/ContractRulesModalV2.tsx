import React from 'react'
import type { Block, DetectedField, FieldRuleState, SaveRulesetResult, TemplateListItem } from '../../domain/types'
import BlockRulesPanel from './BlockRulesPanel'
import GlobalPromptPanel from './GlobalPromptPanel'
import TemplateLibraryPanel from './TemplateLibraryPanel'
import { useI18n } from '../../i18n'

export type ContractRulesModalProps = {
  open: boolean
  onClose: () => void
  reportError: (e: unknown) => void

  templateId: string
  setTemplateId: (v: string) => void
  saveRuleset: () => Promise<SaveRulesetResult>
  rulesetLoading: boolean

  templateIndex: TemplateListItem[]
  templateIndexLoading: boolean
  reloadTemplateIndex: () => void
  loadTemplateSnapshot: (templateId: string) => Promise<void>
  renameTemplate: (templateId: string, name: string) => Promise<void>
  deleteTemplate: (templateId: string) => Promise<void>

  newTemplateId: string
  setNewTemplateId: (v: string) => void
  newTemplateName: string
  setNewTemplateName: (v: string) => void
  generateTemplateSnapshot: (file: File) => void

  templateBlocks: Block[]
  detectedFields: DetectedField[]
  fieldRules: Record<string, FieldRuleState>
  updateFieldRule: (fieldId: string, patch: Partial<FieldRuleState>) => void
  blockPrompts: Record<string, string>
  setBlockPrompts: React.Dispatch<React.SetStateAction<Record<string, string>>>

  globalPromptLoading: boolean
  globalPromptDefaultDraft: string
  setGlobalPromptDefaultDraft: (v: string) => void
  globalPromptTemplateDraft: string
  setGlobalPromptTemplateDraft: (v: string) => void
  loadGlobalPrompt: () => void
  saveGlobalPrompt: () => void
}

export default function ContractRulesModalV2(props: ContractRulesModalProps) {
  const { t } = useI18n()
  const {
    open,
    onClose,
    reportError,
    templateId,
    setTemplateId,
    saveRuleset,
    rulesetLoading,
    templateIndex,
    templateIndexLoading,
    reloadTemplateIndex,
    loadTemplateSnapshot,
    renameTemplate,
    deleteTemplate,
    newTemplateId,
    setNewTemplateId,
    newTemplateName,
    setNewTemplateName,
    generateTemplateSnapshot,
    templateBlocks,
    detectedFields,
    fieldRules,
    updateFieldRule,
    blockPrompts,
    setBlockPrompts,
    globalPromptLoading,
    globalPromptDefaultDraft,
    setGlobalPromptDefaultDraft,
    globalPromptTemplateDraft,
    setGlobalPromptTemplateDraft,
    loadGlobalPrompt,
    saveGlobalPrompt
  } = props
  const [saveToast, setSaveToast] = React.useState<{ kind: 'success' | 'error'; text: string } | null>(null)
  const saveToastTimerRef = React.useRef<number | null>(null)

  React.useEffect(() => {
    return () => {
      if (saveToastTimerRef.current) window.clearTimeout(saveToastTimerRef.current)
      saveToastTimerRef.current = null
    }
  }, [])

  const triggerSaveRuleset = React.useCallback(() => {
    void (async () => {
      const res = await saveRuleset()
      setSaveToast({ kind: res.ok ? 'success' : 'error', text: res.message || (res.ok ? t('rules.save.success.ruleset') : t('rules.save.failed')) })
      if (saveToastTimerRef.current) window.clearTimeout(saveToastTimerRef.current)
      saveToastTimerRef.current = window.setTimeout(() => setSaveToast(null), 4200)
    })()
  }, [saveRuleset, t])

  if (!open) return null

  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="modal" role="dialog" aria-modal="true">
        <div className="modal-topbar">
          <div className="modal-title">{t('rules.modal.title')}</div>
          <button className="icon-btn" title={t('common.close')} onClick={onClose}>
            ✕
          </button>
        </div>

        {saveToast && (
          <div style={{ padding: '10px 14px 0 14px' }}>
            <div
              style={{
                border: '1px solid var(--control-border)',
                borderRadius: 12,
                padding: '10px 12px',
                background: saveToast.kind === 'success' ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)',
                color: 'var(--text)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 650 }}>{saveToast.text}</div>
              <button className="btn-secondary" onClick={() => setSaveToast(null)} style={{ height: 28, padding: '0 10px' }}>
                {t('common.close')}
              </button>
            </div>
          </div>
        )}

        <div style={{ padding: 14, display: 'grid', gap: 14 }}>
          <TemplateLibraryPanel
            templateIndex={templateIndex}
            templateIndexLoading={templateIndexLoading}
            reloadTemplateIndex={reloadTemplateIndex}
            loadTemplateSnapshot={loadTemplateSnapshot}
            renameTemplate={renameTemplate}
            deleteTemplate={deleteTemplate}
            reportError={reportError}
            templateId={templateId}
            setTemplateId={setTemplateId}
            newTemplateId={newTemplateId}
            setNewTemplateId={setNewTemplateId}
            newTemplateName={newTemplateName}
            setNewTemplateName={setNewTemplateName}
            generateTemplateSnapshot={generateTemplateSnapshot}
          />

          <BlockRulesPanel
            templateBlocks={templateBlocks}
            detectedFields={detectedFields}
            fieldRules={fieldRules}
            updateFieldRule={updateFieldRule}
            blockPrompts={blockPrompts}
            setBlockPrompts={setBlockPrompts}
            saveRuleset={triggerSaveRuleset}
            rulesetLoading={rulesetLoading}
          />

          <GlobalPromptPanel
            templateId={templateId}
            globalPromptLoading={globalPromptLoading}
            globalPromptDefaultDraft={globalPromptDefaultDraft}
            setGlobalPromptDefaultDraft={setGlobalPromptDefaultDraft}
            globalPromptTemplateDraft={globalPromptTemplateDraft}
            setGlobalPromptTemplateDraft={setGlobalPromptTemplateDraft}
            loadGlobalPrompt={loadGlobalPrompt}
            saveGlobalPrompt={saveGlobalPrompt}
          />
        </div>
      </div>
    </div>
  )
}
