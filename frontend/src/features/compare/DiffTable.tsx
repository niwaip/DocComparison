import React from 'react'
import { useI18n } from '../../i18n'
import type { AlignmentRow, Block, CheckAiResult, CheckRunResponse } from '../../domain/types'
import { checkDomId } from '../check/checkDom'

type Props = {
  rows: AlignmentRow[]
  leftBlocks: Block[]
  rightBlocks: Block[]

  checkPaneOpen: boolean
  checkRun: CheckRunResponse | null
  checkFilter: 'all' | 'issues'

  activeRowId: string | null
  aiCheckEnabled: boolean
  checkLoading: boolean

  getAiText: (ai: CheckAiResult | null | undefined) => string
}

const getBlock = (blocks: Block[], id: string | null) => {
  if (!id) return null
  return blocks.find((b) => b.blockId === id) || null
}

export default function DiffTable(props: Props) {
  const { rows, leftBlocks, rightBlocks, checkPaneOpen, checkRun, checkFilter, activeRowId, aiCheckEnabled, checkLoading, getAiText } = props
  const { t } = useI18n()

  return (
    <div className="diff-container">
      <table>
        <colgroup>
          <col style={{ width: checkPaneOpen ? 'calc((100% - 24px) * 0.34)' : 'calc((100% - 24px) / 2)' }} />
          <col style={{ width: '24px' }} />
          <col style={{ width: checkPaneOpen ? 'calc((100% - 24px) * 0.34)' : 'calc((100% - 24px) / 2)' }} />
          {checkPaneOpen && <col style={{ width: 'calc((100% - 24px) * 0.32)' }} />}
        </colgroup>
        <thead>
          <tr>
            <th style={{ textAlign: 'center' }}>{t('diff.left')}</th>
            <th className="status-divider"></th>
            <th style={{ textAlign: 'center' }}>{t('diff.right')}</th>
            {checkPaneOpen && (
              <th>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, minWidth: 0 }}>
                  <div>{t('check.title')}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    {checkRun ? (
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                        {t('check.summary', {
                          pass: checkRun.summary?.counts?.pass ?? 0,
                          fail: checkRun.summary?.counts?.fail ?? 0,
                          warn: checkRun.summary?.counts?.warn ?? 0,
                          manual: checkRun.summary?.counts?.manual ?? 0
                        })}
                      </div>
                    ) : (
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>{t('check.notRun')}</div>
                    )}
                    {aiCheckEnabled && checkLoading && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{t('mid.check.loading')}</div>
                        <div className="scrollbar-progress" aria-hidden="true">
                          <div className="thumb" />
                        </div>
                      </div>
                    )}
                    {!aiCheckEnabled && checkLoading && <div style={{ fontSize: 11, color: 'var(--muted)' }}>{t('check.loading')}</div>}
                  </div>
                </div>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const leftBlock = getBlock(leftBlocks, row.leftBlockId)
            const rightBlock = getBlock(rightBlocks, row.rightBlockId)
            const rowAllCheckItems = checkPaneOpen
              ? (checkRun?.items || []).filter((it) => (it.evidence?.rightBlockId || null) === (row.rightBlockId || null) && !!row.rightBlockId)
              : []
            const rowVisibleCheckItems = checkPaneOpen ? rowAllCheckItems.filter((it) => (checkFilter === 'all' ? true : it.status !== 'pass')) : []

            let rowClass = ''
            let icon = ''

            if (row.kind === 'inserted') {
              rowClass = 'bg-inserted'
              icon = '+'
            } else if (row.kind === 'deleted') {
              rowClass = 'bg-deleted'
              icon = '-'
            } else if (row.kind === 'changed') {
              rowClass = 'bg-changed'
              icon = '•'
            }

            return (
              <tr key={row.rowId} id={`row-${row.rowId}`} data-row-id={row.rowId} className={`${rowClass}${activeRowId === row.rowId ? ' diff-row-active' : ''}`}>
                <td>
                  {leftBlock ? (
                    <div>
                      {row.kind === 'changed' && row.leftDiffHtml ? (
                        <div className="block-content" dangerouslySetInnerHTML={{ __html: row.leftDiffHtml }} />
                      ) : (
                        <div className="block-content" dangerouslySetInnerHTML={{ __html: leftBlock.htmlFragment }} />
                      )}
                    </div>
                  ) : null}
                </td>

                <td className="status-cell">{icon}</td>

                <td>
                  {rightBlock ? (
                    <div>
                      {row.kind === 'changed' && row.rightDiffHtml ? (
                        <div className="block-content" dangerouslySetInnerHTML={{ __html: row.rightDiffHtml }} />
                      ) : (
                        <div className="block-content" dangerouslySetInnerHTML={{ __html: rightBlock.htmlFragment }} />
                      )}
                    </div>
                  ) : null}
                </td>

                {checkPaneOpen && (
                  <td style={{ borderLeft: '1px solid var(--border)', background: 'rgba(255,255,255,0.04)', minWidth: 0, overflow: 'hidden' }}>
                    {checkRun ? (
                      rowVisibleCheckItems.length > 0 ? (
                        <div style={{ display: 'grid', gap: 8 }}>
                          {rowVisibleCheckItems.map((it) => {
                            const color =
                              it.status === 'fail'
                                ? 'rgba(185, 28, 28, 1)'
                                : it.status === 'warn'
                                  ? 'rgba(146, 64, 14, 1)'
                                  : it.status === 'manual'
                                    ? 'rgba(30, 64, 175, 1)'
                                    : it.status === 'error'
                                      ? 'rgba(185, 28, 28, 1)'
                                      : 'var(--text)'
                            const tagBg =
                              it.status === 'fail'
                                ? 'rgba(239,68,68,0.10)'
                                : it.status === 'warn'
                                  ? 'rgba(245,158,11,0.14)'
                                  : it.status === 'manual'
                                    ? 'rgba(37,99,235,0.10)'
                                    : it.status === 'error'
                                      ? 'rgba(239,68,68,0.10)'
                                      : 'var(--divider-bg)'

                            return (
                              <div key={it.pointId} id={checkDomId(it.pointId)} data-point-id={it.pointId} style={{ border: '1px solid var(--control-border)', borderRadius: 12, padding: 10, background: 'rgba(255,255,255,0.06)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                                  <div style={{ fontWeight: 750, lineHeight: 1.25 }}>{it.title}</div>
                                  <div style={{ fontSize: 11, fontWeight: 800, color, background: tagBg, padding: '3px 8px', borderRadius: 999 }}>{it.status.toUpperCase()}</div>
                                </div>
                                <div style={{ marginTop: 6, fontSize: 13, color: 'var(--text)', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{it.message}</div>
                                {getAiText(it.ai) && (
                                  <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px dashed var(--control-border)', fontSize: 12, color: 'var(--muted)', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                                    {t('label.ai')}
                                    {getAiText(it.ai)}
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      ) : (
                        <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                          {!row.rightBlockId ? t('evidence.none') : checkFilter === 'issues' ? t('evidence.none') : t('check.cell.none')}
                        </div>
                      )
                    ) : (
                      <div style={{ fontSize: 12, color: 'var(--muted)' }}>{t('evidence.none')}</div>
                    )}
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
