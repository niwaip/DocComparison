import React from 'react'
import { useI18n } from '../i18n'

type ContractTypeOption = {
  templateId: string
  name: string
}

type Props = {
  contractTypeOptions: ContractTypeOption[]
  templateId: string
  setTemplateId: (next: string) => void

  aiCheckEnabled: boolean
  setAiCheckEnabled: (next: boolean) => void
  aiAnalyzeEnabled: boolean
  setAiAnalyzeEnabled: (next: boolean) => void

  loading: boolean
  leftBlocksCount: number
  rightBlocksCount: number
  uploadPaneCollapsed: boolean

  onCompare: () => void
  onReset: () => void
}

export default function SideActions(props: Props) {
  const {
    contractTypeOptions,
    templateId,
    setTemplateId,
    aiCheckEnabled,
    setAiCheckEnabled,
    aiAnalyzeEnabled,
    setAiAnalyzeEnabled,
    loading,
    leftBlocksCount,
    rightBlocksCount,
    uploadPaneCollapsed,
    onCompare,
    onReset
  } = props

  const { t } = useI18n()

  const compareDisabled = loading || rightBlocksCount === 0 || (leftBlocksCount === 0 && !templateId)
  const resetDisabled = loading && !uploadPaneCollapsed

  return (
    <div className="side-actions">
      <div className="side-actions-top">
        <div className="side-actions-controls">
          <div className="field-row">
            <div className="field-row-label">{t('side.contractType')}</div>
            <select className="select" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
              {contractTypeOptions.map((o) => (
                <option key={o.templateId} value={o.templateId}>
                  {o.templateId ? o.name : '\u00A0'}
                </option>
              ))}
            </select>
          </div>
          <div className="side-actions-switches">
            <label className="switch">
              <input type="checkbox" checked={aiCheckEnabled} onChange={(e) => setAiCheckEnabled(e.target.checked)} disabled={!templateId} />
              <span className="switch-ui" aria-hidden="true" />
              <span className="switch-text">{t('side.aiCheck')}</span>
            </label>
            <label className="switch">
              <input type="checkbox" checked={aiAnalyzeEnabled} onChange={(e) => setAiAnalyzeEnabled(e.target.checked)} />
              <span className="switch-ui" aria-hidden="true" />
              <span className="switch-text">{t('side.aiAnalyze')}</span>
            </label>
          </div>
        </div>
        <div className="side-actions-cta">
          <button className="btn-primary btn-compare" onClick={onCompare} disabled={compareDisabled}>
            {loading ? t('side.compare.loading') : t('side.compare.start')}
          </button>
          <button className="btn-secondary btn-reset" onClick={onReset} disabled={resetDisabled} title={t('side.reset.title')}>
            {t('side.reset')}
          </button>
        </div>
      </div>
    </div>
  )
}

