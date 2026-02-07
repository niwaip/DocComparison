import React, { useCallback, useEffect, useMemo, useReducer } from 'react'
import ContractRulesModal from './ContractRulesModal'
import { api } from './api'
import HeaderBar from './components/HeaderBar'
import MidActions from './components/MidActions'
import SideActions from './components/SideActions'
import GlobalAnalyzePanel from './features/analyze/GlobalAnalyzePanel'
import CheckPanel from './features/check/CheckPanel'
import DiffTable, { type DiffTableHandle } from './features/compare/DiffTable'
import FileUploadCard from './features/compare/FileUploadCard'
import { useCompareFlow } from './hooks/useCompareFlow'
import { useRulesConfigFlow } from './hooks/useRulesConfigFlow'
import { useUnauthorizedHandler } from './hooks/useUnauthorizedHandler'
import { I18nProvider, createT, normalizeLang, type Lang } from './i18n'
import type {
  AlignmentRow,
  Block,
  CheckRunResponse,
  FieldRuleState,
  GlobalAnalyzeResponse,
  GlobalPromptConfig,
  TemplateListItem,
} from './domain/types'

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

  useUnauthorizedHandler(() => {
    setError((prev) => prev || 'Unauthorized (401)')
  })

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
    if (templateId) return
    setAiCheckEnabled(false)
    setCheckRun(null)
    setCheckPaneOpen(false)
  }, [templateId, setAiCheckEnabled, setCheckPaneOpen, setCheckRun])

  const {
    detectedFields,
    reloadTemplateIndex,
    loadTemplateSnapshot,
    saveRuleset,
    generateTemplateSnapshot,
    renameTemplate,
    deleteTemplate,
    loadGlobalPrompt,
    saveGlobalPrompt
  } = useRulesConfigFlow({
    lang,
    t,
    errText,
    reportError,
    configOpen,
    templateId,
    setTemplateId,
    templateNameById,
    templateIndex,
    setTemplateIndex,
    setTemplateIndexLoading,
    setLoading,
    setError,
    templateBlocks,
    setTemplateBlocks,
    templateDraftFile,
    setTemplateDraftFile,
    newTemplateId,
    newTemplateName,
    newTemplateVersion,
    setRulesetLoading,
    fieldRules,
    setFieldRules,
    blockPrompts,
    setBlockPrompts,
    globalPromptCfg,
    setGlobalPromptCfg,
    setGlobalPromptLoading,
    globalPromptDefaultDraft,
    setGlobalPromptDefaultDraft,
    globalPromptTemplateDraft,
    setGlobalPromptTemplateDraft
  })

  const updateFieldRule = (fieldId: string, patch: Partial<FieldRuleState>) => {
    setFieldRules((prev) => ({
      ...prev,
      [fieldId]: { ...(prev[fieldId] || { requiredAfterColon: false, dateMonth: false, dateFormat: false, tableSalesItems: false }), ...patch }
    }))
  }

  const diffTableRef = React.useRef<DiffTableHandle | null>(null)

  const scrollToRow = useCallback(
    (rowId: string) => {
      diffTableRef.current?.scrollToRowId(rowId)
      setActiveRowId(rowId)
      window.setTimeout(() => setActiveRowId((curr) => (curr === rowId ? null : curr)), 1200)
    },
    [setActiveRowId]
  )

  const runChecks = useCallback(async (tid: string, blocks: Block[], opts?: { signal?: AbortSignal }): Promise<CheckRunResponse | null> => {
    if (!tid) return null
    if (blocks.length === 0) {
      setError(t('error.needParseRightContract'))
      return null
    }
    setCheckLoading(true)
    setError('')
    try {
      const payload: CheckRunResponse = await api.checkRun(tid, blocks, aiCheckEnabled, { signal: opts?.signal })
      setCheckRun(payload)
      return payload
    } catch (err) {
      reportError(err)
      return null
    } finally {
      setCheckLoading(false)
    }
  }, [aiCheckEnabled, reportError, setCheckLoading, setCheckRun, setError, t])

  const runGlobalAnalyze = async (rows: AlignmentRow[], cr: CheckRunResponse | null, opts?: { signal?: AbortSignal }) => {
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
            const cfg0: GlobalPromptConfig = await api.prompts.getGlobal({ signal: opts?.signal })
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
      }, { signal: opts?.signal })
      setGlobalAnalyzeRaw(payload.raw || '')
    } catch (err) {
      reportError(err)
    } finally {
      setGlobalAnalyzeLoading(false)
    }
  }

  const { parseFile, handleDiff, resetAll, getAiText, diffOnlyRows, visibleRows, jumpToDiff, toggleShowOnlyDiff, toggleIssuesOnly } = useCompareFlow({
    t,
    errText,
    reportError,
    templateId,
    setTemplateId,
    aiAnalyzeEnabled,
    setAiCheckEnabled,
    leftBlocks,
    rightBlocks,
    setLeftBlocks,
    setRightBlocks,
    setLeftFile,
    setRightFile,
    diffRows,
    setDiffRows,
    setLoading,
    setError,
    setActiveDiffIndex,
    setActiveRowId,
    checkRun,
    setCheckRun,
    setCheckPaneOpen,
    setCheckLoading,
    checkFilter,
    setCheckFilter,
    showOnlyDiff,
    setShowOnlyDiff,
    uploadPaneCollapsed,
    setUploadPaneCollapsed,
    globalAnalyzeLoading,
    globalAnalyzeRaw,
    setGlobalAnalyzeLoading,
    setGlobalAnalyzeRaw,
    setGlobalPaneOpen,
    runChecks,
    runGlobalAnalyze,
    scrollToRow
  })

  const toggleGlobalPane = async () => {
    const next = !globalPaneOpen
    setGlobalPaneOpen(next)
    if (next && aiAnalyzeEnabled && diffRows.length > 0 && !globalAnalyzeRaw && !globalAnalyzeLoading) {
      await runGlobalAnalyze(diffRows, checkRun)
    }
  }

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
          ref={diffTableRef}
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
        renameTemplate={renameTemplate}
        deleteTemplate={deleteTemplate}
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
