import React from 'react'
import { api } from '../api'
import { detectFieldsFromBlock } from '../domain/fieldDetection'
import { escapeRegex, hashString } from '../domain/textUtils'
import type { Lang } from '../i18n'
import type {
  Block,
  DetectedField,
  FieldRuleState,
  GlobalPromptConfig,
  Ruleset,
  RulesetAnchor,
  RulesetPoint,
  TemplateListItem
} from '../domain/types'

type Params = {
  lang: Lang
  t: (key: string, params?: Record<string, unknown>) => string
  errText: (e: unknown) => string
  reportError: (e: unknown) => void

  configOpen: boolean

  templateId: string
  setTemplateId: (v: string) => void

  templateNameById: Map<string, string>
  templateIndex: TemplateListItem[]
  setTemplateIndex: (v: TemplateListItem[]) => void
  setTemplateIndexLoading: (v: boolean) => void

  setLoading: (v: boolean) => void
  setError: (v: string | ((prev: string) => string)) => void

  templateBlocks: Block[]
  setTemplateBlocks: (v: Block[]) => void

  templateDraftFile: File | null
  setTemplateDraftFile: (v: File | null) => void

  newTemplateId: string
  newTemplateName: string
  newTemplateVersion: string

  setRulesetLoading: (v: boolean) => void
  fieldRules: Record<string, FieldRuleState>
  setFieldRules: (v: Record<string, FieldRuleState> | ((prev: Record<string, FieldRuleState>) => Record<string, FieldRuleState>)) => void
  blockPrompts: Record<string, string>
  setBlockPrompts: (v: Record<string, string> | ((prev: Record<string, string>) => Record<string, string>)) => void

  globalPromptCfg: GlobalPromptConfig | null
  setGlobalPromptCfg: (v: GlobalPromptConfig | null) => void
  setGlobalPromptLoading: (v: boolean) => void
  globalPromptDefaultDraft: string
  setGlobalPromptDefaultDraft: (v: string) => void
  globalPromptTemplateDraft: string
  setGlobalPromptTemplateDraft: (v: string) => void
}

export const useRulesConfigFlow = (p: Params) => {
  const {
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
  } = p

  const detectedFields = React.useMemo((): DetectedField[] => {
    const all: DetectedField[] = []
    for (const b of templateBlocks) all.push(...detectFieldsFromBlock(b))
    return all
  }, [templateBlocks])

  const reloadTemplateIndex = React.useCallback(async () => {
    setTemplateIndexLoading(true)
    try {
      setTemplateIndex(await api.templates.list())
    } catch (err) {
      setError(t('error.templateIndex.load', { message: errText(err) }))
    } finally {
      setTemplateIndexLoading(false)
    }
  }, [errText, setError, setTemplateIndex, setTemplateIndexLoading, t])

  React.useEffect(() => {
    if (!configOpen) return
    if (templateIndex.length > 0) return
    void reloadTemplateIndex()
  }, [configOpen, reloadTemplateIndex, templateIndex.length])

  const loadTemplateSnapshot = React.useCallback(
    async (tid: string) => {
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
        for (const pt of points) {
          const anchorType = pt.anchor.type
          const anchorValue = pt.anchor.value
          const rules = pt.rules
          const prompt = typeof pt.ai?.prompt === 'string' ? pt.ai.prompt : ''

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
    },
    [errText, reportError, setBlockPrompts, setError, setFieldRules, setLoading, setTemplateBlocks, setTemplateDraftFile, t]
  )

  React.useEffect(() => {
    if (!configOpen) return
    void loadTemplateSnapshot(templateId)
  }, [configOpen, loadTemplateSnapshot, templateId])

  const generateTemplateSnapshot = React.useCallback(
    async (file: File) => {
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
    },
    [errText, reportError, setBlockPrompts, setError, setFieldRules, setLoading, setTemplateBlocks, setTemplateDraftFile, t]
  )

  const saveRuleset = React.useCallback(async () => {
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
      const kept = existingPoints.filter((pt) => {
        const pid = pt.pointId
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
        const titleFallback =
          f.kind === 'table'
            ? t('ruleset.title.tableCheck')
            : isDate
              ? lang === 'zh-CN'
                ? `${f.label}${t('ruleset.title.dateCheckSuffix')}`
                : `${f.label} ${t('ruleset.title.dateCheckSuffix')}`
              : lang === 'zh-CN'
                ? `${f.label}${t('ruleset.title.fillSuffix')}`
                : `${f.label} ${t('ruleset.title.fillSuffix')}`
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
  }, [
    blockPrompts,
    detectedFields,
    errText,
    fieldRules,
    lang,
    newTemplateId,
    newTemplateName,
    newTemplateVersion,
    reloadTemplateIndex,
    reportError,
    setError,
    setRulesetLoading,
    setTemplateBlocks,
    setTemplateDraftFile,
    setTemplateId,
    t,
    templateBlocks,
    templateDraftFile,
    templateId,
    templateNameById
  ])

  const renameTemplate = React.useCallback(
    async (id: string, name: string) => {
      try {
        await api.templates.rename(id, name)
      } catch (e) {
        throw new Error(t('error.template.rename', { message: errText(e) }))
      }
      await reloadTemplateIndex()
    },
    [errText, reloadTemplateIndex, t]
  )

  const deleteTemplate = React.useCallback(
    async (id: string) => {
      try {
        await api.templates.delete(id)
      } catch (e) {
        throw new Error(t('error.template.delete', { message: errText(e) }))
      }
      await reloadTemplateIndex()
      if (templateId === id) setTemplateId('sales_contract_cn')
    },
    [errText, reloadTemplateIndex, setTemplateId, t, templateId]
  )

  const exportSkill = React.useCallback(
    async (templateId: string, version?: string) => {
      try {
        await api.skills.export(templateId, version)
      } catch (e) {
        throw new Error(t('error.skill.export', { message: errText(e) }))
      }
    },
    [errText, t]
  )

  const importSkill = React.useCallback(
    async (file: File, overwriteSameVersion: boolean) => {
      try {
        await api.skills.import(file, overwriteSameVersion)
      } catch (e) {
        throw new Error(t('error.skill.import', { message: errText(e) }))
      }
      await reloadTemplateIndex()
    },
    [errText, reloadTemplateIndex, t]
  )

  const loadGlobalPrompt = React.useCallback(async () => {
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

  const saveGlobalPrompt = React.useCallback(async () => {
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
  }, [
    errText,
    globalPromptCfg,
    globalPromptDefaultDraft,
    globalPromptTemplateDraft,
    setError,
    setGlobalPromptCfg,
    setGlobalPromptDefaultDraft,
    setGlobalPromptLoading,
    setGlobalPromptTemplateDraft,
    t,
    templateId
  ])

  React.useEffect(() => {
    if (!configOpen) return
    if (!globalPromptCfg) {
      void loadGlobalPrompt()
      return
    }
    setGlobalPromptDefaultDraft(globalPromptCfg?.defaultPrompt || '')
    setGlobalPromptTemplateDraft(globalPromptCfg?.byTemplateId?.[templateId] || '')
  }, [configOpen, globalPromptCfg, loadGlobalPrompt, setGlobalPromptDefaultDraft, setGlobalPromptTemplateDraft, templateId])

  return {
    detectedFields,
    reloadTemplateIndex,
    loadTemplateSnapshot,
    saveRuleset,
    generateTemplateSnapshot,
    renameTemplate,
    deleteTemplate,
    exportSkill,
    importSkill,
    loadGlobalPrompt,
    saveGlobalPrompt
  }
}
