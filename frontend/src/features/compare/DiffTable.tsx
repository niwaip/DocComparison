import React from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
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

export type DiffTableHandle = {
  scrollToRowId: (rowId: string) => void
}

const DiffTable = React.forwardRef<DiffTableHandle, Props>(function DiffTable(props, ref) {
  const { rows, leftBlocks, rightBlocks, checkPaneOpen, checkRun, checkFilter, activeRowId, aiCheckEnabled, checkLoading, getAiText } = props
  const { t } = useI18n()

  const isVirtual = rows.length >= 400
  const idToIndex = React.useMemo(() => new Map(rows.map((r, i) => [r.rowId, i])), [rows])

  const leftBlockById = React.useMemo(() => new Map(leftBlocks.map((b) => [b.blockId, b])), [leftBlocks])
  const rightBlockById = React.useMemo(() => new Map(rightBlocks.map((b) => [b.blockId, b])), [rightBlocks])

  const checkItemsByRightBlockId = React.useMemo(() => {
    if (!checkPaneOpen) return new Map<string, NonNullable<CheckRunResponse['items']>>()
    const items = checkRun?.items || []
    const map = new Map<string, NonNullable<CheckRunResponse['items']>>()
    for (const it of items) {
      const id = it.evidence?.rightBlockId || ''
      if (!id) continue
      if (checkFilter === 'issues' && it.status === 'pass') continue
      const arr = map.get(id)
      if (arr) arr.push(it)
      else map.set(id, [it])
    }
    return map
  }, [checkFilter, checkPaneOpen, checkRun?.items])

  const parentRef = React.useRef<HTMLDivElement | null>(null)
  const rowVirtualizer = useVirtualizer({
    count: isVirtual ? rows.length : 0,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 220,
    overscan: 10
  })

  React.useImperativeHandle(
    ref,
    () => ({
      scrollToRowId: (rowId: string) => {
        const idx = idToIndex.get(rowId)
        if (idx === undefined) return
        if (isVirtual) {
          rowVirtualizer.scrollToIndex(idx, { align: 'center', behavior: 'smooth' })
          return
        }
        const el = document.getElementById(`row-${rowId}`)
        if (!el) return
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }),
    [idToIndex, isVirtual, rowVirtualizer]
  )

  const renderCheckCell = (row: AlignmentRow, rowVisibleCheckItems: NonNullable<CheckRunResponse['items']>) => {
    if (!checkPaneOpen) return null
    return (
      <div className="diff-check-cell">
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
                  <div
                    key={it.pointId}
                    id={checkDomId(it.pointId)}
                    data-point-id={it.pointId}
                    style={{ border: '1px solid var(--control-border)', borderRadius: 12, padding: 10, background: 'rgba(255,255,255,0.06)' }}
                  >
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
      </div>
    )
  }

  const gridColumns = checkPaneOpen
    ? 'calc((100% - 24px) * 0.34) 24px calc((100% - 24px) * 0.34) calc((100% - 24px) * 0.32)'
    : 'calc((100% - 24px) / 2) 24px calc((100% - 24px) / 2)'

  if (isVirtual) {
    const virtualItems = rowVirtualizer.getVirtualItems()
    const totalSize = rowVirtualizer.getTotalSize()

    return (
      <div className="diff-container diff-container-virtual" ref={parentRef}>
        <div className="diff-grid-head" style={{ gridTemplateColumns: gridColumns }}>
          <div className="diff-grid-head-cell" style={{ textAlign: 'center' }}>
            {t('diff.left')}
          </div>
          <div className="diff-grid-head-divider" />
          <div className="diff-grid-head-cell" style={{ textAlign: 'center' }}>
            {t('diff.right')}
          </div>
          {checkPaneOpen && (
            <div className="diff-grid-head-cell">
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
            </div>
          )}
        </div>

        <div style={{ height: totalSize, position: 'relative' }}>
          {virtualItems.map((vr) => {
            const row = rows[vr.index]
            const leftBlock = row.leftBlockId ? leftBlockById.get(row.leftBlockId) || null : null
            const rightBlock = row.rightBlockId ? rightBlockById.get(row.rightBlockId) || null : null
            const rowVisibleCheckItems = checkPaneOpen && row.rightBlockId ? (checkItemsByRightBlockId.get(row.rightBlockId) || []) : []

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
              <div
                key={row.rowId}
                ref={rowVirtualizer.measureElement}
                data-index={vr.index}
                id={`row-${row.rowId}`}
                data-row-id={row.rowId}
                className={`diff-grid-row ${rowClass}${activeRowId === row.rowId ? ' diff-row-active' : ''}`}
                style={{ gridTemplateColumns: gridColumns, position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${vr.start}px)` }}
              >
                <div className="diff-grid-cell">
                  {leftBlock ? (
                    <div>
                      {row.kind === 'changed' && row.leftDiffHtml ? (
                        <div className="block-content" dangerouslySetInnerHTML={{ __html: row.leftDiffHtml }} />
                      ) : (
                        <div className="block-content" dangerouslySetInnerHTML={{ __html: leftBlock.htmlFragment }} />
                      )}
                    </div>
                  ) : null}
                </div>

                <div className="status-cell">{icon}</div>

                <div className="diff-grid-cell">
                  {rightBlock ? (
                    <div>
                      {row.kind === 'changed' && row.rightDiffHtml ? (
                        <div className="block-content" dangerouslySetInnerHTML={{ __html: row.rightDiffHtml }} />
                      ) : (
                        <div className="block-content" dangerouslySetInnerHTML={{ __html: rightBlock.htmlFragment }} />
                      )}
                    </div>
                  ) : null}
                </div>

                {checkPaneOpen && renderCheckCell(row, rowVisibleCheckItems)}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

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
            const leftBlock = row.leftBlockId ? leftBlockById.get(row.leftBlockId) || null : null
            const rightBlock = row.rightBlockId ? rightBlockById.get(row.rightBlockId) || null : null
            const rowVisibleCheckItems = checkPaneOpen && row.rightBlockId ? (checkItemsByRightBlockId.get(row.rightBlockId) || []) : []

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
                  <td className="diff-check-td">{renderCheckCell(row, rowVisibleCheckItems)}</td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
})

export default DiffTable
