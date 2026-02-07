import React, { useCallback, useEffect, useMemo, useReducer } from 'react'
import ContractRulesModal from './ContractRulesModal'
import { api } from './api'
import HeaderBar from './components/HeaderBar'
import MidActions from './components/MidActions'
import SideActions from './components/SideActions'
import GlobalAnalyzePanel from './features/analyze/GlobalAnalyzePanel'
import CheckPanel from './features/check/CheckPanel'
import DiffTable from './features/compare/DiffTable'
import FileUploadCard from './features/compare/FileUploadCard'
import { detectFieldsFromBlock } from './domain/fieldDetection'
import { escapeRegex, hashString } from './domain/textUtils'
import { I18nProvider, createT, normalizeLang, type Lang } from './i18n'
import type {
  AlignmentRow,
  Block,
  CheckAiResult,
  CheckRunResponse,
  DetectedField,
  FieldRuleState,
  GlobalAnalyzeResponse,
  GlobalPromptConfig,
  RulesetAnchor,
  Ruleset,
  RulesetPoint,
  TemplateListItem,
  TemplateMatchResponse
} from './domain/types'

const TEMPLATE_MATCH_THRESHOLD = 0.84

// --- Component ---

class AppErrorBoundary extends React.Component<
  { onError: (e: Error) => void; children: React.ReactNode },
  { hasError: boolean }
> {
  state: { hasError: boolean } = { hasError: false }

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true }
  }

  componentDidCatch(error: Error) {
    this.props.onError(error)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-msg">
          <span>⚠️</span> 页面渲染出错，请刷新后重试。
        </div>
      )
    }
    return this.props.children
  }
}

type AppState = {
  lang: Lang
  leftFile: File | null
  rightFile: File | null

  leftBlocks: Block[]
  rightBlocks: Block[]

  diffRows: AlignmentRow[]
  loading: boolean
  error: string
  showOnlyDiff: boolean
  activeDiffIndex: number
  activeRowId: string | null
  configOpen: boolean
  templateId: string
  aiCheckEnabled: boolean
  aiAnalyzeEnabled: boolean
  uploadPaneCollapsed: boolean
  checkLoading: boolean
  checkRun: CheckRunResponse | null
  checkFilter: 'all' | 'issues'
  checkPaneOpen: boolean
  theme: 'dark' | 'light'
  rulesetLoading: boolean

  templateBlocks: Block[]
  templateIndex: TemplateListItem[]
  templateIndexLoading: boolean
  newTemplateId: string
  newTemplateName: string
  newTemplateVersion: string
  templateDraftFile: File | null
  fieldRules: Record<string, FieldRuleState>
  blockPrompts: Record<string, string>

  globalPromptCfg: GlobalPromptConfig | null
  globalPromptLoading: boolean
  globalPromptDefaultDraft: string
  globalPromptTemplateDraft: string
  globalAnalyzeLoading: boolean
  globalAnalyzeRaw: string | null
  globalAnalyzeShowRaw: boolean
  globalPaneOpen: boolean
}

type AppAction =
  | { type: 'set'; key: keyof AppState; value: AppState[keyof AppState] }
  | { type: 'update'; key: keyof AppState; updater: (prev: AppState[keyof AppState]) => AppState[keyof AppState] }

const appInitialState = (): AppState => {
  const lang = normalizeLang((typeof window !== 'undefined' ? window.localStorage?.getItem('doccmp.lang') : null) || undefined)
  const t = createT(lang)
  return {
    lang,
    leftFile: null,
    rightFile: null,

  leftBlocks: [],
  rightBlocks: [],

  diffRows: [],
  loading: false,
  error: '',
  showOnlyDiff: false,
  activeDiffIndex: 0,
  activeRowId: null,
  configOpen: false,
  templateId: 'sales_contract_cn',
  aiCheckEnabled: false,
  aiAnalyzeEnabled: false,
  uploadPaneCollapsed: false,
  checkLoading: false,
  checkRun: null,
  checkFilter: 'all',
  checkPaneOpen: false,
  theme: 'dark',
  rulesetLoading: false,

  templateBlocks: [],
  templateIndex: [],
  templateIndexLoading: false,
    newTemplateId: 'sales_contract_cn',
    newTemplateName: t('template.defaultName.sales'),
    newTemplateVersion: new Date().toISOString().slice(0, 10),
  templateDraftFile: null,
  fieldRules: {},
  blockPrompts: {},

  globalPromptCfg: null,
  globalPromptLoading: false,
  globalPromptDefaultDraft: '',
  globalPromptTemplateDraft: '',
  globalAnalyzeLoading: false,
  globalAnalyzeRaw: null,
    globalAnalyzeShowRaw: false,
    globalPaneOpen: false
  }
}

const appReducer = (state: AppState, action: AppAction): AppState => {
  if (action.type === 'set') {
    if (state[action.key] === action.value) return state
    return { ...state, [action.key]: action.value } as AppState
  }
  if (action.type === 'update') {
    const prev = state[action.key]
    const next = action.updater(prev)
    if (prev === next) return state
    return { ...state, [action.key]: next } as AppState
  }
  return state
}

