import type { AlignmentRow, Block, CheckRunResponse, GlobalAnalyzeResponse, GlobalPromptConfig, TemplateListItem, TemplateMatchResponse } from './domain/types'

type TemplateSnapshot = {
  templateId?: string
  name?: string
  version?: string
  blocks?: Block[]
}

const fetchJson = async <T>(url: string, init?: RequestInit): Promise<T> => {
  const res = await fetch(url, init)
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return (await res.json()) as T
}

const fetchJsonMaybe404 = async <T>(url: string, init?: RequestInit): Promise<T | null> => {
  const res = await fetch(url, init)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
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

  analyzeGlobal: async (payload: { templateId: string; rightBlocks: Block[]; diffRows: AlignmentRow[]; checkRun: any; promptOverride: string | null }): Promise<GlobalAnalyzeResponse> => {
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
      const items = await fetchJson<any[]>('/api/templates')
      if (!Array.isArray(items)) return []
      return items
        .filter((x: any) => x && typeof x.templateId === 'string')
        .map((x: any) => ({
          templateId: String(x.templateId),
          name: typeof x.name === 'string' ? x.name : String(x.templateId),
          versions: Array.isArray(x.versions) ? x.versions.map((v: any) => String(v)) : []
        }))
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
    get: async (templateId: string): Promise<any | null> => {
      return await fetchJsonMaybe404<any>(`/api/check/rulesets/${encodeURIComponent(templateId)}`)
    },
    put: async (templateId: string, payload: any): Promise<any> => {
      return await fetchJson<any>(`/api/check/rulesets/${encodeURIComponent(templateId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
    }
  }
}
