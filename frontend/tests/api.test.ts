import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from '../src/api'

const makeRes = (init: { ok: boolean; status: number; statusText?: string; json?: () => Promise<unknown> }): Response => {
  return {
    ok: init.ok,
    status: init.status,
    statusText: init.statusText ?? '',
    json: init.json ?? (async () => ({}))
  } as unknown as Response
}

describe('api', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('templates.list normalizes the response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        makeRes({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => [{ templateId: 't1', name: 'T1', versions: [1, '2'] }, { templateId: 't2' }]
        })
      )
    )

    const out = await api.templates.list()
    expect(out).toEqual([
      { templateId: 't1', name: 'T1', versions: ['1', '2'] },
      { templateId: 't2', name: 't2', versions: [] }
    ])
  })

  it('templates.list returns empty array on non-array response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        makeRes({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({ templateId: 't1' })
        })
      )
    )

    const out = await api.templates.list()
    expect(out).toEqual([])
  })

  it('rulesets.get returns null on 404', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => makeRes({ ok: false, status: 404, statusText: 'Not Found' })))
    const out = await api.rulesets.get('tid404')
    expect(out).toBeNull()
  })

  it('rulesets.get normalizes minimal payload', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        makeRes({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({
            points: [
              {
                pointId: 'p1',
                title: 'T1',
                severity: 'high',
                anchor: { type: 'structurePath', value: 'sp1' },
                rules: [{ type: 'requiredAfterColon', params: { labelRegex: '甲方' } }]
              }
            ]
          })
        })
      )
    )

    const out = await api.rulesets.get('tid')
    expect(out).toEqual({
      templateId: 'tid',
      name: '',
      version: '',
      referenceData: {},
      points: [
        {
          pointId: 'p1',
          title: 'T1',
          severity: 'high',
          anchor: { type: 'structurePath', value: 'sp1' },
          rules: [{ type: 'requiredAfterColon', params: { labelRegex: '甲方' } }],
          ai: null
        }
      ]
    })
  })

  it('checkRun sends expected payload', async () => {
    const fetchMock = vi.fn(async () =>
      makeRes({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({ runId: 'r1', items: [], summary: { counts: { pass: 0, fail: 0, warn: 0, manual: 0, error: 0, skipped: 0 } } })
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    await api.checkRun('tid', [], true)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/check/run')
    expect(init?.method).toBe('POST')
    expect(init?.headers).toEqual({ 'Content-Type': 'application/json' })
    expect(JSON.parse(init?.body)).toEqual({ templateId: 'tid', rightBlocks: [], aiEnabled: true })
  })
})
