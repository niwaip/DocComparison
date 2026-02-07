import type {
  AlignmentRow,
  Block,
  CheckRunResponse,
  GlobalAnalyzeResponse,
  GlobalPromptConfig,
  Ruleset,
  RulesetAi,
  RulesetAnchor,
  RulesetPoint,
  RulesetRule,
  TemplateListItem,
  TemplateMatchResponse
} from './domain/types'

type TemplateSnapshot = {
  templateId?: string
  name?: string
  version?: string
  blocks?: Block[]
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

const asStringArray = (v: unknown): string[] => {
  if (!Array.isArray(v)) return []
  return v.map((x) => String(x))
}

const asRecord = (v: unknown): Record<string, unknown> => (isRecord(v) ? v : {})

const asRulesetAnchor = (v: unknown): RulesetAnchor | null => {
  if (!isRecord(v)) return null
  const type = v.type
  const value = v.value
  if (type !== 'structurePath' && type !== 'textRegex') return null
  if (typeof value !== 'string') return null
  return { type, value }
}

const asRulesetRule = (v: unknown): RulesetRule | null => {
  if (!isRecord(v)) return null
  if (typeof v.type !== 'string') return null
  const params = v.params
  return { type: v.type, params: isRecord(params) ? params : undefined }
}

const asRulesetAi = (v: unknown): RulesetAi | null => {
  if (v === null) return null
  if (!isRecord(v)) return null
  const policy = typeof v.policy === 'string' ? v.policy : ''
  if (!policy) return null
  const prompt = typeof v.prompt === 'string' ? v.prompt : undefined
  return { policy: policy as RulesetAi['policy'], prompt }
}

const asRulesetPoint = (v: unknown): RulesetPoint | null => {
  if (!isRecord(v)) return null
  const pointId = typeof v.pointId === 'string' ? v.pointId : ''
  const title = typeof v.title === 'string' ? v.title : ''
  const severity = v.severity
  if (!pointId || !title) return null
  if (severity !== 'high' && severity !== 'medium' && severity !== 'low') return null
  const anchor = asRulesetAnchor(v.anchor)
  if (!anchor) return null
  const rulesRaw = v.rules
  const rules = Array.isArray(rulesRaw) ? rulesRaw.map(asRulesetRule).filter((x): x is RulesetRule => !!x) : []
  const ai = asRulesetAi(v.ai)
  return { pointId, title, severity, anchor, rules, ai }
}

const normalizeRuleset = (templateId: string, raw: unknown): Ruleset | null => {
  if (!isRecord(raw)) return null
  const pointsRaw = raw.points
  const points = Array.isArray(pointsRaw) ? pointsRaw.map(asRulesetPoint).filter((x): x is RulesetPoint => !!x) : []
  const name = typeof raw.name === 'string' ? raw.name : ''
  const version = typeof raw.version === 'string' ? raw.version : ''
  const referenceData = asRecord(raw.referenceData)
  return { templateId, name, version, referenceData, points }
}

const buildHttpError = async (res: Response): Promise<Error> => {
  const base = `${res.status} ${res.statusText}`.trim()
  let detail = ''

  try {
    const ct = (res.headers.get('content-type') || '').toLowerCase()
    if (ct.includes('application/json')) {
      const data: unknown = await res.json()
      if (isRecord(data) && typeof data.message === 'string') detail = data.message
      else if (isRecord(data) && typeof data.detail === 'string') detail = data.detail
      else detail = JSON.stringify(data)
    } else {
      detail = (await res.text()).trim()
    }
  } catch {
    detail = ''
  }

  if (!detail) return new Error(base)
  return new Error(`${base}: ${detail}`)
}

const fetchJson = async <T>(url: string, init?: RequestInit): Promise<T> => {
  const res = await fetch(url, init)
  if (!res.ok) throw await buildHttpError(res)
  return (await res.json()) as T
}

const fetchJsonMaybe404 = async <T>(url: string, init?: RequestInit): Promise<T | null> => {
  const res = await fetch(url, init)
  if (res.status === 404) return null
  if (!res.ok) throw await buildHttpError(res)
  return (await res.json()) as T
}

export const api = {
  parseDoc: async (file: File): Promise<Block[]> => {
    const formData = new FormData()
    formData.append('file', file)
    return await fetchJson<Block[]>('/api/parse', { method: 'POST', body: formData })
  },

  diff: async (leftBlocks: Block[], rightBlocks: Block[]): Promise<AlignmentRow[]> => {
    return await fetchJson<AlignmentRow[]>('/api/diff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ left_blocks: leftBlocks, right_blocks: rightBlocks })
    })
  },

  checkRun: async (templateId: string, rightBlocks: Block[], aiEnabled: boolean): Promise<CheckRunResponse> => {
    return await fetchJson<CheckRunResponse>('/api/check/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ templateId, rightBlocks, aiEnabled })
    })
  },

  analyzeGlobal: async (payload: {
    templateId: string
    rightBlocks: Block[]
    diffRows: AlignmentRow[]
    checkRun: CheckRunResponse | null
    promptOverride: string | null
  }): Promise<GlobalAnalyzeResponse> => {
    return await fetchJson<GlobalAnalyzeResponse>('/api/analyze/global', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
  },

  prompts: {
    getGlobal: async (): Promise<GlobalPromptConfig> => {
      return await fetchJson<GlobalPromptConfig>('/api/prompts/global')
    },
    putGlobal: async (cfg: GlobalPromptConfig): Promise<GlobalPromptConfig> => {
      return await fetchJson<GlobalPromptConfig>('/api/prompts/global', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cfg)
      })
    }
  },

  templates: {
    list: async (): Promise<TemplateListItem[]> => {
      const raw = await fetchJson<unknown>('/api/templates')
      if (!Array.isArray(raw)) return []
      return raw
        .filter((x) => isRecord(x) && typeof x.templateId === 'string')
        .map((x) => {
          const templateId = String(x.templateId)
          const name = typeof x.name === 'string' ? x.name : templateId
          const versions = asStringArray(x.versions)
          return { templateId, name, versions }
        })
    },

    match: async (blocks: Block[]): Promise<TemplateMatchResponse> => {
      return await fetchJson<TemplateMatchResponse>('/api/templates/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blocks })
      })
    },

    getLatest: async (templateId: string): Promise<{ blocks: Block[]; name: string }> => {
      const snapshot = await fetchJson<TemplateSnapshot>(`/api/templates/${encodeURIComponent(templateId)}/latest`)
      const blocks = snapshot && Array.isArray(snapshot.blocks) ? (snapshot.blocks as Block[]) : []
      const name = typeof snapshot?.name === 'string' ? snapshot.name : ''
      return { blocks, name }
    },

    generate: async (payload: { templateId: string; name: string; version: string; file: File }): Promise<TemplateSnapshot> => {
      const formData = new FormData()
      formData.append('templateId', payload.templateId)
      formData.append('name', payload.name)
      formData.append('version', payload.version)
      formData.append('file', payload.file)
      return await fetchJson<TemplateSnapshot>('/api/templates/generate', { method: 'POST', body: formData })
    },

    rename: async (templateId: string, name: string): Promise<void> => {
      await fetchJson(`/api/templates/${encodeURIComponent(templateId)}/name`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      })
    },

    delete: async (templateId: string): Promise<void> => {
      const res = await fetch(`/api/templates/${encodeURIComponent(templateId)}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
    }
  },

  rulesets: {
    get: async (templateId: string): Promise<Ruleset | null> => {
      const raw = await fetchJsonMaybe404<unknown>(`/api/check/rulesets/${encodeURIComponent(templateId)}`)
      if (raw === null) return null
      return normalizeRuleset(templateId, raw)
    },
    put: async (templateId: string, payload: Ruleset): Promise<Ruleset> => {
      const raw = await fetchJson<unknown>(`/api/check/rulesets/${encodeURIComponent(templateId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      const normalized = normalizeRuleset(templateId, raw)
      return normalized || payload
    }
  }
}
