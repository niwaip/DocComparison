import type {
  AlignmentRow,
  Block,
  CheckAiResult,
  CheckEvidence,
  CheckResultItem,
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

const asBlock = (v: unknown): Block | null => {
  if (!isRecord(v)) return null
  if (typeof v.blockId !== 'string') return null
  if (typeof v.kind !== 'string') return null
  if (typeof v.structurePath !== 'string') return null
  if (typeof v.stableKey !== 'string') return null
  if (typeof v.text !== 'string') return null
  if (typeof v.htmlFragment !== 'string') return null
  const meta = isRecord(v.meta) ? v.meta : {}
  return {
    blockId: v.blockId,
    kind: v.kind,
    structurePath: v.structurePath,
    stableKey: v.stableKey,
    text: v.text,
    htmlFragment: v.htmlFragment,
    meta
  }
}

const asBlockArray = (v: unknown): Block[] => {
  if (!Array.isArray(v)) return []
  return v.map(asBlock).filter((x): x is Block => !!x)
}

const asAlignmentRow = (v: unknown): AlignmentRow | null => {
  if (!isRecord(v)) return null
  if (typeof v.rowId !== 'string') return null
  const kind = v.kind
  if (kind !== 'matched' && kind !== 'inserted' && kind !== 'deleted' && kind !== 'changed') return null
  const leftBlockId = typeof v.leftBlockId === 'string' ? v.leftBlockId : v.leftBlockId === null ? null : null
  const rightBlockId = typeof v.rightBlockId === 'string' ? v.rightBlockId : v.rightBlockId === null ? null : null
  const diffHtml = typeof v.diffHtml === 'string' ? v.diffHtml : undefined
  const leftDiffHtml = typeof v.leftDiffHtml === 'string' ? v.leftDiffHtml : undefined
  const rightDiffHtml = typeof v.rightDiffHtml === 'string' ? v.rightDiffHtml : undefined
  return { rowId: v.rowId, kind, leftBlockId, rightBlockId, diffHtml, leftDiffHtml, rightDiffHtml }
}

const asAlignmentRowArray = (v: unknown): AlignmentRow[] => {
  if (!Array.isArray(v)) return []
  return v.map(asAlignmentRow).filter((x): x is AlignmentRow => !!x)
}

const asGlobalAnalyzeResponse = (v: unknown): GlobalAnalyzeResponse | null => {
  if (!isRecord(v)) return null
  if (typeof v.raw !== 'string') return null
  return { raw: v.raw }
}

const asGlobalPromptConfig = (v: unknown): GlobalPromptConfig | null => {
  if (!isRecord(v)) return null
  const defaultPrompt = typeof v.defaultPrompt === 'string' ? v.defaultPrompt : ''
  const byTemplateIdRaw = v.byTemplateId
  const byTemplateId: Record<string, string> = {}
  if (isRecord(byTemplateIdRaw)) {
    for (const [k, val] of Object.entries(byTemplateIdRaw)) {
      if (typeof val === 'string') byTemplateId[k] = val
    }
  }
  return { defaultPrompt, byTemplateId }
}

const asTemplateMatchResponse = (v: unknown): TemplateMatchResponse | null => {
  if (!isRecord(v)) return null
  const bestRaw = v.best
  const best =
    bestRaw === null || bestRaw === undefined
      ? bestRaw
      : isRecord(bestRaw) &&
          typeof bestRaw.templateId === 'string' &&
          typeof bestRaw.name === 'string' &&
          typeof bestRaw.version === 'string' &&
          typeof bestRaw.score === 'number'
        ? { templateId: bestRaw.templateId, name: bestRaw.name, version: bestRaw.version, score: bestRaw.score }
        : null

  const candidatesRaw = v.candidates
  const candidates =
    Array.isArray(candidatesRaw)
      ? candidatesRaw
          .map((x) => {
            if (!isRecord(x)) return null
            if (typeof x.templateId !== 'string') return null
            if (typeof x.name !== 'string') return null
            if (typeof x.version !== 'string') return null
            if (typeof x.score !== 'number') return null
            return { templateId: x.templateId, name: x.name, version: x.version, score: x.score }
          })
          .filter((x): x is TemplateMatchResponse['candidates'][number] => !!x)
      : []

  return { best, candidates }
}

const invalidResponseError = (url: string) => new Error(`Invalid response: ${url}`)

const asCheckEvidence = (v: unknown): CheckEvidence => {
  const out: CheckEvidence = {}
  if (!isRecord(v)) return out
  const rightBlockId = v.rightBlockId
  if (typeof rightBlockId === 'string' || rightBlockId === null) out.rightBlockId = rightBlockId
  const excerpt = v.excerpt
  if (typeof excerpt === 'string' || excerpt === null) out.excerpt = excerpt
  return out
}

const asCheckAiResult = (v: unknown): CheckAiResult | null => {
  if (v === null) return null
  if (!isRecord(v)) return null
  const status = v.status
  const statusOk =
    status === undefined ||
    status === null ||
    status === 'pass' ||
    status === 'fail' ||
    status === 'warn' ||
    status === 'manual' ||
    status === 'error' ||
    status === 'skipped'
  const out: CheckAiResult = {}
  if (statusOk) out.status = status as CheckAiResult['status']
  if (typeof v.summary === 'string' || v.summary === null) out.summary = v.summary
  if (typeof v.confidence === 'number' || v.confidence === null) out.confidence = v.confidence
  if (typeof v.raw === 'string' || v.raw === null) out.raw = v.raw
  return out
}

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

const buildHttpError = async (url: string, res: Response): Promise<Error> => {
  const base = `HTTP ${res.status} ${res.statusText} (${url})`.trim()
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

type RequestOptions = {
  timeoutMs?: number
}

const withTimeout = (signal: AbortSignal | null | undefined, timeoutMs: number | undefined) => {
  const inputSignal = signal ?? undefined
  if (!timeoutMs || timeoutMs <= 0) return { signal: inputSignal, cleanup: () => undefined, didTimeout: () => false }

  const controller = new AbortController()
  let timedOut = false
  const onAbort = () => controller.abort()
  if (inputSignal) {
    if (inputSignal.aborted) controller.abort()
    else inputSignal.addEventListener('abort', onAbort, { once: true })
  }

  const id = globalThis.setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)
  const cleanup = () => {
    globalThis.clearTimeout(id)
    if (inputSignal) inputSignal.removeEventListener('abort', onAbort)
  }
  return { signal: controller.signal, cleanup, didTimeout: () => timedOut }
}

const request = async (url: string, init?: RequestInit, opts?: RequestOptions): Promise<Response> => {
  const { signal, cleanup, didTimeout } = withTimeout(init?.signal, opts?.timeoutMs)
  try {
    const res = await fetch(url, { ...init, signal })
    if (res.status === 401) {
      if (typeof window !== 'undefined') window.dispatchEvent(new Event('doccmp:unauthorized'))
    }
    return res
  } catch (e) {
    const err = e as unknown
    if (err instanceof DOMException && err.name === 'AbortError' && didTimeout()) {
      throw new Error(`Request timeout: ${url}`)
    }
    if (err instanceof TypeError) {
      const msg = err.message ? `: ${err.message}` : ''
      throw new Error(`Network error: ${url}${msg}`)
    }
    throw e
  } finally {
    cleanup()
  }
}

const fetchJson = async (url: string, init?: RequestInit, opts?: RequestOptions): Promise<unknown> => {
  const res = await request(url, init, opts)
  if (!res.ok) throw await buildHttpError(url, res)
  return (await res.json()) as unknown
}

const fetchJsonMaybe404 = async (url: string, init?: RequestInit, opts?: RequestOptions): Promise<unknown | null> => {
  const res = await request(url, init, opts)
  if (res.status === 404) return null
  if (!res.ok) throw await buildHttpError(url, res)
  return (await res.json()) as unknown
}

const extractFilename = (res: Response): string | null => {
  const cd = res.headers.get('content-disposition') || ''
  const m = /filename="([^"]+)"/i.exec(cd)
  return m?.[1] ? String(m[1]) : null
}

