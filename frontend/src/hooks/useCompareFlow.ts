import React from 'react'
import { api } from '../api'
import type { AlignmentRow, Block, CheckAiResult, CheckRunResponse, TemplateMatchResponse } from '../domain/types'

const TEMPLATE_MATCH_THRESHOLD = 0.84

type Params = {
  t: (key: string, params?: Record<string, unknown>) => string
  errText: (e: unknown) => string
  reportError: (e: unknown) => void

  templateId: string
  setTemplateId: (v: string) => void
  aiAnalyzeEnabled: boolean
  setAiCheckEnabled: (v: boolean) => void

  leftBlocks: Block[]
  rightBlocks: Block[]
  setLeftBlocks: (v: Block[] | ((prev: Block[]) => Block[])) => void
  setRightBlocks: (v: Block[] | ((prev: Block[]) => Block[])) => void

  setLeftFile: (v: File | null) => void
  setRightFile: (v: File | null) => void

  diffRows: AlignmentRow[]
  setDiffRows: (v: AlignmentRow[]) => void

  setLoading: (v: boolean) => void
  setError: (v: string | ((prev: string) => string)) => void

  setActiveDiffIndex: (v: number) => void
  setActiveRowId: (v: string | null | ((prev: string | null) => string | null)) => void

  checkRun: CheckRunResponse | null
  setCheckRun: (v: CheckRunResponse | null) => void
  setCheckPaneOpen: (v: boolean | ((prev: boolean) => boolean)) => void
  setCheckLoading: (v: boolean) => void
  checkFilter: 'all' | 'issues'
  setCheckFilter: (v: 'all' | 'issues') => void

  showOnlyDiff: boolean
  setShowOnlyDiff: (v: boolean) => void

  uploadPaneCollapsed: boolean
  setUploadPaneCollapsed: (v: boolean) => void

  globalAnalyzeLoading: boolean
  globalAnalyzeRaw: string | null
  setGlobalAnalyzeLoading: (v: boolean) => void
  setGlobalAnalyzeRaw: (v: string | null) => void
  setGlobalPaneOpen: (v: boolean) => void

  runChecks: (tid: string, blocks: Block[], opts?: { signal?: AbortSignal }) => Promise<CheckRunResponse | null>
  runGlobalAnalyze: (rows: AlignmentRow[], cr: CheckRunResponse | null, opts?: { signal?: AbortSignal }) => Promise<void>

  scrollToRow: (rowId: string) => void
}

