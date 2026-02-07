import React from 'react'
import { useI18n } from '../../i18n'
import type { CheckAiResult, CheckRunResponse } from '../../domain/types'
import { checkDomId } from './checkDom'

type Props = {
  checkRun: CheckRunResponse
  checkFilter: 'all' | 'issues'
  getAiText: (ai: CheckAiResult | null | undefined) => string
}

export default function CheckPanel(props: Props) {
  const { checkRun, checkFilter, getAiText } = props
  const { t } = useI18n()

  const items = checkRun.items.filter((it) => (checkFilter === 'all' ? true : it.status !== 'pass'))

  return (
    <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', padding: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ fontWeight: 800 }}>{t('check.title')}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          {(checkRun.templateId || checkRun.templateVersion) && (
            <div
              style={{
                fontSize: 12,
                color: 'var(--muted)',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: 260
              }}
              title={`${checkRun.templateId || ''}${checkRun.templateVersion ? `@${checkRun.templateVersion}` : ''}`}
            >
              {checkRun.templateId}
              {checkRun.templateVersion ? `@${checkRun.templateVersion}` : ''}
            </div>
          )}
          {checkRun.runId && (
            <div style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace' }}>
              {checkRun.runId}
            </div>
          )}
        </div>
      </div>
      <div style={{ marginTop: 10, fontSize: 12, color: 'var(--muted)' }}>
        {t('check.summary', {
          pass: checkRun.summary?.counts?.pass ?? 0,
          fail: checkRun.summary?.counts?.fail ?? 0,
          warn: checkRun.summary?.counts?.warn ?? 0,
          manual: checkRun.summary?.counts?.manual ?? 0
        })}
      </div>
      {items.length > 0 ? (
        <div style={{ marginTop: 10, display: 'grid', gap: 8, paddingRight: 2 }}>
          {items.map((it) => {
            const color =
              it.status === 'fail'
                ? 'rgba(185, 28, 28, 1)'
                : it.status === 'warn'
                  ? 'rgba(146, 64, 14, 1)'
                  : it.status === 'manual'
                    ? 'rgba(30, 64, 175, 1)'
                    : 'var(--text)'
            const bg =
              it.status === 'fail'
                ? 'rgba(239,68,68,0.10)'
                : it.status === 'warn'
                  ? 'rgba(245,158,11,0.14)'
                  : it.status === 'manual'
                    ? 'rgba(37,99,235,0.10)'
                    : 'rgba(255,255,255,0.06)'

            return (
              <div key={it.pointId} id={checkDomId(it.pointId)} data-point-id={it.pointId} style={{ border: '1px solid var(--control-border)', borderRadius: 12, padding: 10, background: bg }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <div style={{ fontWeight: 750, lineHeight: 1.25 }}>{it.title}</div>
                  <div style={{ fontSize: 11, fontWeight: 800, color }}>{it.status.toUpperCase()}</div>
                </div>
                <div style={{ marginTop: 6, fontSize: 13, color: 'var(--text)' }}>{it.message}</div>
                {it.evidence?.excerpt && <div style={{ marginTop: 6, fontSize: 12, color: 'var(--muted)' }}>{it.evidence.excerpt}</div>}
                {getAiText(it.ai) && (
                  <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px dashed var(--control-border)', fontSize: 12, color: 'var(--muted)' }}>
                    AI：{getAiText(it.ai)}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <div style={{ marginTop: 10, fontSize: 13, color: 'var(--muted)' }}>
          {checkFilter === 'issues' ? t('check.empty.issues') : t('check.empty.all')}
        </div>
      )}
    </div>
  )
}
