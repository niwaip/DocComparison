import React, { useCallback, useEffect, useMemo, useReducer } from 'react'
import ContractRulesModal from './ContractRulesModal'
import { api } from './api'
import { detectFieldsFromBlock } from './domain/fieldDetection'
import { escapeRegex, hashString } from './domain/textUtils'
import { I18nProvider, createT, normalizeLang, type Lang } from './i18n'
import type {
  AlignmentRow,
  Block,
  CheckRunResponse,
  DetectedField,
  FieldRuleState,
  GlobalAnalyzeResponse,
  GlobalPromptConfig,
  TemplateListItem,
  TemplateMatchResponse
} from './domain/types'

const TEMPLATE_MATCH_THRESHOLD = 0.84

// --- Component ---

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
  | { type: 'set'; key: keyof AppState; value: unknown }
  | { type: 'update'; key: keyof AppState; updater: (prev: unknown) => unknown }

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
    return { ...state, [action.key]: action.value as any } as AppState
  }
  if (action.type === 'update') {
    const prev = state[action.key]
    const next = action.updater(prev) as any
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

  const makeSetter = <K extends keyof AppState>(key: K) => {
    return (valueOrUpdater: AppState[K] | ((prev: AppState[K]) => AppState[K])) => {
      if (typeof valueOrUpdater === 'function') {
        dispatch({ type: 'update', key, updater: valueOrUpdater as any } as AppAction)
      } else {
        dispatch({ type: 'set', key, value: valueOrUpdater } as AppAction)
      }
    }
  }

  const setLeftFile = makeSetter('leftFile')
  const setRightFile = makeSetter('rightFile')
  const setLeftBlocks = makeSetter('leftBlocks')
  const setRightBlocks = makeSetter('rightBlocks')
  const setDiffRows = makeSetter('diffRows')
  const setLoading = makeSetter('loading')
  const setError = makeSetter('error')
  const setShowOnlyDiff = makeSetter('showOnlyDiff')
  const setActiveDiffIndex = makeSetter('activeDiffIndex')
  const setActiveRowId = makeSetter('activeRowId')
  const setConfigOpen = makeSetter('configOpen')
  const setTemplateId = makeSetter('templateId')
  const setAiCheckEnabled = makeSetter('aiCheckEnabled')
  const setAiAnalyzeEnabled = makeSetter('aiAnalyzeEnabled')
  const setUploadPaneCollapsed = makeSetter('uploadPaneCollapsed')
  const setCheckLoading = makeSetter('checkLoading')
  const setCheckRun = makeSetter('checkRun')
  const setCheckFilter = makeSetter('checkFilter')
  const setCheckPaneOpen = makeSetter('checkPaneOpen')
  const setTheme = makeSetter('theme')
  const setRulesetLoading = makeSetter('rulesetLoading')
  const setTemplateBlocks = makeSetter('templateBlocks')
  const setTemplateIndex = makeSetter('templateIndex')
  const setTemplateIndexLoading = makeSetter('templateIndexLoading')
  const setNewTemplateId = makeSetter('newTemplateId')
  const setNewTemplateName = makeSetter('newTemplateName')
  const setNewTemplateVersion = makeSetter('newTemplateVersion')
  const setTemplateDraftFile = makeSetter('templateDraftFile')
  const setFieldRules = makeSetter('fieldRules')
  const setBlockPrompts = makeSetter('blockPrompts')
  const setGlobalPromptCfg = makeSetter('globalPromptCfg')
  const setGlobalPromptLoading = makeSetter('globalPromptLoading')
  const setGlobalPromptDefaultDraft = makeSetter('globalPromptDefaultDraft')
  const setGlobalPromptTemplateDraft = makeSetter('globalPromptTemplateDraft')
  const setGlobalAnalyzeLoading = makeSetter('globalAnalyzeLoading')
  const setGlobalAnalyzeRaw = makeSetter('globalAnalyzeRaw')
  const setGlobalAnalyzeShowRaw = makeSetter('globalAnalyzeShowRaw')
  const setGlobalPaneOpen = makeSetter('globalPaneOpen')
  const setLang = makeSetter('lang')

  const t = useMemo(() => createT(lang), [lang])
  const setLangInProvider = useCallback((next: Lang) => {
    dispatch({ type: 'set', key: 'lang', value: next } as AppAction)
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  useEffect(() => {
    try {
      window.localStorage?.setItem('doccmp.lang', lang)
    } catch {
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
  }, [])

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
  }, [templateId, globalPromptCfg])

  useEffect(() => {
    if (templateId) return
    setAiCheckEnabled(false)
    setCheckRun(null)
    setCheckPaneOpen(false)
  }, [templateId])

  // Helper to map blockId to Block object for rendering
  const getBlock = (blocks: Block[], id: string | null) => {
    if (!id) return null
    return blocks.find(b => b.blockId === id)
  }

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
  }, [detectedFields])

  const updateFieldRule = (fieldId: string, patch: Partial<FieldRuleState>) => {
    setFieldRules((prev) => ({
      ...prev,
      [fieldId]: { ...(prev[fieldId] || { requiredAfterColon: false, dateMonth: false, dateFormat: false, tableSalesItems: false }), ...patch }
    }))
  }

  const loadTemplateBlocksForCompare = async (tid: string) => {
    try {
      return await api.templates.getLatest(tid)
    } catch (e: any) {
      throw new Error(t('error.template.loadStandard', { message: e?.message || String(e) }))
    }
  }

  const parseFile = async (file: File, side: 'left' | 'right') => {
    setLoading(true)
    setError('')
    try {
      let blocks: Block[] = []
      try {
        blocks = await api.parseDoc(file)
      } catch (e: any) {
        throw new Error(t('error.file.parse', {
          side: side === 'left' ? t('side.leftShort') : t('side.rightShort'),
          message: e?.message || String(e)
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
    } catch (err: any) {
      console.error(err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const runDiffCore = async (left: Block[], right: Block[], templateIdForCheck?: string) => {
    let rows: AlignmentRow[] = []
    try {
      rows = await api.diff(left, right)
    } catch (e: any) {
      throw new Error(t('error.diff', { message: e?.message || String(e) }))
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
    } catch (err: any) {
      console.error(err)
      setError(err?.message || String(err))
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
    } catch (err: any) {
      console.error(err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // --- Render Helpers ---

  // Custom renderer for block content to preserve styles
  const renderBlockContent = (html: string) => {
    return (
      <div 
        className="block-content"
        dangerouslySetInnerHTML={{ __html: html }} 
      />
    )
  }

  const getAiText = (ai: any) => {
    if (!ai) return ''
    const s = typeof ai.summary === 'string' ? ai.summary.trim() : ''
    if (s) return s
    const raw = typeof ai.raw === 'string' ? ai.raw.trim() : ''
    if (!raw) return ''
    if (raw.length <= 240) return raw
    return `${raw.slice(0, 240)}…`
  }

  const FileUpload = ({ 
    side, 
    onFileSelect, 
    blocks,
    fileName 
  }: { 
    side: 'left' | 'right', 
    onFileSelect: (file: File) => void, 
    blocks: Block[],
    fileName: string | null
  }) => {
    const fileInputRef = React.useRef<HTMLInputElement>(null)

    const handleClick = () => {
      fileInputRef.current?.click()
    }

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
        onFileSelect(e.target.files[0])
      }
    }

    return (
      <div className="file-upload-card" onClick={handleClick}>
        <input 
          type="file" 
          accept=".docx" 
          ref={fileInputRef}
          style={{ display: 'none' }}
          onChange={handleChange}
        />
        <div className="upload-icon">
          {side === 'left' ? '📄' : '📝'}
        </div>
        <div className="upload-info">
          <h3>{side === 'left' ? t('upload.leftTitle') : t('upload.rightTitle')}</h3>
          <p className={fileName ? 'file-name' : 'placeholder'}>
            {fileName || t('upload.clickUpload')}
          </p>
          {blocks.length > 0 && (
            <div className="status-badge">
              {t('upload.parsedBlocks', { count: blocks.length })}
            </div>
          )}
        </div>
      </div>
    )
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
    } catch (err: any) {
      console.error(err)
      setError(err.message)
      return null
    } finally {
      setCheckLoading(false)
    }
  }, [aiCheckEnabled])

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
    } catch (err: any) {
      console.error(err)
      setError(err?.message || String(err))
    } finally {
      setGlobalAnalyzeLoading(false)
    }
  }

  const loadTemplateSnapshot = async (tid: string) => {
    setLoading(true)
    setError('')
    try {
      setTemplateDraftFile(null)
      let blocks: Block[] = []
      try {
        const out = await api.templates.getLatest(tid)
        blocks = out.blocks
      } catch (e: any) {
        throw new Error(t('error.template.load', { message: e?.message || String(e) }))
      }
      setTemplateBlocks(blocks)

      const detected = blocks.flatMap((b) => detectFieldsFromBlock(b))
      const spSet = new Set(blocks.map((b) => b.structurePath).filter(Boolean))

      let ruleset: any | null = null
      try {
        ruleset = await api.rulesets.get(tid)
      } catch (e: any) {
        throw new Error(t('error.ruleset.load', { message: e?.message || String(e) }))
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
      const points: any[] = Array.isArray(ruleset?.points) ? ruleset.points : []
      for (const p of points) {
        const anchorType = String(p?.anchor?.type || '')
        const anchorValue = typeof p?.anchor?.value === 'string' ? String(p.anchor.value) : ''
        const rules: any[] = Array.isArray(p?.rules) ? p.rules : []
        const prompt = typeof p?.ai?.prompt === 'string' ? (p.ai.prompt as string) : ''

        for (const r of rules) {
          const rt = String(r?.type || '')
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

          const labelRegex = typeof r?.params?.labelRegex === 'string' ? String(r.params.labelRegex) : ''
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
    } catch (err: any) {
      console.error(err)
      setError(err?.message || String(err))
      setTemplateBlocks([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!configOpen) return
    void loadTemplateSnapshot(templateId)
  }, [configOpen, templateId])

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
          if (snapshot && Array.isArray(snapshot.blocks)) setTemplateBlocks(snapshot.blocks as Block[])
        } catch (e: any) {
          throw new Error(t('error.template.save', { message: e?.message || String(e) }))
        }
        await reloadTemplateIndex()
        setTemplateDraftFile(null)
        setTemplateId(draftTemplateId)
        targetTemplateId = draftTemplateId
        nameOverride = draftName || draftTemplateId
        versionOverride = draftVersion || today
      }

      let existing: any | null = null
      try {
        existing = await api.rulesets.get(targetTemplateId)
      } catch (e: any) {
        throw new Error(t('error.ruleset.load', { message: e?.message || String(e) }))
      }

      const existingPoints: any[] = Array.isArray(existing?.points) ? existing.points : []
      const kept = existingPoints.filter((p: any) => {
        const pid = typeof p?.pointId === 'string' ? p.pointId : ''
        if (pid.startsWith('custom.') || pid.startsWith('block.') || pid.startsWith('blockai.') || pid.startsWith('field.') || pid.startsWith('table.')) return false
        return true
      })

      const anchorForField = (label: string, fallbackStructurePath: string) => {
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

      const generated: any[] = []
      const fieldById = new Map(detectedFields.map((f) => [f.fieldId, f]))
      for (const [fieldId, f] of fieldById.entries()) {
        const st = fieldRules[fieldId] || { requiredAfterColon: false, dateMonth: false, dateFormat: false, tableSalesItems: false, aiPrompt: '' }
        const rules: any[] = []
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
        const anchor =
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
      const payload = {
        templateId: targetTemplateId,
        name,
        version,
        referenceData: existing?.referenceData || {},
        points: [...kept, ...generated]
      }

      try {
        await api.rulesets.put(targetTemplateId, payload)
      } catch (e: any) {
        throw new Error(t('error.ruleset.save', { message: e?.message || String(e) }))
      }
    } catch (err: any) {
      console.error(err)
      setError(err?.message || String(err))
    } finally {
      setRulesetLoading(false)
    }
  }

  const reloadTemplateIndex = async () => {
    setTemplateIndexLoading(true)
    try {
      setTemplateIndex(await api.templates.list())
    } catch (err: any) {
      console.error(err)
      setError(t('error.templateIndex.load', { message: err?.message || String(err) }))
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
      } catch (e: any) {
        throw new Error(t('error.template.parse', { message: e?.message || String(e) }))
      }
    } catch (err: any) {
      console.error(err)
      setError(err?.message || String(err))
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
    } catch (err: any) {
      console.error(err)
      setError(t('error.globalPrompt.load', { message: err?.message || String(err) }))
    } finally {
      setGlobalPromptLoading(false)
    }
  }, [templateId])

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
    } catch (err: any) {
      console.error(err)
      setError(t('error.globalPrompt.save', { message: err?.message || String(err) }))
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
  }, [configOpen, templateId, globalPromptCfg, loadGlobalPrompt])

  const renderCheckPanel = () => {
    if (!checkRun) return null
    const items = checkRun.items.filter(it => checkFilter === 'all' ? true : it.status !== 'pass')
    return (
      <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', padding: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ fontWeight: 800 }}>{t('check.title')}</div>
          {checkRun.runId && <div style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace' }}>{checkRun.runId}</div>}
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
            {items.map(it => {
              const color = it.status === 'fail' ? 'rgba(185, 28, 28, 1)' : it.status === 'warn' ? 'rgba(146, 64, 14, 1)' : it.status === 'manual' ? 'rgba(30, 64, 175, 1)' : 'var(--text)'
              const bg = it.status === 'fail' ? 'rgba(239,68,68,0.10)' : it.status === 'warn' ? 'rgba(245,158,11,0.14)' : it.status === 'manual' ? 'rgba(37,99,235,0.10)' : 'rgba(255,255,255,0.06)'
              return (
                <div key={it.pointId} id={checkDomId(it.pointId)} data-point-id={it.pointId} style={{ border: '1px solid var(--control-border)', borderRadius: 12, padding: 10, background: bg }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <div style={{ fontWeight: 750, lineHeight: 1.25 }}>{it.title}</div>
                    <div style={{ fontSize: 11, fontWeight: 800, color }}>
                      {it.status.toUpperCase()}
                    </div>
                  </div>
                  <div style={{ marginTop: 6, fontSize: 13, color: 'var(--text)' }}>{it.message}</div>
                  {it.evidence?.excerpt && (
                    <div style={{ marginTop: 6, fontSize: 12, color: 'var(--muted)' }}>{it.evidence.excerpt}</div>
                  )}
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

  const checkDomId = (pointId: string) => `check-${encodeURIComponent(pointId)}`

  const renderGlobalAnalyze = () => {
    const raw = (globalAnalyzeRaw || '').trim()
    if (!raw) {
      return (
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>
          {diffRows.length === 0
            ? t('globalAnalyze.empty.needDiff')
            : !aiAnalyzeEnabled
              ? t('globalAnalyze.empty.disabled')
              : globalAnalyzeLoading
                ? t('globalAnalyze.empty.loading')
                : t('globalAnalyze.empty.none')}
        </div>
      )
    }

    try {
      let parsed: any = null
      try {
        parsed = JSON.parse(raw)
      } catch {
        parsed = null
      }

      const chipStyle: React.CSSProperties = {
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 8px',
        borderRadius: 999,
        border: '1px solid var(--control-border)',
        background: 'rgba(255,255,255,0.06)',
        fontSize: 11,
        fontWeight: 750,
        color: 'var(--text)'
      }

      const humanizeText = (s: any) => {
        let out = String(s || '')
        out = out.replace(/\bblockai\.[a-z0-9]+\b/gi, t('ref.thisBlock'))
        out = out.replace(/\btable\.[a-z0-9]+\b/gi, t('ref.thisTable'))
        out = out.replace(/\bfield\.[a-z0-9]+\b/gi, t('ref.thisField'))
        out = out.replace(/\br_(\d{4})\b/gi, (_m, g1) => t('label.row', { n: parseInt(String(g1), 10) }))
        out = out.replace(/\bb_(\d{4})\b/gi, (_m, g1) => t('label.block', { n: parseInt(String(g1), 10) }))
        out = out.replace(/\s{2,}/g, ' ')
        return out
      }

    const riskBadge = (level: any) => {
      const v = String(level || '').toLowerCase()
      const cfg =
        v === 'high'
          ? { bg: 'rgba(239,68,68,0.14)', bd: 'rgba(239,68,68,0.38)', fg: 'rgba(248,113,113,1)', text: t('risk.high') }
          : v === 'medium'
            ? { bg: 'rgba(245,158,11,0.16)', bd: 'rgba(245,158,11,0.40)', fg: 'rgba(251,191,36,1)', text: t('risk.medium') }
            : v === 'low'
              ? { bg: 'rgba(34,197,94,0.14)', bd: 'rgba(34,197,94,0.38)', fg: 'rgba(74,222,128,1)', text: t('risk.low') }
              : { bg: 'rgba(255,255,255,0.06)', bd: 'var(--control-border)', fg: 'var(--muted)', text: String(level || t('evidence.none')) }
      return <span style={{ ...chipStyle, background: cfg.bg, borderColor: cfg.bd, color: cfg.fg }}>{cfg.text}</span>
    }

    const priorityBadge = (p: any) => {
      const v = String(p || '').toLowerCase()
      const cfg =
        v === 'critical' || v === 'high'
          ? { bg: 'rgba(239,68,68,0.14)', bd: 'rgba(239,68,68,0.38)', fg: 'rgba(248,113,113,1)', text: v === 'critical' ? t('priority.critical') : t('priority.high') }
          : v === 'medium'
            ? { bg: 'rgba(245,158,11,0.16)', bd: 'rgba(245,158,11,0.40)', fg: 'rgba(251,191,36,1)', text: t('priority.medium') }
            : v === 'low'
              ? { bg: 'rgba(34,197,94,0.14)', bd: 'rgba(34,197,94,0.38)', fg: 'rgba(74,222,128,1)', text: t('priority.low') }
              : { bg: 'rgba(255,255,255,0.06)', bd: 'var(--control-border)', fg: 'var(--muted)', text: String(p || t('evidence.none')) }
      return <span style={{ ...chipStyle, background: cfg.bg, borderColor: cfg.bd, color: cfg.fg }}>{cfg.text}</span>
    }

    const clip = (s: string, n: number) => {
      const t = String(s || '').replace(/\s+/g, ' ').trim()
      if (!t) return ''
      return t.length > n ? `${t.slice(0, n)}…` : t
    }

    const labelFor = (id: string) => {
      const mRow = id.match(/^r_(\d{4})$/i)
      if (mRow) return t('label.row', { n: parseInt(mRow[1], 10) })
      const mBlock = id.match(/^b_(\d{4})$/i)
      if (mBlock) return t('label.block', { n: parseInt(mBlock[1], 10) })
      if (/^table\./i.test(id)) return t('label.tableShort')
      if (/^field\./i.test(id)) return t('label.fieldShort')
      if (/^blockai\./i.test(id)) return t('label.blockShort')
      return id
    }

    const findRowByBlockId = (bid: string) => {
      for (const r of diffRows) {
        if (r.leftBlockId === bid || r.rightBlockId === bid) return r
      }
      return null
    }

    const evidenceChips = (ids: any) => {
      const arr = Array.isArray(ids) ? ids : []
      const clean = arr.map((x) => String(x)).filter(Boolean)
      if (clean.length === 0) return <span style={{ color: 'var(--muted)' }}>{t('evidence.none')}</span>

      const wrapId = (label: string, id: string) => (lang === 'zh-CN' ? `${label}（${id}）` : `${label} (${id})`)

      const tooltipFor = (id: string) => {
        if (/^r_\d+$/i.test(id)) {
          const r = diffRows.find((x) => x.rowId === id) || null
          if (!r) return id
          const ltxt = r.leftBlockId ? clip(getBlock(leftBlocks, r.leftBlockId)?.text || '', 140) : ''
          const rtxt = r.rightBlockId ? clip(getBlock(rightBlocks, r.rightBlockId)?.text || '', 140) : ''
          const parts = [wrapId(labelFor(id), id)]
          if (ltxt) parts.push(t('evidence.left', { text: ltxt }))
          if (rtxt) parts.push(t('evidence.right', { text: rtxt }))
          return parts.join('\n')
        }

        const it = (checkRun?.items || []).find((x) => x.pointId === id) || null
        if (it) {
          const parts = [wrapId(labelFor(id), id), clip(it.title || '', 80), clip(it.message || '', 180)]
          const ex = clip(it.evidence?.excerpt || '', 200)
          if (ex) parts.push(t('evidence.excerpt', { text: ex }))
          return parts.filter(Boolean).join('\n')
        }

        const r = findRowByBlockId(id)
        if (r) {
          const ltxt = r.leftBlockId ? clip(getBlock(leftBlocks, r.leftBlockId)?.text || '', 140) : ''
          const rtxt = r.rightBlockId ? clip(getBlock(rightBlocks, r.rightBlockId)?.text || '', 140) : ''
          const parts = [
            wrapId(labelFor(id), id),
            t('evidence.rowAt', { label: labelFor(r.rowId), id: r.rowId })
          ]
          if (ltxt) parts.push(t('evidence.left', { text: ltxt }))
          if (rtxt) parts.push(t('evidence.right', { text: rtxt }))
          return parts.join('\n')
        }

        const b = getBlock(leftBlocks, id) || getBlock(rightBlocks, id)
        if (b) {
          const t = clip(b.text || '', 220)
          const head = wrapId(labelFor(id), id)
          return t ? `${head}\n${t}` : head
        }

        return wrapId(labelFor(id), id)
      }

      const jumpToEvidence = (id: string) => {
        if (/^r_\d+$/i.test(id)) {
          scrollToRow(id)
          return
        }

        const r = findRowByBlockId(id)
        if (r) {
          scrollToRow(r.rowId)
          return
        }

        const it = (checkRun?.items || []).find((x) => x.pointId === id) || null
        if (it) {
          setCheckPaneOpen(true)
          window.setTimeout(() => {
            const el = document.getElementById(checkDomId(id))
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
          }, 80)
        }
      }

      return (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {clean.map((id) => (
            <button
              key={id}
              type="button"
              title={tooltipFor(id)}
              onClick={() => jumpToEvidence(id)}
              style={{ ...chipStyle, cursor: 'pointer', userSelect: 'none' }}
            >
              {labelFor(id)}
            </button>
          ))}
        </div>
      )
    }

    const blockTitleFor = (b: any) => {
      const blockId = typeof b?.blockId === 'string' ? b.blockId : ''
      if (!blockId) return humanizeText(b?.blockTitle || b?.title || '')
      const blk = getBlock(rightBlocks, blockId) || getBlock(leftBlocks, blockId)
      const txt = String(blk?.text || '').trim()
      if (txt) {
        const first = txt.split('\n').map((x) => x.trim()).filter(Boolean)[0] || ''
        if (first) {
          const cleaned = first.replace(/\s+/g, ' ').replace(/^第?\s*\d+\s*[条款章节部分]\s*/g, '').trim()
          const clipped = cleaned.length > 48 ? `${cleaned.slice(0, 48)}…` : cleaned
          if (clipped) return clipped
        }
      }
      return labelFor(blockId)
    }

      const tableStyle: React.CSSProperties = { width: '100%', borderCollapse: 'separate', borderSpacing: 0 }
      const thStyle: React.CSSProperties = { textAlign: 'left', fontSize: 12, color: 'var(--muted)', padding: '8px 8px', borderBottom: '1px solid var(--control-border)', background: 'rgba(255,255,255,0.03)' }
      const tdStyle: React.CSSProperties = { verticalAlign: 'top', fontSize: 13, color: 'var(--text)', padding: '8px 8px', borderBottom: '1px solid var(--control-border)' }

      if (!parsed || typeof parsed !== 'object') {
        return (
          <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 12, lineHeight: 1.6, padding: 12, borderRadius: 12, border: '1px solid var(--control-border)', background: 'var(--control-bg)' }}>{raw}</pre>
        )
      }

    const overallRiskLevel = parsed.overallRiskLevel
    const summary = typeof parsed.summary === 'string' ? parsed.summary : ''
    const confidence = parsed.confidence
    const keyFindings = Array.isArray(parsed.keyFindings) ? parsed.keyFindings : []
    const improvementSuggestions = Array.isArray(parsed.improvementSuggestions) ? parsed.improvementSuggestions : []
    const missingInformation = Array.isArray(parsed.missingInformation) ? parsed.missingInformation : []
    const sections = Array.isArray(parsed.sections) ? parsed.sections : []
    const blockReviews = Array.isArray(parsed.blockReviews) ? parsed.blockReviews : []

      return (
        <div style={{ display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ fontWeight: 900 }}>{t('globalAnalyze.conclusion')}</div>
            {riskBadge(overallRiskLevel)}
            {confidence !== undefined && confidence !== null && (
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>{t('globalAnalyze.confidence', { value: Number(confidence).toFixed(2) })}</span>
            )}
          </div>
          <button className="btn-secondary" onClick={() => setGlobalAnalyzeShowRaw((v) => !v)}>
            {globalAnalyzeShowRaw ? t('globalAnalyze.raw.hide') : t('globalAnalyze.raw.show')}
          </button>
        </div>

        {summary ? (
          <div style={{ border: '1px solid var(--control-border)', borderRadius: 12, padding: 12, background: 'var(--control-bg)', fontSize: 13, lineHeight: 1.65, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {humanizeText(summary)}
          </div>
        ) : null}

        {keyFindings.length > 0 && (
          <div style={{ border: '1px solid var(--control-border)', borderRadius: 12, overflow: 'hidden', background: 'var(--control-bg)' }}>
            <div style={{ padding: 12, fontWeight: 900 }}>{t('globalAnalyze.keyFindings')}</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={{ ...thStyle, width: 180 }}>{t('globalAnalyze.table.issue')}</th>
                    <th style={thStyle}>{t('globalAnalyze.table.detail')}</th>
                    <th style={{ ...thStyle, width: 220 }}>{t('globalAnalyze.table.evidence')}</th>
                  </tr>
                </thead>
                <tbody>
                  {keyFindings.map((x: any, idx: number) => (
                    <tr key={String(x?.title || idx)}>
                      <td style={tdStyle}>{humanizeText(x?.title || '')}</td>
                      <td style={{ ...tdStyle, whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.55 }}>{humanizeText(x?.detail || '')}</td>
                      <td style={tdStyle}>{evidenceChips(x?.evidenceIds)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {improvementSuggestions.length > 0 && (
          <div style={{ border: '1px solid var(--control-border)', borderRadius: 12, overflow: 'hidden', background: 'var(--control-bg)' }}>
            <div style={{ padding: 12, fontWeight: 900 }}>{t('globalAnalyze.suggestions')}</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={{ ...thStyle, width: 72 }}>{t('globalAnalyze.table.priority')}</th>
                    <th style={{ ...thStyle, width: 180 }}>{t('globalAnalyze.table.suggestion')}</th>
                    <th style={thStyle}>{t('globalAnalyze.table.content')}</th>
                  </tr>
                </thead>
                <tbody>
                  {improvementSuggestions.map((x: any, idx: number) => (
                    <tr key={String(x?.title || idx)}>
                      <td style={tdStyle}>{priorityBadge(x?.priority)}</td>
                      <td style={tdStyle}>{humanizeText(x?.title || '')}</td>
                      <td style={{ ...tdStyle, whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.55 }}>{humanizeText(x?.detail || '')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {missingInformation.length > 0 && (
          <div style={{ border: '1px solid var(--control-border)', borderRadius: 12, padding: 12, background: 'var(--control-bg)' }}>
            <div style={{ fontWeight: 900, marginBottom: 10 }}>{t('globalAnalyze.missing')}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {missingInformation.map((x: any, idx: number) => (
                <span key={String(x || idx)} style={chipStyle}>{humanizeText(x || '')}</span>
              ))}
            </div>
          </div>
        )}

        {sections.length > 0 && (
          <details style={{ border: '1px solid var(--control-border)', borderRadius: 12, background: 'var(--control-bg)', padding: 12 }} open>
            <summary style={{ cursor: 'pointer', fontWeight: 900 }}>{t('globalAnalyze.sections')}</summary>
            <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(560px, 1fr))', gap: 10 }}>
              {sections.map((s: any, idx: number) => (
                <div key={String(s?.title || idx)} style={{ border: '1px solid var(--control-border)', borderRadius: 12, padding: 12, background: 'rgba(255,255,255,0.03)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                    <div style={{ fontWeight: 900 }}>{humanizeText(s?.title || '')}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      {riskBadge(s?.riskLevel)}
                      {Array.isArray(s?.evidenceIds) && s.evidenceIds.length > 0 && <span style={{ fontSize: 12, color: 'var(--muted)' }}>{t('globalAnalyze.evidenceCount', { count: s.evidenceIds.length })}</span>}
                    </div>
                  </div>
                  {Array.isArray(s?.findings) && s.findings.length > 0 && (
                    <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.6 }}>
                      <div style={{ fontWeight: 850, color: 'var(--muted)' }}>{t('globalAnalyze.table.issue')}</div>
                      <div style={{ marginTop: 6, display: 'grid', gap: 6 }}>
                        {s.findings.map((x: any, i2: number) => (
                          <div key={String(x || i2)} style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{humanizeText(x || '')}</div>
                        ))}
                      </div>
                    </div>
                  )}
                  {Array.isArray(s?.suggestions) && s.suggestions.length > 0 && (
                    <div style={{ marginTop: 10, fontSize: 13, lineHeight: 1.6 }}>
                      <div style={{ fontWeight: 850, color: 'var(--muted)' }}>{t('globalAnalyze.table.suggestion')}</div>
                      <div style={{ marginTop: 6, display: 'grid', gap: 6 }}>
                        {s.suggestions.map((x: any, i2: number) => (
                          <div key={String(x || i2)} style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{humanizeText(x || '')}</div>
                        ))}
                      </div>
                    </div>
                  )}
                  <div style={{ marginTop: 10, fontSize: 12, color: 'var(--muted)' }}>
                    {evidenceChips(s?.evidenceIds)}
                  </div>
                </div>
              ))}
            </div>
          </details>
        )}

        {blockReviews.length > 0 && (
          <details style={{ border: '1px solid var(--control-border)', borderRadius: 12, background: 'var(--control-bg)', padding: 12 }}>
            <summary style={{ cursor: 'pointer', fontWeight: 900 }}>{t('globalAnalyze.blocks')}</summary>
            <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(560px, 1fr))', gap: 10 }}>
              {blockReviews.slice(0, 60).map((b: any, idx: number) => (
                <div key={String(b?.blockId || idx)} style={{ border: '1px solid var(--control-border)', borderRadius: 12, padding: 12, background: 'rgba(255,255,255,0.03)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                    <div style={{ fontWeight: 900 }} title={typeof b?.blockId === 'string' ? `${labelFor(b.blockId)}（${b.blockId}）` : undefined}>
                      {blockTitleFor(b)}
                    </div>
                    {riskBadge(b?.riskLevel)}
                  </div>
                  {Array.isArray(b?.issues) && b.issues.length > 0 && (
                    <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.6 }}>
                      <div style={{ fontWeight: 850, color: 'var(--muted)' }}>{t('globalAnalyze.table.issue')}</div>
                      <div style={{ marginTop: 6, display: 'grid', gap: 6 }}>
                        {b.issues.map((x: any, i2: number) => (
                          <div key={String(x || i2)} style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{humanizeText(x || '')}</div>
                        ))}
                      </div>
                    </div>
                  )}
                  {Array.isArray(b?.suggestions) && b.suggestions.length > 0 && (
                    <div style={{ marginTop: 10, fontSize: 13, lineHeight: 1.6 }}>
                      <div style={{ fontWeight: 850, color: 'var(--muted)' }}>{t('globalAnalyze.table.suggestion')}</div>
                      <div style={{ marginTop: 6, display: 'grid', gap: 6 }}>
                        {b.suggestions.map((x: any, i2: number) => (
                          <div key={String(x || i2)} style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{humanizeText(x || '')}</div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {blockReviews.length > 60 && (
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>{t('globalAnalyze.shownFirst', { count: 60 })}</div>
              )}
            </div>
          </details>
        )}

        {globalAnalyzeShowRaw && (
          <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 12, lineHeight: 1.6, padding: 12, borderRadius: 12, border: '1px solid var(--control-border)', background: 'var(--control-bg)' }}>{raw}</pre>
        )}
        </div>
      )
    } catch (err) {
      console.error(err)
      return (
        <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 12, lineHeight: 1.6, padding: 12, borderRadius: 12, border: '1px solid var(--control-border)', background: 'var(--control-bg)' }}>{raw}</pre>
      )
    }
  }

  return (
    <I18nProvider lang={lang} setLang={setLangInProvider}>
    <div className="app-container" style={checkPaneOpen ? { maxWidth: 2200 } : undefined}>
      <style>{`
        :root{
          --primary: #2563eb;
          --primary-pressed: #1d4ed8;
          --radius: 14px;
        }
        :root[data-theme="dark"]{
          --bg: radial-gradient(1200px 800px at 20% -10%, rgba(37,99,235,0.20), transparent 55%),
                radial-gradient(1000px 700px at 90% 0%, rgba(16,185,129,0.12), transparent 55%),
                radial-gradient(900px 700px at 40% 110%, rgba(147,197,253,0.10), transparent 55%),
                linear-gradient(180deg, rgba(8,12,20,1), rgba(11,18,32,1));
          --panel: rgba(15,23,42,0.72);
          --panel-solid: rgba(15,23,42,0.86);
          --border: rgba(148,163,184,0.18);
          --text: rgba(226,232,240,0.96);
          --muted: rgba(226,232,240,0.62);
          --shadow: 0 18px 44px rgba(0, 0, 0, 0.32);
          --control-bg: rgba(2, 6, 23, 0.30);
          --control-bg-hover: rgba(2, 6, 23, 0.42);
          --control-border: rgba(148,163,184,0.22);
          --control-text: rgba(226,232,240,0.92);
          --table-head-bg: rgba(2, 6, 23, 0.38);
          --divider-bg: rgba(2, 6, 23, 0.40);
          --error-bg: rgba(239,68,68,0.14);
          --error-border: rgba(239,68,68,0.28);
          --error-text: rgba(254,226,226,0.96);
          --row-ins-bg: rgba(16,185,129,0.16);
          --row-del-bg: rgba(239,68,68,0.16);
          --row-chg-bg: rgba(245,158,11,0.16);
          --row-ins-accent: rgba(16,185,129,0.95);
          --row-del-accent: rgba(239,68,68,0.95);
          --row-chg-accent: rgba(245,158,11,0.95);
          --diff-ins-bg: rgba(34,197,94,0.26);
          --diff-ins-text: rgba(220,252,231,0.98);
          --diff-del-bg: rgba(239,68,68,0.22);
          --diff-del-text: rgba(254,226,226,0.98);
        }
        :root[data-theme="light"]{
          --bg: radial-gradient(1200px 800px at 20% -10%, rgba(37,99,235,0.22), transparent 55%),
                radial-gradient(1000px 700px at 90% 0%, rgba(16,185,129,0.14), transparent 50%),
                radial-gradient(900px 700px at 40% 110%, rgba(147,197,253,0.14), transparent 55%),
                linear-gradient(180deg, rgba(245,247,251,1), rgba(235,242,255,1));
          --panel: rgba(226,232,240,0.92);
          --panel-solid: rgba(241,245,249,0.94);
          --border: rgba(15,23,42,0.14);
          --text: #0f172a;
          --muted: rgba(15,23,42,0.62);
          --shadow: 0 10px 30px rgba(2, 6, 23, 0.08);
          --control-bg: rgba(255,255,255,0.65);
          --control-bg-hover: rgba(255,255,255,0.86);
          --control-border: rgba(15,23,42,0.10);
          --control-text: rgba(15,23,42,0.85);
          --table-head-bg: rgba(226,232,240,0.92);
          --divider-bg: rgba(15,23,42,0.03);
          --error-bg: rgba(239,68,68,0.10);
          --error-border: rgba(239,68,68,0.25);
          --error-text: rgba(153, 27, 27, 1);
          --row-ins-bg: rgba(16,185,129,0.10);
          --row-del-bg: rgba(239,68,68,0.10);
          --row-chg-bg: rgba(245,158,11,0.10);
          --row-ins-accent: rgba(2,122,72,1);
          --row-del-accent: rgba(185,28,28,1);
          --row-chg-accent: rgba(146,64,14,1);
          --diff-ins-bg: rgba(22,163,74,0.16);
          --diff-ins-text: rgba(20,83,45,1);
          --diff-del-bg: rgba(220,38,38,0.14);
          --diff-del-text: rgba(153,27,27,1);
        }

        body {
          margin: 0;
          color: var(--text);
          background: var(--bg);
          overflow-x: hidden;
        }

        .app-container {
          max-width: 1600px;
          margin: 0 auto;
          padding: 28px 20px 40px;
          font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        }
        
        .header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 18px;
          background: var(--panel);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          padding: 14px 16px;
          box-shadow: var(--shadow);
          backdrop-filter: blur(10px);
        }
        .header h1 {
          margin: 0;
          font-size: 18px;
          font-weight: 650;
          letter-spacing: 0.2px;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .header-logo {
          background: linear-gradient(135deg, rgba(37,99,235,1), rgba(147,197,253,1));
          color: white;
          width: 34px;
          height: 34px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 16px;
          box-shadow: 0 8px 18px rgba(37,99,235,0.22);
        }
        
        .btn-primary {
          background: linear-gradient(180deg, rgba(37,99,235,1), rgba(29,78,216,1));
          color: white;
          border: 1px solid rgba(29,78,216,0.30);
          border-radius: 12px;
          padding: 10px 16px;
          font-size: 14px;
          font-weight: 650;
          cursor: pointer;
          transition: transform 0.12s ease, box-shadow 0.12s ease, filter 0.12s ease;
          box-shadow: 0 10px 18px rgba(37,99,235,0.20);
        }
        .btn-primary:hover { transform: translateY(-1px); filter: brightness(1.02); }
        .btn-primary:active { transform: translateY(0); background: var(--primary-pressed); box-shadow: 0 6px 12px rgba(37,99,235,0.18); }
        .btn-primary:disabled { opacity: 0.55; cursor: not-allowed; transform: none; box-shadow: none; filter: none; }
        .toolbar {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 10px;
          flex-wrap: wrap;
        }
        .btn-secondary {
          background: var(--control-bg);
          color: var(--control-text);
          border: 1px solid var(--control-border);
          border-radius: 12px;
          padding: 10px 12px;
          font-size: 13px;
          font-weight: 650;
          cursor: pointer;
          transition: transform 0.12s ease, box-shadow 0.12s ease, background 0.12s ease;
        }
        .btn-secondary:hover { transform: translateY(-1px); box-shadow: 0 8px 16px rgba(2, 6, 23, 0.18); background: var(--control-bg-hover); }
        .btn-secondary:disabled { opacity: 0.55; cursor: not-allowed; transform: none; box-shadow: none; }
        .switch {
          display: inline-flex;
          position: relative;
          align-items: center;
          gap: 8px;
          padding: 6px 8px;
          border: 1px solid var(--control-border);
          border-radius: 999px;
          background: var(--control-bg);
          user-select: none;
          cursor: pointer;
          justify-self: start;
          width: max-content;
          max-width: 100%;
        }
        .switch input {
          position: absolute;
          opacity: 0;
          width: 1px;
          height: 1px;
          overflow: hidden;
        }
        .switch-ui {
          width: 34px;
          height: 18px;
          border-radius: 999px;
          background: var(--divider-bg);
          position: relative;
          transition: background 0.12s ease, box-shadow 0.12s ease;
          flex: 0 0 auto;
        }
        .switch-ui::after {
          content: '';
          position: absolute;
          top: 2px;
          left: 2px;
          width: 14px;
          height: 14px;
          border-radius: 999px;
          background: rgba(255,255,255,0.98);
          box-shadow: 0 6px 12px rgba(2, 6, 23, 0.12);
          transition: transform 0.12s ease;
        }
        .switch input:checked + .switch-ui { background: rgba(37,99,235,0.55); }
        .switch input:checked + .switch-ui::after { transform: translateX(16px); }
        .switch input:focus-visible + .switch-ui { box-shadow: 0 0 0 3px rgba(37,99,235,0.22); }
        .switch-text { font-size: 13px; font-weight: 650; color: var(--control-text); }

        .upload-wrap {
          display: flex;
          gap: 14px;
          align-items: stretch;
          margin: 14px 0 18px;
        }
        .upload-collapsed {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin: 14px 0 18px;
          padding: 10px 12px;
          background: var(--panel);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          box-shadow: 0 10px 28px rgba(2, 6, 23, 0.10);
          backdrop-filter: blur(10px);
        }
        .upload-collapsed-files{
          display: grid;
          gap: 4px;
          min-width: 0;
        }
        .upload-collapsed-files div{
          font-size: 12px;
          color: var(--muted);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 1100px;
        }
        .upload-collapsed-files b{
          color: var(--text);
        }

        .mid-actions {
          display: flex;
          justify-content: flex-end;
          align-items: center;
          gap: 10px;
          margin: -6px 0 14px;
          padding: 10px 12px;
          background: var(--panel);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          box-shadow: 0 10px 28px rgba(2, 6, 23, 0.10);
          backdrop-filter: blur(10px);
        }
        .toggle-group {
          display: inline-flex;
          align-items: center;
          border: 1px solid var(--control-border);
          border-radius: 999px;
          background: var(--control-bg);
          overflow: hidden;
        }
        .toggle-btn {
          appearance: none;
          border: 0;
          background: transparent;
          padding: 8px 10px;
          font-size: 14px;
          font-weight: 800;
          color: var(--muted);
          cursor: pointer;
          transition: background 0.12s ease, color 0.12s ease;
          min-width: 40px;
        }
        .toggle-btn:hover { background: var(--control-bg-hover); }
        .toggle-btn.active { background: rgba(37,99,235,0.16); color: rgba(37,99,235,1); }
        .toggle-btn:disabled { opacity: 0.55; cursor: not-allowed; }
        .icon-btn {
          width: 38px;
          height: 38px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 12px;
          border: 1px solid var(--control-border);
          background: var(--control-bg);
          color: var(--control-text);
          cursor: pointer;
          transition: transform 0.12s ease, box-shadow 0.12s ease, background 0.12s ease;
          font-size: 16px;
        }
        .icon-btn:hover { transform: translateY(-1px); box-shadow: 0 8px 16px rgba(2, 6, 23, 0.18); background: var(--control-bg-hover); }
        .icon-btn:disabled { opacity: 0.55; cursor: not-allowed; transform: none; box-shadow: none; }

        .upload-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          margin: 0;
          flex: 1 1 auto;
        }

        .side-actions {
          width: 360px;
          flex: 0 0 360px;
          background: var(--panel);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          padding: 12px;
          box-shadow: 0 6px 18px rgba(2, 6, 23, 0.06);
          display: flex;
          flex-direction: column;
          gap: 10px;
          justify-content: space-between;
        }
        .side-actions-top {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 10px;
          align-items: start;
        }
        .field-label { font-size: 12px; font-weight: 700; color: var(--muted); margin-bottom: 6px; }
        .select {
          width: 100%;
          height: 36px;
          border-radius: 12px;
          border: 1px solid var(--control-border);
          padding: 0 10px;
          font-weight: 650;
          background: var(--control-bg);
          color: var(--control-text);
        }
        .side-actions-controls{
          display: grid;
          gap: 10px;
        }
        .side-actions-switches{
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: nowrap;
        }
        .field-row{
          display: flex;
          align-items: center;
          gap: 10px;
          min-width: 0;
        }
        .field-row-label{
          font-size: 12px;
          font-weight: 800;
          color: var(--muted);
          white-space: nowrap;
          flex: 0 0 auto;
        }
        .field-row .select{
          flex: 1 1 auto;
          min-width: 0;
        }
        .side-actions-cta{
          display: flex;
          gap: 10px;
          align-items: center;
          flex-direction: column;
          justify-content: flex-start;
          align-self: stretch;
        }
        .side-actions-cta .btn-primary{
          height: 44px;
          padding: 0 16px;
          width: 100%;
          white-space: nowrap;
        }
        .side-actions-cta .btn-secondary{
          height: 44px;
          padding: 0 14px;
          width: 100%;
          white-space: nowrap;
        }
        .btn-reset{
          border-color: rgba(239,68,68,0.26);
        }
        .btn-reset:hover{
          background: rgba(239,68,68,0.10);
          border-color: rgba(239,68,68,0.36);
        }
        .btn-reset:active{
          background: rgba(239,68,68,0.14);
        }
        .side-actions-buttons {
          display: grid;
          gap: 10px;
        }
        .file-upload-card {
          background: var(--panel);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          padding: 14px;
          display: flex;
          align-items: center;
          gap: 12px;
          cursor: pointer;
          transition: transform 0.12s ease, box-shadow 0.12s ease, border-color 0.12s ease;
          box-shadow: 0 6px 18px rgba(2, 6, 23, 0.06);
        }
        .file-upload-card:hover { transform: translateY(-1px); border-color: rgba(37,99,235,0.35); box-shadow: 0 10px 24px rgba(2, 6, 23, 0.18); }
        .upload-icon { font-size: 28px; opacity: 0.9; color: var(--text); }
        .upload-info h3 { margin: 0 0 4px 0; font-size: 14px; font-weight: 650; color: var(--text); }
        .file-name { color: rgba(37,99,235,1); font-weight: 650; margin: 0; }
        .placeholder { color: var(--muted); margin: 0; }
        .status-badge { display: inline-block; margin-top: 8px; font-size: 12px; color: rgba(16,185,129,1); background: rgba(16,185,129,0.16); border: 1px solid rgba(16,185,129,0.22); padding: 3px 10px; border-radius: 999px; font-weight: 650; }

        .modal-overlay{
          position: fixed;
          inset: 0;
          background: rgba(2, 6, 23, 0.55);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 18px;
          z-index: 999;
        }
        .modal{
          width: min(1180px, 100%);
          max-height: min(86vh, 900px);
          overflow: auto;
          background: var(--panel-solid);
          border: 1px solid var(--border);
          border-radius: 16px;
          box-shadow: 0 30px 80px rgba(2, 6, 23, 0.35);
          backdrop-filter: blur(10px);
        }
        .modal-topbar{
          position: sticky;
          top: 0;
          z-index: 2;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 12px 14px;
          background: var(--table-head-bg);
          border-bottom: 1px solid var(--border);
          backdrop-filter: blur(10px);
        }
        .modal-title{
          font-weight: 850;
          color: var(--text);
        }

        .error-msg { padding: 12px 14px; background: var(--error-bg); border: 1px solid var(--error-border); border-radius: var(--radius); color: var(--error-text); margin: 10px 0 18px; display: flex; align-items: center; gap: 8px; box-shadow: 0 10px 22px rgba(0, 0, 0, 0.18); }

        .diff-container {
          background: var(--panel-solid);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          box-shadow: var(--shadow);
          overflow-x: hidden;
          overflow-y: visible;
          max-height: none;
        }
        table { border-collapse: collapse; width: 100%; }
        .diff-container > table { table-layout: fixed; }
        thead th {
          position: sticky;
          top: 0;
          z-index: 3;
          background: var(--table-head-bg);
          backdrop-filter: blur(10px);
          color: var(--muted);
          font-weight: 650;
          font-size: 12px;
          padding: 10px 12px;
          text-align: left;
          border-bottom: 1px solid var(--border);
        }
        td {
          padding: 10px 12px;
          border-bottom: 1px solid var(--border);
          vertical-align: top;
          font-size: 14px;
          line-height: 1.65;
          color: var(--text);
        }
        .diff-container > table > tbody > tr:hover > td { background: rgba(255,255,255,0.03); }
        .diff-container > table > tbody > tr.diff-row-active > td { box-shadow: inset 0 0 0 2px rgba(37,99,235,0.28); }
        .diff-container > table > tbody > tr:last-child > td { border-bottom: none; }
        
        .block-content { 
          white-space: pre-wrap;
          word-break: break-word;
          overflow-wrap: anywhere;
          overflow-x: hidden;
        }
        .block-content p[style*="text-indent:"]:not([style*="text-indent: -"]){
          text-indent: 0 !important;
        }
        .block-content p { margin: 0 0 8px 0; }
        .block-content p:last-child { margin-bottom: 0; }
        .block-content ul, .block-content ol { margin: 4px 0; padding-left: 24px; }
        .block-content li { margin-bottom: 4px; }
        .block-content table { width: 100%; max-width: 100%; table-layout: fixed; border-collapse: collapse; }
        .block-content table th, .block-content table td { white-space: normal; word-break: break-word; overflow-wrap: anywhere; }

        .block-content ins{
          background: var(--diff-ins-bg) !important;
          color: var(--diff-ins-text) !important;
          text-decoration: none !important;
          padding: 0 2px;
          border-radius: 4px;
          box-shadow: 0 0 0 1px rgba(34,197,94,0.35), inset 0 -2px 0 rgba(34,197,94,0.55);
        }
        .block-content del{
          background: var(--diff-del-bg) !important;
          color: var(--diff-del-text) !important;
          text-decoration: line-through !important;
          text-decoration-thickness: 2px;
          text-decoration-color: rgba(239,68,68,0.90);
          padding: 0 2px;
          border-radius: 4px;
          box-shadow: 0 0 0 1px rgba(239,68,68,0.35), inset 0 -2px 0 rgba(239,68,68,0.35);
        }
        
        .bg-inserted { background-color: var(--row-ins-bg); }
        .bg-inserted .status-cell { color: var(--row-ins-accent); }
        .bg-deleted { background-color: var(--row-del-bg); }
        .bg-deleted .status-cell { color: var(--row-del-accent); }
        .bg-changed { background-color: var(--row-chg-bg); }
        .bg-changed .status-cell { color: var(--row-chg-accent); }
        .bg-inserted > td:first-child { box-shadow: inset 4px 0 0 var(--row-ins-accent); }
        .bg-deleted > td:first-child { box-shadow: inset 4px 0 0 var(--row-del-accent); }
        .bg-changed > td:first-child { box-shadow: inset 4px 0 0 var(--row-chg-accent); }
        
        td.status-cell { 
          text-align: center; 
          font-weight: 900; 
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace; 
          font-size: 14px; 
          user-select: none;
          padding: 0;
          background: var(--divider-bg);
          border-left: 1px solid var(--control-border);
          border-right: 1px solid var(--control-border);
        }
        th.status-divider {
          width: 24px;
          padding: 0;
          background: var(--divider-bg);
          border-left: 1px solid var(--control-border);
          border-right: 1px solid var(--control-border);
        }

        .scrollbar-progress {
          position: relative;
          width: 132px;
          height: 10px;
          border-radius: 999px;
          background: var(--divider-bg);
          border: 1px solid var(--control-border);
          overflow: hidden;
        }
        .scrollbar-progress .thumb{
          position: absolute;
          top: 1px;
          bottom: 1px;
          width: 36%;
          border-radius: 999px;
          background: rgba(37,99,235,0.55);
          box-shadow: inset 0 0 0 1px rgba(37,99,235,0.30);
          animation: scrollbar-slide 1.1s ease-in-out infinite;
        }
        @keyframes scrollbar-slide{
          0%{ transform: translateX(-120%); }
          100%{ transform: translateX(320%); }
        }

        .aligned-lines { display: block; width: 100%; overflow: hidden; }
        .aligned-line { display: block; white-space: pre-wrap; word-break: break-word; }
        .aligned-line.empty { color: transparent; }
        .aligned-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
        .aligned-table td { padding: 0; border: 0; vertical-align: top; }
        .aligned-table .aligned-col { width: 100%; }
        .aligned-cell-inner { width: 100%; white-space: pre-wrap; word-break: break-word; }
        
        .meta-info { display: none; }

        @media (max-width: 980px) {
          .upload-wrap { flex-direction: column; }
          .side-actions { width: auto; flex: 1 1 auto; }
          .upload-grid { grid-template-columns: 1fr; }
          .diff-container { max-height: none; }
        }
      `}</style>

      <div className="header">
        <h1>
          <div className="header-logo">D</div>
          {t('app.title')}
        </h1>
        <div className="toolbar">
          <button
            className="btn-secondary"
            onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
            title={theme === 'dark' ? t('toolbar.theme.toLight') : t('toolbar.theme.toDark')}
          >
            {theme === 'dark' ? t('toolbar.theme.light') : t('toolbar.theme.dark')}
          </button>
          <button
            className="btn-secondary"
            onClick={() => setLang((prev) => (prev === 'zh-CN' ? 'en-US' : 'zh-CN'))}
            title={t('toolbar.lang.switchTitle')}
            style={{ height: 34, padding: '0 10px' }}
          >
            🌐
          </button>
          <button
            className="btn-secondary"
            onClick={() => { setConfigOpen(true); setError('') }}
            disabled={!templateId}
            title={!templateId ? t('toolbar.configRules.disabled') : undefined}
          >
            {t('toolbar.configRules')}
          </button>
        </div>
      </div>
      
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
            <FileUpload 
              side="left" 
              onFileSelect={(f) => { setLeftFile(f); parseFile(f, 'left'); }}
              blocks={leftBlocks}
              fileName={leftFile?.name || null}
            />
            <FileUpload 
              side="right" 
              onFileSelect={(f) => { setRightFile(f); parseFile(f, 'right'); }}
              blocks={rightBlocks}
              fileName={rightFile?.name || null}
            />
          </div>
          <div className="side-actions">
            <div className="side-actions-top">
              <div className="side-actions-controls">
                <div className="field-row">
                  <div className="field-row-label">{t('side.contractType')}</div>
                  <select
                    className="select"
                    value={templateId}
                    onChange={(e) => setTemplateId(e.target.value)}
                  >
                    {contractTypeOptions.map(o => (
                      <option key={o.templateId} value={o.templateId}>{o.name}</option>
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
                <button 
                  className="btn-primary btn-compare"
                  onClick={handleDiff} 
                  disabled={loading || rightBlocks.length === 0 || (leftBlocks.length === 0 && !templateId)}
                >
                  {loading ? t('side.compare.loading') : t('side.compare.start')}
                </button>
                <button
                  className="btn-secondary btn-reset"
                  onClick={() => {
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
                  }}
                  disabled={loading && !uploadPaneCollapsed}
                  title={t('side.reset.title')}
                >
                  {t('side.reset')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="mid-actions">
        <label className="switch" title={t('mid.showOnlyDiff.title')}>
          <input
            type="checkbox"
            checked={showOnlyDiff}
            onChange={(e) => { setShowOnlyDiff(e.target.checked); setActiveDiffIndex(0) }}
          />
          <span className="switch-ui" aria-hidden="true" />
          <span className="switch-text">{t('mid.showOnlyDiff')}</span>
        </label>
        <button
          className="btn-secondary"
          onClick={() => jumpToDiff(activeDiffIndex - 1)}
          disabled={diffOnlyRows.length === 0}
          title={t('mid.diff.prev')}
        >
          ↑
        </button>
        <button
          className="btn-secondary"
          onClick={() => jumpToDiff(activeDiffIndex + 1)}
          disabled={diffOnlyRows.length === 0}
          title={t('mid.diff.next')}
        >
          ↓
        </button>
        <button
          className="icon-btn"
          title={checkPaneOpen ? t('mid.checkPane.collapse') : t('mid.checkPane.expand')}
          onClick={() => setCheckPaneOpen(v => !v)}
          disabled={!checkRun}
        >
          {checkPaneOpen ? '🧾▾' : '🧾▸'}
        </button>
        <label className="switch" title={t('mid.checkFilter.title')}>
          <input
            type="checkbox"
            checked={checkFilter === 'issues'}
            onChange={(e) => setCheckFilter(e.target.checked ? 'issues' : 'all')}
          />
          <span className="switch-ui" aria-hidden="true" />
          <span className="switch-text">{checkFilter === 'issues' ? t('mid.checkFilter.issuesOnly') : t('mid.checkFilter.all')}</span>
        </label>
        <button
          className="icon-btn"
          title={globalPaneOpen ? t('mid.globalPane.collapse') : t('mid.globalPane.expand')}
          onClick={async () => {
            const next = !globalPaneOpen
            setGlobalPaneOpen(next)
            if (next && aiAnalyzeEnabled && diffRows.length > 0 && !globalAnalyzeRaw && !globalAnalyzeLoading) {
              await runGlobalAnalyze(diffRows, checkRun)
            }
          }}
          disabled={diffRows.length === 0 || !aiAnalyzeEnabled}
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

      {checkRun && checkPaneOpen && diffRows.length === 0 && (
        <div style={{ marginTop: 14 }}>
          {renderCheckPanel()}
        </div>
      )}

      {globalPaneOpen && (
        <div style={{ marginTop: 14, background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', padding: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ fontWeight: 800 }}>{t('global.title')}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              {aiAnalyzeEnabled && globalAnalyzeLoading && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{t('mid.globalAnalyze.loading')}</div>
                  <div className="scrollbar-progress" aria-hidden="true">
                    <div className="thumb" />
                  </div>
                </div>
              )}
              <button
                className="btn-secondary"
                disabled={globalAnalyzeLoading || diffRows.length === 0 || !aiAnalyzeEnabled}
                onClick={async () => { await runGlobalAnalyze(diffRows, checkRun) }}
              >
                {globalAnalyzeLoading ? t('global.reanalyze.loading') : t('global.reanalyze')}
              </button>
            </div>
          </div>
          <div style={{ marginTop: 10 }}>
            {renderGlobalAnalyze()}
          </div>
        </div>
      )}

      {error && (
        <div className="error-msg">
          <span>⚠️</span> {error}
        </div>
      )}

      {diffRows.length > 0 && (
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
            {visibleRows.map((row) => {
              const leftBlock = getBlock(leftBlocks, row.leftBlockId)
              const rightBlock = getBlock(rightBlocks, row.rightBlockId)
              const rowAllCheckItems = checkPaneOpen ? (checkRun?.items || []).filter(it => (it.evidence?.rightBlockId || null) === (row.rightBlockId || null) && !!row.rightBlockId) : []
              const rowVisibleCheckItems = checkPaneOpen ? rowAllCheckItems.filter(it => checkFilter === 'all' ? true : it.status !== 'pass') : []
              
              let rowClass = ''
              let icon = ''
              
              if (row.kind === 'inserted') { rowClass = 'bg-inserted'; icon = '+'; }
              else if (row.kind === 'deleted') { rowClass = 'bg-deleted'; icon = '-'; }
              else if (row.kind === 'changed') { rowClass = 'bg-changed'; icon = '•'; }
              
              return (
                <tr
                  key={row.rowId}
                  id={`row-${row.rowId}`}
                  data-row-id={row.rowId}
                  className={`${rowClass}${activeRowId === row.rowId ? ' diff-row-active' : ''}`}
                >
                  {/* Left Content */}
                  <td>
                    {leftBlock ? (
                      <div>
                        {row.kind === 'changed' && row.leftDiffHtml ? (
                          <div 
                            className="block-content"
                            dangerouslySetInnerHTML={{ __html: row.leftDiffHtml }} 
                          />
                        ) : (
                          renderBlockContent(leftBlock.htmlFragment)
                        )}
                      </div>
                    ) : null}
                  </td>
                  
                  {/* Status */}
                  <td className="status-cell">
                    {icon}
                  </td>

                  {/* Right Content */}
                  <td>
                    {rightBlock ? (
                      <div>
                        {/* If changed, show rightDiffHtml if available, else normal */}
                        {row.kind === 'changed' && row.rightDiffHtml ? (
                           <div 
                              className="block-content"
                              dangerouslySetInnerHTML={{ __html: row.rightDiffHtml }} 
                           />
                        ) : (
                           renderBlockContent(rightBlock ? rightBlock.htmlFragment : '')
                        )}
                      </div>
                    ) : null}
                  </td>

                  {checkPaneOpen && (
                    <td style={{ borderLeft: '1px solid var(--border)', background: 'rgba(255,255,255,0.04)', minWidth: 0, overflow: 'hidden' }}>
                      {checkRun ? (
                        rowVisibleCheckItems.length > 0 ? (
                          <div style={{ display: 'grid', gap: 8 }}>
                            {rowVisibleCheckItems.map(it => {
                              const color = it.status === 'fail' ? 'rgba(185, 28, 28, 1)' : it.status === 'warn' ? 'rgba(146, 64, 14, 1)' : it.status === 'manual' ? 'rgba(30, 64, 175, 1)' : it.status === 'error' ? 'rgba(185, 28, 28, 1)' : 'var(--text)'
                              const tagBg = it.status === 'fail' ? 'rgba(239,68,68,0.10)' : it.status === 'warn' ? 'rgba(245,158,11,0.14)' : it.status === 'manual' ? 'rgba(37,99,235,0.10)' : it.status === 'error' ? 'rgba(239,68,68,0.10)' : 'var(--divider-bg)'
                              return (
                                <div key={it.pointId} id={checkDomId(it.pointId)} data-point-id={it.pointId} style={{ border: '1px solid var(--control-border)', borderRadius: 12, padding: 10, background: 'rgba(255,255,255,0.06)' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                                    <div style={{ fontWeight: 750, lineHeight: 1.25 }}>{it.title}</div>
                                    <div style={{ fontSize: 11, fontWeight: 800, color, background: tagBg, padding: '3px 8px', borderRadius: 999 }}>
                                      {it.status.toUpperCase()}
                                    </div>
                                  </div>
                                  <div style={{ marginTop: 6, fontSize: 13, color: 'var(--text)', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{it.message}</div>
                                  {getAiText(it.ai) && (
                                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px dashed var(--control-border)', fontSize: 12, color: 'var(--muted)', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                                      {t('label.ai')}{getAiText(it.ai)}
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
      )}

      <ContractRulesModal
        open={configOpen}
        onClose={() => setConfigOpen(false)}
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
          } catch (e: any) {
            throw new Error(t('error.template.rename', { message: e?.message || String(e) }))
          }
          await reloadTemplateIndex()
        }}
        deleteTemplate={async (id) => {
          try {
            await api.templates.delete(id)
          } catch (e: any) {
            throw new Error(t('error.template.delete', { message: e?.message || String(e) }))
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
    </I18nProvider>
  )
}

export default App