export const useCompareFlow = (p: Params) => {
  const parseAbortRef = React.useRef<AbortController | null>(null)
  const compareAbortRef = React.useRef<AbortController | null>(null)

  const loadTemplateBlocksForCompare = React.useCallback(
    async (tid: string, opts?: { signal?: AbortSignal }) => {
      try {
        return await api.templates.getLatest(tid, opts)
      } catch (e) {
        throw new Error(p.t('error.template.loadStandard', { message: p.errText(e) }))
      }
    },
    [p]
  )

  const parseFile = React.useCallback(
    async (file: File, side: 'left' | 'right') => {
      parseAbortRef.current?.abort()
      const controller = new AbortController()
      parseAbortRef.current = controller

      p.setLoading(true)
      p.setError('')
      try {
        let blocks: Block[] = []
        try {
          blocks = await api.parseDoc(file, { signal: controller.signal })
        } catch (e) {
          throw new Error(
            p.t('error.file.parse', {
              side: side === 'left' ? p.t('side.leftShort') : p.t('side.rightShort'),
              message: p.errText(e)
            })
          )
        }
        if (side === 'left') p.setLeftBlocks(blocks)
        else {
          p.setRightBlocks(blocks)
          try {
            const obj: TemplateMatchResponse = await api.templates.match(blocks, { signal: controller.signal })
            const best = obj?.best || null
            const score = typeof best?.score === 'number' ? best.score : null
            const tid = typeof best?.templateId === 'string' ? best.templateId : ''
            if (score !== null && tid && score >= TEMPLATE_MATCH_THRESHOLD) {
              p.setTemplateId(tid)
              if (p.leftBlocks.length === 0) {
                const { blocks: tplBlocks, name } = await loadTemplateBlocksForCompare(tid, { signal: controller.signal })
                p.setLeftBlocks(tplBlocks)
                const label = (name || tid || p.t('label.standardTemplate')).trim()
                p.setLeftFile(
                  new File([], p.t('filename.standardTemplate', { label }), {
                    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
                  })
                )
              }
            } else {
              p.setTemplateId('')
            }
          } catch {
            p.setTemplateId('')
          }
        }
      } catch (err) {
        p.reportError(err)
      } finally {
        if (parseAbortRef.current === controller) parseAbortRef.current = null
        p.setLoading(false)
      }
    },
    [loadTemplateBlocksForCompare, p]
  )

  const runDiffCore = React.useCallback(
    async (left: Block[], right: Block[], templateIdForCheck: string | undefined, signal: AbortSignal) => {
      let rows: AlignmentRow[] = []
      try {
        rows = await api.diff(left, right, { signal })
      } catch (e) {
        throw new Error(p.t('error.diff', { message: p.errText(e) }))
      }
      p.setDiffRows(rows)
      p.setActiveDiffIndex(0)
      p.setActiveRowId(null)
      p.setCheckRun(null)
      p.setCheckPaneOpen(false)
      p.setUploadPaneCollapsed(true)
      const effectiveTemplateId = (templateIdForCheck ?? p.templateId).trim()
      const cr = effectiveTemplateId ? await p.runChecks(effectiveTemplateId, right, { signal }) : null
      if (p.aiAnalyzeEnabled) {
        await p.runGlobalAnalyze(rows, cr, { signal })
      } else {
        p.setGlobalAnalyzeRaw(null)
      }
    },
    [p]
  )

  const compareUsingTemplate = React.useCallback(
    async (tid: string, signal: AbortSignal) => {
      if (!tid) return
      if (p.rightBlocks.length === 0) {
        p.setError(p.t('error.needParseRight'))
        return
      }
      const { blocks, name } = await loadTemplateBlocksForCompare(tid, { signal })
      p.setLeftBlocks(blocks)
      const label = (name || tid || p.t('label.standardTemplate')).trim()
      p.setLeftFile(
        new File([], p.t('filename.standardTemplate', { label }), {
          type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        })
      )
      await runDiffCore(blocks, p.rightBlocks, tid, signal)
    },
    [loadTemplateBlocksForCompare, p, runDiffCore]
  )

  const handleDiff = React.useCallback(async () => {
    compareAbortRef.current?.abort()
    const controller = new AbortController()
    compareAbortRef.current = controller

    if (p.rightBlocks.length === 0) {
      p.setError(p.t('error.needParseRight'))
      return
    }
    if (p.leftBlocks.length === 0) {
      if (p.templateId) {
        p.setLoading(true)
        p.setError('')
        try {
          await compareUsingTemplate(p.templateId, controller.signal)
        } catch (err) {
          p.reportError(err)
        } finally {
          if (compareAbortRef.current === controller) compareAbortRef.current = null
          p.setLoading(false)
        }
        return
      }
      p.setError(p.t('error.needParseLeftOrTemplate'))
      return
    }

    p.setLoading(true)
    p.setError('')
    try {
      await runDiffCore(p.leftBlocks, p.rightBlocks, p.templateId, controller.signal)
    } catch (err) {
      p.reportError(err)
    } finally {
      if (compareAbortRef.current === controller) compareAbortRef.current = null
      p.setLoading(false)
    }
  }, [compareUsingTemplate, p, runDiffCore])

  const resetAll = React.useCallback(() => {
    parseAbortRef.current?.abort()
    compareAbortRef.current?.abort()
    parseAbortRef.current = null
    compareAbortRef.current = null

    p.setLeftFile(null)
    p.setRightFile(null)
    p.setLeftBlocks([])
    p.setRightBlocks([])
    p.setDiffRows([])
    p.setActiveDiffIndex(0)
    p.setActiveRowId(null)
    p.setError('')
    p.setCheckLoading(false)
    p.setCheckRun(null)
    p.setCheckPaneOpen(false)
    p.setGlobalAnalyzeLoading(false)
    p.setGlobalAnalyzeRaw(null)
    p.setGlobalPaneOpen(false)
    p.setUploadPaneCollapsed(false)
    p.setShowOnlyDiff(false)
    p.setTemplateId('')
    p.setAiCheckEnabled(false)
  }, [p])

  const getAiText = React.useCallback((ai: CheckAiResult | null | undefined) => {
    if (!ai) return ''
    const s = typeof ai.summary === 'string' ? ai.summary.trim() : ''
    if (s) return s
    const raw = typeof ai.raw === 'string' ? ai.raw.trim() : ''
    if (!raw) return ''
    if (raw.length <= 240) return raw
    return `${raw.slice(0, 240)}…`
  }, [])

  const diffOnlyRows = React.useMemo(() => p.diffRows.filter((r) => r.kind !== 'matched'), [p.diffRows])

  const visibleRows = React.useMemo(() => {
    const rightBlockIdsWithIssues = new Set<string>()
    ;(p.checkRun?.items || []).forEach((it) => {
      const id = it.evidence?.rightBlockId || null
      if (id && it.status !== 'pass') rightBlockIdsWithIssues.add(id)
    })

    const baseRows = p.showOnlyDiff ? diffOnlyRows : p.diffRows
    return baseRows.filter((r) => {
      if (p.checkFilter !== 'issues' || !p.checkRun) return true
      if (!r.rightBlockId) return false
      return rightBlockIdsWithIssues.has(r.rightBlockId)
    })
  }, [diffOnlyRows, p.checkFilter, p.checkRun, p.diffRows, p.showOnlyDiff])

  const jumpToDiff = React.useCallback(
    (nextIndex: number) => {
      if (diffOnlyRows.length === 0) return
      const i = Math.min(Math.max(nextIndex, 0), diffOnlyRows.length - 1)
      p.setActiveDiffIndex(i)
      p.scrollToRow(diffOnlyRows[i].rowId)
    },
    [diffOnlyRows, p]
  )

  const toggleShowOnlyDiff = React.useCallback(
    (checked: boolean) => {
      p.setShowOnlyDiff(checked)
      p.setActiveDiffIndex(0)
    },
    [p]
  )

  const toggleIssuesOnly = React.useCallback(
    (checked: boolean) => {
      p.setCheckFilter(checked ? 'issues' : 'all')
    },
    [p]
  )

  return {
    parseFile,
    handleDiff,
    resetAll,
    getAiText,
    diffOnlyRows,
    visibleRows,
    jumpToDiff,
    toggleShowOnlyDiff,
    toggleIssuesOnly
  }
}
