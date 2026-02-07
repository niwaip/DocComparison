import React from 'react'
import { useI18n } from '../../i18n'

type Props = {
  templateId: string
  globalPromptLoading: boolean
  globalPromptDefaultDraft: string
  setGlobalPromptDefaultDraft: (v: string) => void
  globalPromptTemplateDraft: string
  setGlobalPromptTemplateDraft: (v: string) => void
  loadGlobalPrompt: () => void
  saveGlobalPrompt: () => void
}

export default function GlobalPromptPanel(props: Props) {
  const { t } = useI18n()
  const {
    templateId,
    globalPromptLoading,
    globalPromptDefaultDraft,
    setGlobalPromptDefaultDraft,
    globalPromptTemplateDraft,
    setGlobalPromptTemplateDraft,
    loadGlobalPrompt,
    saveGlobalPrompt
  } = props

  return (
    <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ fontWeight: 800 }}>{t('rules.globalPrompt.title')}</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn-secondary" onClick={loadGlobalPrompt} disabled={globalPromptLoading}>
            {globalPromptLoading ? t('common.loading') : t('common.load')}
          </button>
          <button className="btn-primary" onClick={saveGlobalPrompt} disabled={globalPromptLoading}>
            {globalPromptLoading ? t('common.saving') : t('common.save')}
          </button>
        </div>
      </div>
      <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 750, marginBottom: 8 }}>{t('rules.globalPrompt.defaultTitle')}</div>
          <textarea
            value={globalPromptDefaultDraft}
            onChange={(e) => setGlobalPromptDefaultDraft(e.target.value)}
            placeholder={t('rules.globalPrompt.defaultPlaceholder')}
            style={{ width: '100%', maxWidth: '100%', boxSizing: 'border-box', minHeight: 160, resize: 'vertical', borderRadius: 12, border: '1px solid var(--control-border)', background: 'var(--control-bg)', color: 'var(--text)', padding: 12, fontSize: 12, lineHeight: 1.6 }}
          />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 750, marginBottom: 8, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>{t('rules.globalPrompt.templateTitle', { templateId })}</div>
          <textarea
            value={globalPromptTemplateDraft}
            onChange={(e) => setGlobalPromptTemplateDraft(e.target.value)}
            placeholder={t('rules.globalPrompt.templatePlaceholder')}
            style={{ width: '100%', maxWidth: '100%', boxSizing: 'border-box', minHeight: 160, resize: 'vertical', borderRadius: 12, border: '1px solid var(--control-border)', background: 'var(--control-bg)', color: 'var(--text)', padding: 12, fontSize: 12, lineHeight: 1.6 }}
          />
        </div>
      </div>
    </div>
  )
}
