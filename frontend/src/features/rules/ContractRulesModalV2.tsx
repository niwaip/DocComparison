import React from 'react'
import type { Block, DetectedField, FieldRuleState, TemplateListItem } from '../../domain/types'
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
  saveRuleset: () => void
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
            saveRuleset={saveRuleset}
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