function App() {
  const [state, dispatch] = useReducer(appReducer, undefined, appInitialState)
  const {
    lang,
    leftFile,
    rightFile,
    leftBlocks,
    rightBlocks,
    diffRows,
    loading,
    error,
    showOnlyDiff,
    activeDiffIndex,
    activeRowId,
    configOpen,
    templateId,
    aiCheckEnabled,
    aiAnalyzeEnabled,
    uploadPaneCollapsed,
    checkLoading,
    checkRun,
    checkFilter,
    checkPaneOpen,
    theme,
    rulesetLoading,
    templateBlocks,
    templateIndex,
    templateIndexLoading,
    newTemplateId,
    newTemplateName,
    newTemplateVersion,
    templateDraftFile,
    fieldRules,
    blockPrompts,
    globalPromptCfg,
    globalPromptLoading,
    globalPromptDefaultDraft,
    globalPromptTemplateDraft,
    globalAnalyzeLoading,
    globalAnalyzeRaw,
    globalAnalyzeShowRaw,
    globalPaneOpen
  } = state

  const setters = useMemo(() => {
    const makeSetter = <K extends keyof AppState>(key: K) => {
      return (valueOrUpdater: AppState[K] | ((prev: AppState[K]) => AppState[K])) => {
        if (typeof valueOrUpdater === 'function') {
          const typedUpdater = valueOrUpdater as (prev: AppState[K]) => AppState[K]
          const updater = (prev: AppState[keyof AppState]) => typedUpdater(prev as AppState[K]) as AppState[keyof AppState]
          dispatch({ type: 'update', key, updater })
        } else {
          dispatch({ type: 'set', key, value: valueOrUpdater })
        }
      }
    }

    return {
      setLeftFile: makeSetter('leftFile'),
      setRightFile: makeSetter('rightFile'),
      setLeftBlocks: makeSetter('leftBlocks'),
      setRightBlocks: makeSetter('rightBlocks'),
      setDiffRows: makeSetter('diffRows'),
      setLoading: makeSetter('loading'),
      setError: makeSetter('error'),
      setShowOnlyDiff: makeSetter('showOnlyDiff'),
      setActiveDiffIndex: makeSetter('activeDiffIndex'),
      setActiveRowId: makeSetter('activeRowId'),
      setConfigOpen: makeSetter('configOpen'),
      setTemplateId: makeSetter('templateId'),
      setAiCheckEnabled: makeSetter('aiCheckEnabled'),
      setAiAnalyzeEnabled: makeSetter('aiAnalyzeEnabled'),
      setUploadPaneCollapsed: makeSetter('uploadPaneCollapsed'),
      setCheckLoading: makeSetter('checkLoading'),
      setCheckRun: makeSetter('checkRun'),
      setCheckFilter: makeSetter('checkFilter'),
      setCheckPaneOpen: makeSetter('checkPaneOpen'),
      setTheme: makeSetter('theme'),
      setRulesetLoading: makeSetter('rulesetLoading'),
      setTemplateBlocks: makeSetter('templateBlocks'),
      setTemplateIndex: makeSetter('templateIndex'),
      setTemplateIndexLoading: makeSetter('templateIndexLoading'),
      setNewTemplateId: makeSetter('newTemplateId'),
      setNewTemplateName: makeSetter('newTemplateName'),
      setNewTemplateVersion: makeSetter('newTemplateVersion'),
      setTemplateDraftFile: makeSetter('templateDraftFile'),
      setFieldRules: makeSetter('fieldRules'),
      setBlockPrompts: makeSetter('blockPrompts'),
      setGlobalPromptCfg: makeSetter('globalPromptCfg'),
      setGlobalPromptLoading: makeSetter('globalPromptLoading'),
      setGlobalPromptDefaultDraft: makeSetter('globalPromptDefaultDraft'),
      setGlobalPromptTemplateDraft: makeSetter('globalPromptTemplateDraft'),
      setGlobalAnalyzeLoading: makeSetter('globalAnalyzeLoading'),
      setGlobalAnalyzeRaw: makeSetter('globalAnalyzeRaw'),
      setGlobalAnalyzeShowRaw: makeSetter('globalAnalyzeShowRaw'),
      setGlobalPaneOpen: makeSetter('globalPaneOpen')
    }
  }, [dispatch])

  const {
    setLeftFile,
    setRightFile,
    setLeftBlocks,
    setRightBlocks,
    setDiffRows,
    setLoading,
    setError,
    setShowOnlyDiff,
    setActiveDiffIndex,
    setActiveRowId,
    setConfigOpen,
    setTemplateId,
    setAiCheckEnabled,
    setAiAnalyzeEnabled,
    setUploadPaneCollapsed,
    setCheckLoading,
    setCheckRun,
    setCheckFilter,
    setCheckPaneOpen,
    setTheme,
    setRulesetLoading,
    setTemplateBlocks,
    setTemplateIndex,
    setTemplateIndexLoading,
    setNewTemplateId,
    setNewTemplateName,
    setNewTemplateVersion,
    setTemplateDraftFile,
    setFieldRules,
    setBlockPrompts,
    setGlobalPromptCfg,
    setGlobalPromptLoading,
    setGlobalPromptDefaultDraft,
    setGlobalPromptTemplateDraft,
    setGlobalAnalyzeLoading,
    setGlobalAnalyzeRaw,
    setGlobalAnalyzeShowRaw,
    setGlobalPaneOpen
  } = setters

  const t = useMemo(() => createT(lang), [lang])
  const errText = useCallback((e: unknown) => (e instanceof Error ? e.message : String(e)), [])
  const reportError = useCallback((e: unknown) => {
    setError(errText(e))
  }, [errText, setError])
  const setLangInProvider = useCallback((next: Lang) => {
    dispatch({ type: 'set', key: 'lang', value: next })
  }, [dispatch])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  useEffect(() => {
    try {
      window.localStorage?.setItem('doccmp.lang', lang)
    } catch (err) {
      void err
    }
  }, [lang])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setTemplateIndexLoading(true)
      try {
        const next = await api.templates.list()
        if (cancelled) return
        setTemplateIndex(next)
      } catch {
        if (cancelled) return
      } finally {
        if (!cancelled) setTemplateIndexLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [setTemplateIndex, setTemplateIndexLoading])

  const templateNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const t of templateIndex) map.set(t.templateId, t.name || t.templateId)
    return map
  }, [templateIndex])

  const contractTypeOptions = useMemo(() => {
    const blank = { templateId: '', name: t('side.contractType.unmatched') }
    const base = templateIndex.map((t) => ({ templateId: t.templateId, name: t.name || t.templateId }))
    if (!templateId) return [blank, ...base]
    const exists = templateIndex.some((t) => t.templateId === templateId)
    if (exists) return [blank, ...base]
    return [blank, { templateId, name: templateNameById.get(templateId) || templateId }, ...base]
  }, [templateIndex, templateId, templateNameById, t])

  useEffect(() => {
    if (!globalPromptCfg) return
    setGlobalPromptTemplateDraft(globalPromptCfg?.byTemplateId?.[templateId] || '')
  }, [templateId, globalPromptCfg, setGlobalPromptTemplateDraft])

  useEffect(() => {
    if (templateId) return
    setAiCheckEnabled(false)
    setCheckRun(null)
    setCheckPaneOpen(false)
  }, [templateId, setAiCheckEnabled, setCheckPaneOpen, setCheckRun])

  const detectedFields = useMemo(() => {
    const all: DetectedField[] = []
    for (const b of templateBlocks) {
      all.push(...detectFieldsFromBlock(b))
    }
    return all
  }, [templateBlocks])

  useEffect(() => {
    const present = new Set(detectedFields.map((f) => f.fieldId))
    if (present.size === 0) {
      setFieldRules({})
      setBlockPrompts({})
      return
    }

    setFieldRules((prev) => {
      const next: Record<string, FieldRuleState> = {}
      for (const f of detectedFields) {
        const cur = prev[f.fieldId]
        if (cur) {
          next[f.fieldId] = cur
          continue
        }
        const isDate = f.kind === 'field' && /日期/.test(f.label)
        next[f.fieldId] = {
          requiredAfterColon: f.kind === 'field' && !/_{3,}|＿{3,}|—{3,}|－{3,}|-{3,}/.test(f.label),
          dateMonth: isDate,
          dateFormat: isDate,
          tableSalesItems: f.kind === 'table',
          aiPrompt: ''
        }
      }
      return next
    })

    const presentSp = new Set(detectedFields.map((f) => f.structurePath).filter(Boolean))
    setBlockPrompts((prev) => {
      const next: Record<string, string> = {}
      for (const k of Object.keys(prev)) {
        if (presentSp.has(k)) next[k] = prev[k]
      }
      return next
    })
  }, [detectedFields, setBlockPrompts, setFieldRules])

  const updateFieldRule = (fieldId: string, patch: Partial<FieldRuleState>) => {
    setFieldRules((prev) => ({
      ...prev,
      [fieldId]: { ...(prev[fieldId] || { requiredAfterColon: false, dateMonth: false, dateFormat: false, tableSalesItems: false }), ...patch }
    }))
  }

  const loadTemplateBlocksForCompare = async (tid: string) => {
    try {
      return await api.templates.getLatest(tid)
    } catch (e) {
      throw new Error(t('error.template.loadStandard', { message: errText(e) }))
    }
  }

  const parseFile = async (file: File, side: 'left' | 'right') => {
    setLoading(true)
    setError('')
    try {
      let blocks: Block[] = []
      try {
        blocks = await api.parseDoc(file)
      } catch (e) {
        throw new Error(t('error.file.parse', {
          side: side === 'left' ? t('side.leftShort') : t('side.rightShort'),
          message: errText(e)
        }))
      }
      if (side === 'left') setLeftBlocks(blocks)
      else {
        setRightBlocks(blocks)
        try {
          const obj: TemplateMatchResponse = await api.templates.match(blocks)
          const best = obj?.best || null
            const score = typeof best?.score === 'number' ? best.score : null
            const tid = typeof best?.templateId === 'string' ? best.templateId : ''
            if (score !== null && tid && score >= TEMPLATE_MATCH_THRESHOLD) {
              setTemplateId(tid)
              if (leftBlocks.length === 0) {
                const { blocks: tplBlocks, name } = await loadTemplateBlocksForCompare(tid)
                setLeftBlocks(tplBlocks)
                const label = (name || tid || t('label.standardTemplate')).trim()
                setLeftFile(new File([], t('filename.standardTemplate', { label }), { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }))
              }
            } else {
              setTemplateId('')
            }
        } catch {
          setTemplateId('')
        }
      }
    } catch (err) {
      reportError(err)
    } finally {
      setLoading(false)
    }
  }

  const runDiffCore = async (left: Block[], right: Block[], templateIdForCheck?: string) => {
    let rows: AlignmentRow[] = []
    try {
      rows = await api.diff(left, right)
    } catch (e) {
      throw new Error(t('error.diff', { message: errText(e) }))
    }
    setDiffRows(rows)
    setActiveDiffIndex(0)
    setActiveRowId(null)
    setCheckRun(null)
    setCheckPaneOpen(false)
    setUploadPaneCollapsed(true)
    const effectiveTemplateId = (templateIdForCheck ?? templateId).trim()
    const cr = effectiveTemplateId ? await runChecks(effectiveTemplateId, right) : null
    if (aiAnalyzeEnabled) {
      if (cr) {
        await runGlobalAnalyze(rows, cr)
      } else {
        await runGlobalAnalyze(rows, null)
      }
    } else {
      setGlobalAnalyzeRaw(null)
    }
  }

  const compareUsingTemplate = async (tid: string) => {
    if (!tid) return
    if (rightBlocks.length === 0) {
      setError(t('error.needParseRight'))
      return
    }
    setLoading(true)
    setError('')
    try {
      const { blocks, name } = await loadTemplateBlocksForCompare(tid)
      setLeftBlocks(blocks)
      const label = (name || tid || t('label.standardTemplate')).trim()
      setLeftFile(new File([], t('filename.standardTemplate', { label }), { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }))
      await runDiffCore(blocks, rightBlocks, tid)
    } catch (err) {
      reportError(err)
    } finally {
      setLoading(false)
    }
  }

  const handleDiff = async () => {
    if (rightBlocks.length === 0) {
      setError(t('error.needParseRight'))
      return
    }
    if (leftBlocks.length === 0) {
      if (templateId) {
        await compareUsingTemplate(templateId)
        return
      }
      setError(t('error.needParseLeftOrTemplate'))
      return
    }

    setLoading(true)
    setError('')
    try {
      await runDiffCore(leftBlocks, rightBlocks, templateId)
    } catch (err) {
      reportError(err)
    } finally {
      setLoading(false)
    }
  }

  const resetAll = () => {
    setLeftFile(null)
    setRightFile(null)
    setLeftBlocks([])
    setRightBlocks([])
    setDiffRows([])
    setActiveDiffIndex(0)
    setActiveRowId(null)
    setError('')
    setCheckLoading(false)
    setCheckRun(null)
    setCheckPaneOpen(false)
    setGlobalAnalyzeLoading(false)
    setGlobalAnalyzeRaw(null)
    setGlobalPaneOpen(false)
    setUploadPaneCollapsed(false)
    setShowOnlyDiff(false)
    setTemplateId('')
    setAiCheckEnabled(false)
  }

  const getAiText = (ai: CheckAiResult | null | undefined) => {
    if (!ai) return ''
    const s = typeof ai.summary === 'string' ? ai.summary.trim() : ''
    if (s) return s
    const raw = typeof ai.raw === 'string' ? ai.raw.trim() : ''
    if (!raw) return ''
    if (raw.length <= 240) return raw
    return `${raw.slice(0, 240)}…`
  }

  const diffOnlyRows = diffRows.filter(r => r.kind !== 'matched')
  const rightBlockIdsWithIssues = new Set<string>()
  ;(checkRun?.items || []).forEach(it => {
    const id = it.evidence?.rightBlockId || null
    if (id && it.status !== 'pass') rightBlockIdsWithIssues.add(id)
  })

  const baseRows = showOnlyDiff ? diffOnlyRows : diffRows
  const visibleRows = baseRows.filter(r => {
    if (checkFilter !== 'issues' || !checkRun) return true
    if (!r.rightBlockId) return false
    return rightBlockIdsWithIssues.has(r.rightBlockId)
  })

  const scrollToRow = (rowId: string) => {
    const el = document.getElementById(`row-${rowId}`)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setActiveRowId(rowId)
    window.setTimeout(() => setActiveRowId((curr) => (curr === rowId ? null : curr)), 1200)
  }

  const jumpToDiff = (nextIndex: number) => {
    if (diffOnlyRows.length === 0) return
    const i = Math.min(Math.max(nextIndex, 0), diffOnlyRows.length - 1)
    setActiveDiffIndex(i)
    scrollToRow(diffOnlyRows[i].rowId)
  }

  const toggleShowOnlyDiff = (checked: boolean) => {
    setShowOnlyDiff(checked)
    setActiveDiffIndex(0)
  }

  const toggleIssuesOnly = (checked: boolean) => {
    setCheckFilter(checked ? 'issues' : 'all')
  }

  const toggleGlobalPane = async () => {
    const next = !globalPaneOpen
    setGlobalPaneOpen(next)
    if (next && aiAnalyzeEnabled && diffRows.length > 0 && !globalAnalyzeRaw && !globalAnalyzeLoading) {
      await runGlobalAnalyze(diffRows, checkRun)
    }
  }

  const runChecks = useCallback(async (tid: string, blocks: Block[]): Promise<CheckRunResponse | null> => {
    if (!tid) return null
    if (blocks.length === 0) {
      setError(t('error.needParseRightContract'))
      return null
    }
    setCheckLoading(true)
    setError('')
    try {
      const payload: CheckRunResponse = await api.checkRun(tid, blocks, aiCheckEnabled)
      setCheckRun(payload)
      return payload
    } catch (err) {
      reportError(err)
      return null
    } finally {
      setCheckLoading(false)
    }
  }, [aiCheckEnabled, reportError, setCheckLoading, setCheckRun, setError, t])

  const runGlobalAnalyze = async (rows: AlignmentRow[], cr: CheckRunResponse | null) => {
    if (!aiAnalyzeEnabled) return
    setGlobalAnalyzeLoading(true)
    setError('')
    try {
      const looksLikeTemplateBlocks = (blocks: Block[]) => {
        const list = Array.isArray(blocks) ? blocks.slice(0, 160) : []
        let nonEmpty = 0
        let placeholderBlocks = 0
        for (const b of list) {
          const t = String(b?.text || '').trim()
          if (!t) continue
          nonEmpty += 1
          const hasUnderline = /_{3,}|＿{3,}/.test(t)
          const hasPlaceholderWords = /(此处填写|填写|占位|样例|示例|范本|模板)/.test(t)
          const hasEmptyClause = /(以下无正文|空白处)/.test(t)
          if (hasUnderline || hasPlaceholderWords || hasEmptyClause) placeholderBlocks += 1
        }
        if (nonEmpty < 6) return false
        return placeholderBlocks / nonEmpty >= 0.35
      }

      const needsTemplateNote = looksLikeTemplateBlocks(leftBlocks)
      let promptOverride: string | null = null
      if (needsTemplateNote) {
        let basePrompt = ''
        if (globalPromptCfg) {
          basePrompt = (globalPromptCfg?.byTemplateId?.[templateId] || globalPromptCfg?.defaultPrompt || '').trim()
        } else {
          try {
            const cfg0: GlobalPromptConfig = await api.prompts.getGlobal()
            setGlobalPromptCfg(cfg0)
            basePrompt = (cfg0?.byTemplateId?.[templateId] || cfg0?.defaultPrompt || '').trim()
          } catch {
            basePrompt = ''
          }
        }
        if (basePrompt) {
          promptOverride =
            `${t('ai.globalAnalyze.templateNote')}\n\n${basePrompt}`
        }
      }

      const payload: GlobalAnalyzeResponse = await api.analyzeGlobal({
        templateId,
        rightBlocks,
        diffRows: rows,
        checkRun: cr,
        promptOverride
      })
      setGlobalAnalyzeRaw(payload.raw || '')
    } catch (err) {
      reportError(err)
    } finally {
      setGlobalAnalyzeLoading(false)
    }
  }

  const loadTemplateSnapshot = useCallback(async (tid: string) => {
    setLoading(true)
    setError('')
    try {
      setTemplateDraftFile(null)
      let blocks: Block[] = []
      try {
        const out = await api.templates.getLatest(tid)
        blocks = out.blocks
      } catch (e) {
        throw new Error(t('error.template.load', { message: errText(e) }))
      }
      setTemplateBlocks(blocks)

      const detected = blocks.flatMap((b) => detectFieldsFromBlock(b))
      const spSet = new Set(blocks.map((b) => b.structurePath).filter(Boolean))

      let ruleset: Ruleset | null = null
      try {
        ruleset = await api.rulesets.get(tid)
      } catch (e) {
        throw new Error(t('error.ruleset.load', { message: errText(e) }))
      }

      if (!ruleset) {
        setFieldRules({})
        setBlockPrompts({})
        return
      }

      const nextFieldRules: Record<string, FieldRuleState> = {}
      const fieldIdBySpLabel = new Map<string, string>()
      const fieldIdsByLabel = new Map<string, string[]>()
      const tableIdBySp = new Map<string, string>()

      for (const f of detected) {
        nextFieldRules[f.fieldId] = { requiredAfterColon: false, dateMonth: false, dateFormat: false, tableSalesItems: false, aiPrompt: '' }
        if (f.kind === 'table') {
          tableIdBySp.set(f.structurePath, f.fieldId)
          continue
        }
        const key = `${f.structurePath}||${f.labelRegex}`
        fieldIdBySpLabel.set(key, f.fieldId)
        const arr = fieldIdsByLabel.get(f.labelRegex) || []
        arr.push(f.fieldId)
        fieldIdsByLabel.set(f.labelRegex, arr)
      }

      const nextBlockPrompts: Record<string, string> = {}
      const points = ruleset.points
      for (const p of points) {
        const anchorType = p.anchor.type
        const anchorValue = p.anchor.value
        const rules = p.rules
        const prompt = typeof p.ai?.prompt === 'string' ? p.ai.prompt : ''

        for (const r of rules) {
          const rt = r.type
          if (rt === 'tableSalesItems') {
            if (anchorType === 'structurePath' && anchorValue) {
              const fid = tableIdBySp.get(anchorValue)
              if (fid && nextFieldRules[fid]) {
                nextFieldRules[fid].tableSalesItems = true
                if (prompt && typeof prompt === 'string') nextFieldRules[fid].aiPrompt = prompt
              }
            }
            continue
          }

          const labelRegex = typeof r.params?.labelRegex === 'string' ? String(r.params.labelRegex) : ''
          if (!labelRegex) continue

          let fid: string | undefined
          if (anchorType === 'structurePath' && anchorValue) {
            fid = fieldIdBySpLabel.get(`${anchorValue}||${labelRegex}`)
          }
          if (!fid) {
            const arr = fieldIdsByLabel.get(labelRegex) || []
            fid = arr[0]
          }
          if (!fid || !nextFieldRules[fid]) continue

          if (rt === 'requiredAfterColon') nextFieldRules[fid].requiredAfterColon = true
          else if (rt === 'dateMonth') nextFieldRules[fid].dateMonth = true
          else if (rt === 'dateFormat') nextFieldRules[fid].dateFormat = true
        }

        if (prompt && rules.length === 0 && anchorType === 'structurePath' && anchorValue && spSet.has(anchorValue)) {
          nextBlockPrompts[anchorValue] = prompt
        }
      }

      setFieldRules(nextFieldRules)
      setBlockPrompts(nextBlockPrompts)
    } catch (err) {
      reportError(err)
      setTemplateBlocks([])
    } finally {
      setLoading(false)
    }
  }, [errText, reportError, setBlockPrompts, setError, setFieldRules, setLoading, setTemplateBlocks, setTemplateDraftFile, t])

  useEffect(() => {
    if (!configOpen) return
    void loadTemplateSnapshot(templateId)
  }, [configOpen, loadTemplateSnapshot, templateId])

  const saveRuleset = async () => {
    setRulesetLoading(true)
    setError('')
    try {
      const today = new Date().toISOString().slice(0, 10)
      const draftTemplateId = newTemplateId.trim()
      const draftName = (newTemplateName.trim() || draftTemplateId).trim()
      const draftVersion = (newTemplateVersion.trim() || today).trim()
      let targetTemplateId = templateId
      let nameOverride: string | null = null
      let versionOverride: string | null = null

      if (templateDraftFile) {
        if (!draftTemplateId) throw new Error(t('error.templateId.required'))
        try {
          const snapshot = await api.templates.generate({
            templateId: draftTemplateId,
            name: draftName || draftTemplateId,
            version: draftVersion || today,
            file: templateDraftFile
          })
          if (Array.isArray(snapshot.blocks)) setTemplateBlocks(snapshot.blocks)
        } catch (e) {
          throw new Error(t('error.template.save', { message: errText(e) }))
        }
        await reloadTemplateIndex()
        setTemplateDraftFile(null)
        setTemplateId(draftTemplateId)
        targetTemplateId = draftTemplateId
        nameOverride = draftName || draftTemplateId
        versionOverride = draftVersion || today
      }

      let existing: Ruleset | null = null
      try {
        existing = await api.rulesets.get(targetTemplateId)
      } catch (e) {
        throw new Error(t('error.ruleset.load', { message: errText(e) }))
      }

      const existingPoints: RulesetPoint[] = existing?.points || []
      const kept = existingPoints.filter((p) => {
        const pid = p.pointId
        if (pid.startsWith('custom.') || pid.startsWith('block.') || pid.startsWith('blockai.') || pid.startsWith('field.') || pid.startsWith('table.')) return false
        return true
      })

      const anchorForField = (label: string, fallbackStructurePath: string): RulesetAnchor => {
        let key = (label || '').replace(/\s+/g, ' ').trim()
        const u = key.indexOf('___')
        if (u >= 0) key = key.slice(0, u).trim()
        key = key.replace(/^\s*[（(]?\s*[一二三四五六七八九十]+\s*[、.．)]\s*/, '')
        key = key.replace(/^\s*\d{1,2}\s*[.．、]\s*/, '')
        const c1 = key.indexOf('：')
        const c2 = key.indexOf(':')
        const c = c1 >= 0 && c2 >= 0 ? Math.min(c1, c2) : Math.max(c1, c2)
        if (c > 0) key = key.slice(0, c).trim()
        if (key.length >= 2 && key.length <= 30) return { type: 'textRegex', value: escapeRegex(key) }
        if (fallbackStructurePath) return { type: 'structurePath', value: fallbackStructurePath }
        return { type: 'textRegex', value: escapeRegex((label || '').slice(0, 30)) }
      }

      const generated: RulesetPoint[] = []
      const fieldById = new Map(detectedFields.map((f) => [f.fieldId, f]))
      for (const [fieldId, f] of fieldById.entries()) {
        const st = fieldRules[fieldId] || { requiredAfterColon: false, dateMonth: false, dateFormat: false, tableSalesItems: false, aiPrompt: '' }
        const rules: Array<{ type: string; params?: Record<string, unknown> }> = []
        if (f.kind === 'field') {
          if (st.requiredAfterColon) rules.push({ type: 'requiredAfterColon', params: { labelRegex: f.labelRegex } })
          if (st.dateMonth) rules.push({ type: 'dateMonth', params: { labelRegex: f.labelRegex } })
          if (st.dateFormat) rules.push({ type: 'dateFormat', params: { labelRegex: f.labelRegex } })
        } else if (f.kind === 'table') {
          if (st.tableSalesItems) rules.push({ type: 'tableSalesItems', params: {} })
        }

        if (rules.length === 0) continue

        const isDate = f.kind === 'field' && (st.dateMonth || st.dateFormat || f.label.includes('日期'))
        const titleFallback = f.kind === 'table'
          ? t('ruleset.title.tableCheck')
          : isDate
            ? (lang === 'zh-CN' ? `${f.label}${t('ruleset.title.dateCheckSuffix')}` : `${f.label} ${t('ruleset.title.dateCheckSuffix')}`)
            : (lang === 'zh-CN' ? `${f.label}${t('ruleset.title.fillSuffix')}` : `${f.label} ${t('ruleset.title.fillSuffix')}`)
        const title = titleFallback.slice(0, 60)
        const prefix = f.kind === 'table' ? 'table' : 'field'
        const pointId = `${prefix}.${hashString(fieldId)}`
        const anchor: RulesetAnchor =
          f.kind === 'field' ? anchorForField(f.label, f.structurePath) : { type: 'structurePath', value: f.structurePath }
        const tablePrompt = f.kind === 'table' ? String(st.aiPrompt || '').trim() : ''
        generated.push({
          pointId,
          title,
          severity: f.kind === 'table' ? 'medium' : 'high',
          anchor,
          rules,
          ai: f.kind === 'table' && tablePrompt ? { policy: 'optional', prompt: tablePrompt } : null
        })
      }

      const spSet = new Set(templateBlocks.map((b) => b.structurePath).filter(Boolean))
      for (const [sp, rawPrompt] of Object.entries(blockPrompts || {})) {
        const prompt = (rawPrompt || '').trim()
        if (!prompt) continue
        if (!spSet.has(sp)) continue
        const title = ((prompt.split('\n')[0] || '').trim() || t('ruleset.title.blockAiCheck')).slice(0, 60)
        const pointId = `blockai.${hashString(sp)}`
        generated.push({
          pointId,
          title,
          severity: 'medium',
          anchor: { type: 'structurePath', value: sp },
          rules: [],
          ai: { policy: 'optional', prompt }
        })
      }

      const name = (existing?.name || nameOverride || templateNameById.get(targetTemplateId) || targetTemplateId || t('ruleset.unnamed')).trim()
      const version = (existing?.version || versionOverride || today).trim()
      const payload: Ruleset = {
        templateId: targetTemplateId,
        name,
        version,
        referenceData: existing?.referenceData || {},
        points: [...kept, ...generated]
      }

      try {
        await api.rulesets.put(targetTemplateId, payload)
      } catch (e) {
        throw new Error(t('error.ruleset.save', { message: errText(e) }))
      }
    } catch (err) {
      reportError(err)
    } finally {
      setRulesetLoading(false)
    }
  }

  const reloadTemplateIndex = async () => {
    setTemplateIndexLoading(true)
    try {
      setTemplateIndex(await api.templates.list())
    } catch (err) {
      setError(t('error.templateIndex.load', { message: errText(err) }))
    } finally {
      setTemplateIndexLoading(false)
    }
  }

  const generateTemplateSnapshot = async (file: File) => {
    setLoading(true)
    setError('')
    try {
      setFieldRules({})
      setBlockPrompts({})
      setTemplateDraftFile(file)
      try {
        setTemplateBlocks(await api.parseDoc(file))
      } catch (e) {
        throw new Error(t('error.template.parse', { message: errText(e) }))
      }
    } catch (err) {
      reportError(err)
    } finally {
      setLoading(false)
    }
  }

  const loadGlobalPrompt = useCallback(async () => {
    setGlobalPromptLoading(true)
    setError('')
    try {
      const cfg: GlobalPromptConfig = await api.prompts.getGlobal()
      setGlobalPromptCfg(cfg)
      setGlobalPromptDefaultDraft(cfg?.defaultPrompt || '')
      setGlobalPromptTemplateDraft(cfg?.byTemplateId?.[templateId] || '')
    } catch (err) {
      setError(t('error.globalPrompt.load', { message: errText(err) }))
    } finally {
      setGlobalPromptLoading(false)
    }
  }, [
    errText,
    setError,
    setGlobalPromptCfg,
    setGlobalPromptDefaultDraft,
    setGlobalPromptLoading,
    setGlobalPromptTemplateDraft,
    t,
    templateId
  ])

  const saveGlobalPrompt = async () => {
    setGlobalPromptLoading(true)
    setError('')
    try {
      let baseByTemplateId: Record<string, string> = { ...(globalPromptCfg?.byTemplateId || {}) }
      if (!globalPromptCfg) {
        try {
          const cfg0: GlobalPromptConfig = await api.prompts.getGlobal()
          baseByTemplateId = { ...(cfg0?.byTemplateId || {}) }
        } catch {
          baseByTemplateId = {}
        }
      }
      const next: GlobalPromptConfig = {
        defaultPrompt: globalPromptDefaultDraft,
        byTemplateId: baseByTemplateId
      }
      const trimmed = globalPromptTemplateDraft.trim()
      if (trimmed) next.byTemplateId[templateId] = trimmed
      else delete next.byTemplateId[templateId]
      const saved: GlobalPromptConfig = await api.prompts.putGlobal(next)
      setGlobalPromptCfg(saved)
      setGlobalPromptDefaultDraft(saved?.defaultPrompt || '')
      setGlobalPromptTemplateDraft(saved?.byTemplateId?.[templateId] || '')
    } catch (err) {
      setError(t('error.globalPrompt.save', { message: errText(err) }))
    } finally {
      setGlobalPromptLoading(false)
    }
  }

  useEffect(() => {
    if (!configOpen) return
    if (!globalPromptCfg) {
      void loadGlobalPrompt()
      return
    }
    setGlobalPromptDefaultDraft(globalPromptCfg?.defaultPrompt || '')
    setGlobalPromptTemplateDraft(globalPromptCfg?.byTemplateId?.[templateId] || '')
  }, [configOpen, globalPromptCfg, loadGlobalPrompt, setGlobalPromptDefaultDraft, setGlobalPromptTemplateDraft, templateId])

  const ErrorBanner = (props: { message: string }) => {
    if (!props.message) return null
    return (
      <div className="error-msg">
        <span>⚠️</span> {props.message}
      </div>
    )
  }

  return (
    <I18nProvider lang={lang} setLang={setLangInProvider}>
    <AppErrorBoundary onError={reportError}>
    <div className="app-container" style={checkPaneOpen ? { maxWidth: 2200 } : undefined}>
      <HeaderBar
        theme={theme}
        toggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
        openRules={() => { setConfigOpen(true); setError('') }}
        rulesDisabled={!templateId}
      />
      
      {uploadPaneCollapsed ? (
        <div className="upload-collapsed">
          <div className="upload-collapsed-files">
            <div><b>{t('upload.collapsed.original')}</b>{leftFile?.name || t('upload.collapsed.none')}</div>
            <div><b>{t('upload.collapsed.revised')}</b>{rightFile?.name || t('upload.collapsed.none')}</div>
          </div>
          <button className="icon-btn" title={t('upload.collapsed.expand')} onClick={() => setUploadPaneCollapsed(false)}>▾</button>
        </div>
      ) : (
        <div className="upload-wrap">
          <div className="upload-grid">
            <FileUploadCard
              side="left" 
              onFileSelect={(f) => { setLeftFile(f); parseFile(f, 'left'); }}
              blocks={leftBlocks}
              fileName={leftFile?.name || null}
            />
            <FileUploadCard
              side="right" 
              onFileSelect={(f) => { setRightFile(f); parseFile(f, 'right'); }}
              blocks={rightBlocks}
              fileName={rightFile?.name || null}
            />
          </div>
          <SideActions
            contractTypeOptions={contractTypeOptions}
            templateId={templateId}
            setTemplateId={setTemplateId}
            aiCheckEnabled={aiCheckEnabled}
            setAiCheckEnabled={setAiCheckEnabled}
            aiAnalyzeEnabled={aiAnalyzeEnabled}
            setAiAnalyzeEnabled={setAiAnalyzeEnabled}
            loading={loading}
            leftBlocksCount={leftBlocks.length}
            rightBlocksCount={rightBlocks.length}
            uploadPaneCollapsed={uploadPaneCollapsed}
            onCompare={handleDiff}
            onReset={resetAll}
          />
        </div>
      )}

      <MidActions
        showOnlyDiff={showOnlyDiff}
        onToggleShowOnlyDiff={toggleShowOnlyDiff}
        hasDiffOnlyRows={diffOnlyRows.length > 0}
        onPrevDiff={() => jumpToDiff(activeDiffIndex - 1)}
        onNextDiff={() => jumpToDiff(activeDiffIndex + 1)}
        checkPaneOpen={checkPaneOpen}
        onToggleCheckPane={() => setCheckPaneOpen((v) => !v)}
        checkRunExists={!!checkRun}
        checkFilter={checkFilter}
        onToggleIssuesOnly={toggleIssuesOnly}
        globalPaneOpen={globalPaneOpen}
        onToggleGlobalPane={toggleGlobalPane}
        diffRowsCount={diffRows.length}
        aiAnalyzeEnabled={aiAnalyzeEnabled}
        globalAnalyzeLoading={globalAnalyzeLoading}
        aiCheckEnabled={aiCheckEnabled}
        checkLoading={checkLoading}
      />

      {checkRun && checkPaneOpen && diffRows.length === 0 && (
        <div style={{ marginTop: 14 }}>
          <CheckPanel checkRun={checkRun} checkFilter={checkFilter} getAiText={getAiText} />
        </div>
      )}

      {globalPaneOpen && (
        <GlobalAnalyzePanel
          aiAnalyzeEnabled={aiAnalyzeEnabled}
          globalAnalyzeLoading={globalAnalyzeLoading}
          globalAnalyzeRaw={globalAnalyzeRaw}
          globalAnalyzeShowRaw={globalAnalyzeShowRaw}
          setGlobalAnalyzeShowRaw={setGlobalAnalyzeShowRaw}
          diffRows={diffRows}
          checkRun={checkRun}
          leftBlocks={leftBlocks}
          rightBlocks={rightBlocks}
          runGlobalAnalyze={async () => { await runGlobalAnalyze(diffRows, checkRun) }}
          scrollToRow={scrollToRow}
          setCheckPaneOpen={setCheckPaneOpen}
        />
      )}

      <ErrorBanner message={error} />

      {diffRows.length > 0 && (
        <DiffTable
          rows={visibleRows}
          leftBlocks={leftBlocks}
          rightBlocks={rightBlocks}
          checkPaneOpen={checkPaneOpen}
          checkRun={checkRun}
          checkFilter={checkFilter}
          activeRowId={activeRowId}
          aiCheckEnabled={aiCheckEnabled}
          checkLoading={checkLoading}
          getAiText={getAiText}
        />
      )}

      <ContractRulesModal
        open={configOpen}
        onClose={() => setConfigOpen(false)}
        reportError={reportError}
        templateId={templateId}
        setTemplateId={setTemplateId}
        saveRuleset={saveRuleset}
        rulesetLoading={rulesetLoading}
        templateIndex={templateIndex}
        templateIndexLoading={templateIndexLoading}
        reloadTemplateIndex={reloadTemplateIndex}
        loadTemplateSnapshot={loadTemplateSnapshot}
        renameTemplate={async (id, name) => {
          try {
            await api.templates.rename(id, name)
          } catch (e) {
            throw new Error(t('error.template.rename', { message: errText(e) }))
          }
          await reloadTemplateIndex()
        }}
        deleteTemplate={async (id) => {
          try {
            await api.templates.delete(id)
          } catch (e) {
            throw new Error(t('error.template.delete', { message: errText(e) }))
          }
          await reloadTemplateIndex()
          if (templateId === id) setTemplateId('sales_contract_cn')
        }}
        newTemplateId={newTemplateId}
        setNewTemplateId={setNewTemplateId}
        newTemplateName={newTemplateName}
        setNewTemplateName={setNewTemplateName}
        newTemplateVersion={newTemplateVersion}
        setNewTemplateVersion={setNewTemplateVersion}
        generateTemplateSnapshot={generateTemplateSnapshot}
        templateBlocks={templateBlocks}
        detectedFields={detectedFields}
        fieldRules={fieldRules}
        updateFieldRule={updateFieldRule}
        blockPrompts={blockPrompts}
        setBlockPrompts={setBlockPrompts}
        globalPromptLoading={globalPromptLoading}
        globalPromptDefaultDraft={globalPromptDefaultDraft}
        setGlobalPromptDefaultDraft={setGlobalPromptDefaultDraft}
        globalPromptTemplateDraft={globalPromptTemplateDraft}
        setGlobalPromptTemplateDraft={setGlobalPromptTemplateDraft}
        loadGlobalPrompt={loadGlobalPrompt}
        saveGlobalPrompt={saveGlobalPrompt}
      />
    </div>
    </AppErrorBoundary>
    </I18nProvider>
  )
}

export default App
