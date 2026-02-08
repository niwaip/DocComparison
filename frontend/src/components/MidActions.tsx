import React from 'react'
import { useI18n } from '../i18n'

type Props = {
  showOnlyDiff: boolean
  onToggleShowOnlyDiff: (checked: boolean) => void

  hasDiffOnlyRows: boolean
  onPrevDiff: () => void
  onNextDiff: () => void

  checkPaneOpen: boolean
  onToggleCheckPane: () => void
  checkRunExists: boolean

  checkFilter: 'all' | 'issues'
  onToggleIssuesOnly: (checked: boolean) => void

  globalPaneOpen: boolean
  onToggleGlobalPane: () => Promise<void>
  diffRowsCount: number
  aiAnalyzeEnabled: boolean
  globalAnalyzeLoading: boolean

  aiCheckEnabled: boolean
  checkLoading: boolean
}

export default function MidActions(props: Props) {
  const {
    showOnlyDiff,
    onToggleShowOnlyDiff,
    hasDiffOnlyRows,
    onPrevDiff,
    onNextDiff,
    checkPaneOpen,
    onToggleCheckPane,
    checkRunExists,
    checkFilter,
    onToggleIssuesOnly,
    globalPaneOpen,
    onToggleGlobalPane,
    diffRowsCount,
    aiAnalyzeEnabled,
    globalAnalyzeLoading,
    aiCheckEnabled,
    checkLoading
  } = props

  const { t } = useI18n()

  return (
    <div className="mid-actions">
      <label className="switch" title={t('mid.showOnlyDiff.title')}>
        <input type="checkbox" checked={showOnlyDiff} onChange={(e) => onToggleShowOnlyDiff(e.target.checked)} />
        <span className="switch-ui" aria-hidden="true" />
        <span className="switch-text">{t('mid.showOnlyDiff')}</span>
      </label>

      <button className="icon-btn" onClick={onPrevDiff} disabled={!hasDiffOnlyRows} title={t('mid.diff.prev')}>
        ↑
      </button>
      <button className="icon-btn" onClick={onNextDiff} disabled={!hasDiffOnlyRows} title={t('mid.diff.next')}>
        ↓
      </button>

      <button className="icon-btn" title={checkPaneOpen ? t('mid.checkPane.collapse') : t('mid.checkPane.expand')} onClick={onToggleCheckPane} disabled={!checkRunExists}>
        {checkPaneOpen ? '🧾▾' : '🧾▸'}
      </button>

      <label className="switch" title={t('mid.checkFilter.title')}>
        <input type="checkbox" checked={checkFilter === 'issues'} onChange={(e) => onToggleIssuesOnly(e.target.checked)} />
        <span className="switch-ui" aria-hidden="true" />
        <span className="switch-text">{checkFilter === 'issues' ? t('mid.checkFilter.issuesOnly') : t('mid.checkFilter.all')}</span>
      </label>

      <button
        className="icon-btn"
        title={globalPaneOpen ? t('mid.globalPane.collapse') : t('mid.globalPane.expand')}
        onClick={async () => {
          await onToggleGlobalPane()
        }}
        disabled={diffRowsCount === 0 || !aiAnalyzeEnabled}
      >
        {globalPaneOpen ? '🧠▾' : '🧠▸'}
      </button>

      {aiAnalyzeEnabled && globalAnalyzeLoading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 6 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>{t('mid.globalAnalyze.loading')}</div>
          <div className="scrollbar-progress" aria-hidden="true">
            <div className="thumb" />
          </div>
        </div>
      )}

      {aiCheckEnabled && checkLoading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 6 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>{t('mid.check.loading')}</div>
          <div className="scrollbar-progress" aria-hidden="true">
            <div className="thumb" />
          </div>
        </div>
      )}
    </div>
  )
}