export const api = {
  parseDoc: async (file: File, opts?: { signal?: AbortSignal }): Promise<Block[]> => {
    const formData = new FormData()
    formData.append('file', file)
    const raw = await fetchJson(
      '/api/parse',
      { method: 'POST', body: formData, signal: opts?.signal },
      { timeoutMs: 120_000 }
    )
    if (!Array.isArray(raw)) throw invalidResponseError('/api/parse')
    return asBlockArray(raw)
  },

  diff: async (leftBlocks: Block[], rightBlocks: Block[], opts?: { signal?: AbortSignal }): Promise<AlignmentRow[]> => {
    const raw = await fetchJson('/api/diff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ left_blocks: leftBlocks, right_blocks: rightBlocks }),
      signal: opts?.signal
    }, { timeoutMs: 60_000 })
    const rows = asAlignmentRowArray(raw)
    if (rows.length === 0 && leftBlocks.length > 0 && rightBlocks.length > 0) throw invalidResponseError('/api/diff')
    return rows
  },

  checkRun: async (
    templateId: string,
    rightBlocks: Block[],
    aiEnabled: boolean,
    opts?: { signal?: AbortSignal }
  ): Promise<CheckRunResponse> => {
    const raw = await fetchJson('/api/check/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ templateId, rightBlocks, aiEnabled }),
      signal: opts?.signal
    }, { timeoutMs: 90_000 })
    if (!isRecord(raw)) throw invalidResponseError('/api/check/run')
    if (typeof raw.runId !== 'string') throw invalidResponseError('/api/check/run')
    if (typeof raw.templateId !== 'string') throw invalidResponseError('/api/check/run')
    if (typeof raw.templateVersion !== 'string') throw invalidResponseError('/api/check/run')
    const summaryRaw = raw.summary
    const itemsRaw = raw.items
    if (!isRecord(summaryRaw) || !isRecord(summaryRaw.counts)) throw invalidResponseError('/api/check/run')
    const counts = summaryRaw.counts
    const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : 0)
    const normalized: CheckRunResponse = {
      runId: raw.runId,
      templateId: raw.templateId,
      templateVersion: raw.templateVersion,
      summary: {
        generatedAt: typeof summaryRaw.generatedAt === 'string' ? summaryRaw.generatedAt : undefined,
        counts: {
          pass: num(counts.pass),
          fail: num(counts.fail),
          warn: num(counts.warn),
          manual: num(counts.manual),
          error: num(counts.error),
          skipped: num(counts.skipped)
        }
      },
      items: Array.isArray(itemsRaw)
        ? itemsRaw
            .map((it): CheckResultItem | null => {
              if (!isRecord(it)) return null
              const severity = it.severity
              const status = it.status
              if (severity !== 'high' && severity !== 'medium' && severity !== 'low') return null
              if (
                status !== 'pass' &&
                status !== 'fail' &&
                status !== 'warn' &&
                status !== 'manual' &&
                status !== 'error' &&
                status !== 'skipped'
              ) {
                return null
              }
              if (typeof it.pointId !== 'string') return null
              if (typeof it.title !== 'string') return null
              if (typeof it.message !== 'string') return null
              const evidence = asCheckEvidence(it.evidence)
              const ai = asCheckAiResult(it.ai)
              return {
                pointId: it.pointId,
                title: it.title,
                severity,
                status,
                message: it.message,
                evidence,
                ai
              }
            })
            .filter((x): x is CheckResultItem => !!x)
        : []
    }
    return normalized
  },

  analyzeGlobal: async (
    payload: {
      templateId: string
      rightBlocks: Block[]
      diffRows: AlignmentRow[]
      checkRun: CheckRunResponse | null
      promptOverride: string | null
    },
    opts?: { signal?: AbortSignal }
  ): Promise<GlobalAnalyzeResponse> => {
    const raw = await fetchJson('/api/analyze/global', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: opts?.signal
    }, { timeoutMs: 120_000 })
    const out = asGlobalAnalyzeResponse(raw)
    if (!out) throw invalidResponseError('/api/analyze/global')
    return out
  },

  prompts: {
    getGlobal: async (opts?: { signal?: AbortSignal }): Promise<GlobalPromptConfig> => {
      const init = opts?.signal ? { signal: opts.signal } : undefined
      const raw = await fetchJson('/api/prompts/global', init, { timeoutMs: 20_000 })
      const cfg = asGlobalPromptConfig(raw)
      if (!cfg) throw invalidResponseError('/api/prompts/global')
      return cfg
    },
    putGlobal: async (cfg: GlobalPromptConfig): Promise<GlobalPromptConfig> => {
      const raw = await fetchJson('/api/prompts/global', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cfg)
      }, { timeoutMs: 30_000 })
      const saved = asGlobalPromptConfig(raw)
      if (!saved) throw invalidResponseError('/api/prompts/global')
      return saved
    }
  },

  templates: {
    list: async (): Promise<TemplateListItem[]> => {
      const raw = await fetchJson('/api/templates', undefined, { timeoutMs: 20_000 })
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

    match: async (blocks: Block[], opts?: { signal?: AbortSignal }): Promise<TemplateMatchResponse> => {
      const raw = await fetchJson('/api/templates/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blocks }),
        signal: opts?.signal
      }, { timeoutMs: 30_000 })
      const out = asTemplateMatchResponse(raw)
      if (!out) throw invalidResponseError('/api/templates/match')
      return out
    },

    getLatest: async (templateId: string, opts?: { signal?: AbortSignal }): Promise<{ blocks: Block[]; name: string }> => {
      const init = opts?.signal ? { signal: opts.signal } : undefined
      const raw = await fetchJson(`/api/templates/${encodeURIComponent(templateId)}/latest`, init, { timeoutMs: 30_000 })
      const snapshot = isRecord(raw) ? raw : {}
      const blocks = asBlockArray(snapshot.blocks)
      const name = typeof snapshot.name === 'string' ? snapshot.name : ''
      return { blocks, name }
    },

    generate: async (payload: { templateId: string; name: string; version: string; file: File }): Promise<TemplateSnapshot> => {
      const formData = new FormData()
      formData.append('templateId', payload.templateId)
      formData.append('name', payload.name)
      formData.append('version', payload.version)
      formData.append('file', payload.file)
      const raw = await fetchJson('/api/templates/generate', { method: 'POST', body: formData }, { timeoutMs: 180_000 })
      if (!isRecord(raw)) throw invalidResponseError('/api/templates/generate')
      return {
        templateId: typeof raw.templateId === 'string' ? raw.templateId : undefined,
        name: typeof raw.name === 'string' ? raw.name : undefined,
        version: typeof raw.version === 'string' ? raw.version : undefined,
        blocks: asBlockArray(raw.blocks)
      }
    },

    rename: async (templateId: string, name: string): Promise<void> => {
      await fetchJson(`/api/templates/${encodeURIComponent(templateId)}/name`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      }, { timeoutMs: 30_000 })
    },

    delete: async (templateId: string): Promise<void> => {
      const res = await request(`/api/templates/${encodeURIComponent(templateId)}`, { method: 'DELETE' }, { timeoutMs: 30_000 })
      if (!res.ok) throw await buildHttpError(`/api/templates/${encodeURIComponent(templateId)}`, res)
    }
  },

  rulesets: {
    get: async (templateId: string): Promise<Ruleset | null> => {
      const raw = await fetchJsonMaybe404(`/api/check/rulesets/${encodeURIComponent(templateId)}`, undefined, { timeoutMs: 30_000 })
      if (raw === null) return null
      return normalizeRuleset(templateId, raw)
    },
    put: async (templateId: string, payload: Ruleset): Promise<Ruleset> => {
      const raw = await fetchJson(`/api/check/rulesets/${encodeURIComponent(templateId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }, { timeoutMs: 60_000 })
      const normalized = normalizeRuleset(templateId, raw)
      return normalized || payload
    }
  },
  skills: {
    export: async (templateId: string, version?: string): Promise<void> => {
      const qs = new URLSearchParams()
      qs.set('templateId', templateId)
      if (version) qs.set('version', version)
      const url = `/api/skills/export?${qs.toString()}`
      const res = await request(url, { method: 'GET' }, { timeoutMs: 60_000 })
      if (!res.ok) throw await buildHttpError(url, res)
      const blob = await res.blob()
      const filename = extractFilename(res) || `${templateId}-${version || 'latest'}.cskill`
      const objUrl = URL.createObjectURL(blob)
      try {
        const a = document.createElement('a')
        a.href = objUrl
        a.download = filename
        document.body.appendChild(a)
        a.click()
        a.remove()
      } finally {
        URL.revokeObjectURL(objUrl)
      }
    },

    import: async (file: File, overwriteSameVersion: boolean): Promise<{ skillId: string; skillVersion: string; name: string }> => {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('overwriteSameVersion', overwriteSameVersion ? 'true' : 'false')
      const raw = await fetchJson('/api/skills/import', { method: 'POST', body: formData }, { timeoutMs: 120_000 })
      if (!isRecord(raw)) throw invalidResponseError('/api/skills/import')
      if (typeof raw.skillId !== 'string') throw invalidResponseError('/api/skills/import')
      if (typeof raw.skillVersion !== 'string') throw invalidResponseError('/api/skills/import')
      if (typeof raw.name !== 'string') throw invalidResponseError('/api/skills/import')
      return { skillId: raw.skillId, skillVersion: raw.skillVersion, name: raw.name }
    }
  }
}
