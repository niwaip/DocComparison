import React, { useState } from 'react'

// --- Interfaces ---

interface BlockMeta {
  headingLevel?: number
  pageNumber?: number
}

interface Block {
  blockId: string
  kind: string
  structurePath: string
  stableKey: string
  text: string
  htmlFragment: string
  meta: BlockMeta
}

interface AlignmentRow {
  rowId: string
  kind: 'matched' | 'inserted' | 'deleted' | 'changed'
  leftBlockId: string | null
  rightBlockId: string | null
  diffHtml?: string
  leftDiffHtml?: string
  rightDiffHtml?: string
}

interface CheckEvidence {
  rightBlockId?: string | null
  excerpt?: string | null
}

interface CheckAiResult {
  status?: 'pass' | 'fail' | 'warn' | 'manual' | 'error' | 'skipped' | null
  summary?: string | null
  confidence?: number | null
  raw?: string | null
}

interface CheckResultItem {
  pointId: string
  title: string
  severity: 'high' | 'medium' | 'low'
  status: 'pass' | 'fail' | 'warn' | 'manual' | 'error' | 'skipped'
  message: string
  evidence: CheckEvidence
  ai?: CheckAiResult | null
}

interface CheckRunResponse {
  runId: string
  templateId: string
  templateVersion: string
  summary: any
  items: CheckResultItem[]
}

// --- Component ---

function App() {
  const [leftFile, setLeftFile] = useState<File | null>(null)
  const [rightFile, setRightFile] = useState<File | null>(null)
  
  const [leftBlocks, setLeftBlocks] = useState<Block[]>([])
  const [rightBlocks, setRightBlocks] = useState<Block[]>([])
  
  const [diffRows, setDiffRows] = useState<AlignmentRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showOnlyDiff, setShowOnlyDiff] = useState(false)
  const [activeDiffIndex, setActiveDiffIndex] = useState(0)
  const [activeRowId, setActiveRowId] = useState<string | null>(null)
  const [mode, setMode] = useState<'compare' | 'config'>('compare')
  const [templateId, setTemplateId] = useState('sales_contract_cn')
  const [aiEnabled, setAiEnabled] = useState(false)
  const [checkLoading, setCheckLoading] = useState(false)
  const [checkRun, setCheckRun] = useState<CheckRunResponse | null>(null)
  const [checkFilter, setCheckFilter] = useState<'all' | 'issues'>('issues')
  const [checkExpanded, setCheckExpanded] = useState(false)
  const [checkPaneOpen, setCheckPaneOpen] = useState(false)
  const [rulesetJson, setRulesetJson] = useState('')
  const [rulesetLoading, setRulesetLoading] = useState(false)
  const [templateBlocks, setTemplateBlocks] = useState<Block[]>([])
  const [blockPrompts, setBlockPrompts] = useState<Record<string, string>>({})

  // Helper to map blockId to Block object for rendering
  const getBlock = (blocks: Block[], id: string | null) => {
    if (!id) return null
    return blocks.find(b => b.blockId === id)
  }

  const parseFile = async (file: File, side: 'left' | 'right') => {
    setLoading(true)
    setError('')
    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch('/api/parse', {
        method: 'POST',
        body: formData
      })

      if (!res.ok) {
        throw new Error(`Failed to parse ${side} file: ${res.statusText}`)
      }

      const blocks: Block[] = await res.json()
      if (side === 'left') setLeftBlocks(blocks)
      else setRightBlocks(blocks)
    } catch (err: any) {
      console.error(err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleDiff = async () => {
    if (leftBlocks.length === 0 || rightBlocks.length === 0) {
      setError('Both files must be parsed first.')
      return
    }

    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/diff', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          left_blocks: leftBlocks,
          right_blocks: rightBlocks
        })
      })

      if (!res.ok) {
        throw new Error(`Diff failed: ${res.statusText}`)
      }

      const rows: AlignmentRow[] = await res.json()
      setDiffRows(rows)
      setActiveDiffIndex(0)
      setActiveRowId(null)
      setCheckRun(null)
      setCheckExpanded(false)
      setCheckPaneOpen(false)
      await runChecks()
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
          <h3>{side === 'left' ? 'Original Document' : 'Revised Document'}</h3>
          <p className={fileName ? 'file-name' : 'placeholder'}>
            {fileName || 'Click to upload .docx'}
          </p>
          {blocks.length > 0 && (
            <div className="status-badge">
              ✓ {blocks.length} blocks parsed
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

  const runChecks = async () => {
    if (rightBlocks.length === 0) {
      setError('请先解析右侧合同文件。')
      return
    }
    setCheckLoading(true)
    setError('')
    try {
      const res = await fetch('/api/check/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId,
          rightBlocks,
          aiEnabled
        })
      })
      if (!res.ok) throw new Error(`Check failed: ${res.statusText}`)
      const payload: CheckRunResponse = await res.json()
      setCheckRun(payload)
    } catch (err: any) {
      console.error(err)
      setError(err.message)
    } finally {
      setCheckLoading(false)
    }
  }

  const loadRuleset = async () => {
    setRulesetLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/check/rulesets/${encodeURIComponent(templateId)}`)
      if (!res.ok) throw new Error(`Load ruleset failed: ${res.statusText}`)
      const obj = await res.json()
      setRulesetJson(JSON.stringify(obj, null, 2))
    } catch (err: any) {
      console.error(err)
      setError(err.message)
    } finally {
      setRulesetLoading(false)
    }
  }

  const saveRuleset = async () => {
    setRulesetLoading(true)
    setError('')
    try {
      const parsed = JSON.parse(rulesetJson)
      const res = await fetch(`/api/check/rulesets/${encodeURIComponent(templateId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed)
      })
      if (!res.ok) throw new Error(`Save ruleset failed: ${res.statusText}`)
      const obj = await res.json()
      setRulesetJson(JSON.stringify(obj, null, 2))
    } catch (err: any) {
      console.error(err)
      setError(err.message)
    } finally {
      setRulesetLoading(false)
    }
  }

  const parseTemplateFile = async (file: File) => {
    setLoading(true)
    setError('')
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/parse', { method: 'POST', body: formData })
      if (!res.ok) throw new Error(`Failed to parse template: ${res.statusText}`)
      const blocks: Block[] = await res.json()
      setTemplateBlocks(blocks)
      setBlockPrompts({})
    } catch (err: any) {
      console.error(err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const syncPromptsIntoRuleset = () => {
    try {
      const rs = JSON.parse(rulesetJson || '{}')
      const existing: any[] = Array.isArray(rs.points) ? rs.points : []
      const nextPoints = [...existing]
      templateBlocks.forEach((b, idx) => {
        const prompt = (blockPrompts[b.stableKey] || '').trim()
        if (!prompt) return
        const pointId = `custom.${idx.toString().padStart(4, '0')}.${b.stableKey.slice(0, 10)}`
        nextPoints.push({
          pointId,
          title: prompt.split('\n')[0].slice(0, 60) || `自定义检查 ${idx + 1}`,
          severity: 'medium',
          anchor: { type: 'stableKey', value: b.stableKey },
          rules: [],
          ai: { policy: 'optional', prompt }
        })
      })
      rs.templateId = rs.templateId || templateId
      rs.name = rs.name || '未命名规则集'
      rs.version = rs.version || new Date().toISOString().slice(0, 10)
      rs.points = nextPoints
      setRulesetJson(JSON.stringify(rs, null, 2))
    } catch (e: any) {
      setError(`规则集 JSON 无效：${e?.message || String(e)}`)
    }
  }

  const renderCheckPanel = () => (
    <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', padding: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ fontWeight: 800 }}>检查结果</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {checkRun?.runId && <div style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace' }}>{checkRun.runId}</div>}
          <button className="btn-secondary" onClick={() => { setCheckPaneOpen(v => !v); if (checkPaneOpen) setCheckExpanded(false) }} disabled={!checkRun}>
            {checkPaneOpen ? '收起检查栏' : '展开检查栏'}
          </button>
        </div>
      </div>
      {checkRun ? (
        checkPaneOpen ? (
          <>
            <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn-secondary" title="仅展示非 PASS 的检查项" onClick={() => setCheckFilter('issues')} disabled={checkFilter === 'issues'}>只看问题</button>
              <button className="btn-secondary" title="展示全部检查项（含 PASS）" onClick={() => setCheckFilter('all')} disabled={checkFilter === 'all'}>全部</button>
              <button className="btn-secondary" onClick={() => setCheckExpanded(v => !v)}>{checkExpanded ? '收起明细' : '展开明细'}</button>
            </div>
            <div style={{ marginTop: 10, fontSize: 12, color: 'var(--muted)' }}>
              通过 {checkRun.summary?.counts?.pass ?? 0} · 不通过 {checkRun.summary?.counts?.fail ?? 0} · 警告 {checkRun.summary?.counts?.warn ?? 0} · 需人工 {checkRun.summary?.counts?.manual ?? 0}
            </div>
            {checkExpanded ? (
              <div style={{ marginTop: 10, display: 'grid', gap: 8, paddingRight: 2 }}>
                {checkRun.items
                  .filter(it => checkFilter === 'all' ? true : it.status !== 'pass')
                  .map(it => {
                    const color = it.status === 'fail' ? 'rgba(185, 28, 28, 1)' : it.status === 'warn' ? 'rgba(146, 64, 14, 1)' : it.status === 'manual' ? 'rgba(30, 64, 175, 1)' : 'rgba(15,23,42,0.70)'
                    const bg = it.status === 'fail' ? 'rgba(239,68,68,0.08)' : it.status === 'warn' ? 'rgba(245,158,11,0.10)' : it.status === 'manual' ? 'rgba(37,99,235,0.08)' : 'rgba(15,23,42,0.04)'
                    return (
                      <div key={it.pointId} style={{ border: '1px solid rgba(15,23,42,0.10)', borderRadius: 12, padding: 10, background: bg }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                          <div style={{ fontWeight: 750, lineHeight: 1.25 }}>{it.title}</div>
                        </div>
                        <div style={{ marginTop: 6, color, fontWeight: 750, fontSize: 12 }}>
                          {it.status.toUpperCase()} · {it.severity.toUpperCase()}
                        </div>
                        <div style={{ marginTop: 6, fontSize: 13, color: 'rgba(15,23,42,0.80)' }}>{it.message}</div>
                        {it.evidence?.excerpt && (
                          <div style={{ marginTop: 6, fontSize: 12, color: 'var(--muted)' }}>{it.evidence.excerpt}</div>
                        )}
                        {it.ai?.summary && (
                          <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px dashed rgba(15,23,42,0.12)', fontSize: 12, color: 'rgba(15,23,42,0.78)' }}>
                            AI：{it.ai.summary}
                          </div>
                        )}
                      </div>
                    )
                  })}
              </div>
            ) : (
              <div style={{ marginTop: 10, fontSize: 12, color: 'var(--muted)' }}>
                明细已收起。
              </div>
            )}
          </>
        ) : (
          <div style={{ marginTop: 10, fontSize: 12, color: 'var(--muted)' }}>
            通过 {checkRun.summary?.counts?.pass ?? 0} · 不通过 {checkRun.summary?.counts?.fail ?? 0} · 警告 {checkRun.summary?.counts?.warn ?? 0} · 需人工 {checkRun.summary?.counts?.manual ?? 0}
          </div>
        )
      ) : (
        <div style={{ marginTop: 10, fontSize: 13, color: 'var(--muted)' }}>
          对比后会自动执行检查，也可点击工具栏“运行检查”手动执行。
        </div>
      )}
    </div>
  )

  return (
    <div className="app-container">
      <style>{`
        :root{
          --bg: #0b1220;
          --panel: rgba(255,255,255,0.92);
          --panel-solid: #ffffff;
          --border: rgba(17,24,39,0.10);
          --text: #0f172a;
          --muted: rgba(15,23,42,0.62);
          --primary: #2563eb;
          --primary-pressed: #1d4ed8;
          --shadow: 0 10px 30px rgba(2, 6, 23, 0.08);
          --radius: 14px;
        }

        body {
          margin: 0;
          color: var(--text);
          background:
            radial-gradient(1200px 800px at 20% -10%, rgba(37,99,235,0.22), transparent 55%),
            radial-gradient(1000px 700px at 90% 0%, rgba(16,185,129,0.14), transparent 50%),
            #f5f7fb;
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
          background: rgba(15,23,42,0.03);
          color: rgba(15,23,42,0.85);
          border: 1px solid rgba(15,23,42,0.10);
          border-radius: 12px;
          padding: 10px 12px;
          font-size: 13px;
          font-weight: 650;
          cursor: pointer;
          transition: transform 0.12s ease, box-shadow 0.12s ease, background 0.12s ease;
        }
        .btn-secondary:hover { transform: translateY(-1px); box-shadow: 0 8px 16px rgba(2, 6, 23, 0.08); background: rgba(15,23,42,0.05); }
        .btn-secondary:disabled { opacity: 0.55; cursor: not-allowed; transform: none; box-shadow: none; }
        .switch {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 8px 10px;
          border: 1px solid rgba(15,23,42,0.10);
          border-radius: 999px;
          background: rgba(255,255,255,0.65);
          user-select: none;
        }
        .switch input { width: 16px; height: 16px; }
        .switch span { font-size: 13px; font-weight: 650; color: rgba(15,23,42,0.78); }

        .upload-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
          margin: 14px 0 18px;
        }
        .file-upload-card {
          background: var(--panel);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          padding: 16px;
          display: flex;
          align-items: center;
          gap: 14px;
          cursor: pointer;
          transition: transform 0.12s ease, box-shadow 0.12s ease, border-color 0.12s ease;
          box-shadow: 0 6px 18px rgba(2, 6, 23, 0.06);
        }
        .file-upload-card:hover { transform: translateY(-1px); border-color: rgba(37,99,235,0.35); box-shadow: 0 10px 24px rgba(2, 6, 23, 0.10); }
        .upload-icon { font-size: 28px; opacity: 0.9; }
        .upload-info h3 { margin: 0 0 4px 0; font-size: 14px; font-weight: 650; }
        .file-name { color: var(--primary); font-weight: 600; margin: 0; }
        .placeholder { color: var(--muted); margin: 0; }
        .status-badge { display: inline-block; margin-top: 8px; font-size: 12px; color: rgba(2, 122, 72, 1); background: rgba(16,185,129,0.14); padding: 3px 10px; border-radius: 999px; font-weight: 600; }

        .error-msg { padding: 12px 14px; background: rgba(239,68,68,0.10); border: 1px solid rgba(239,68,68,0.25); border-radius: var(--radius); color: rgba(153, 27, 27, 1); margin: 10px 0 18px; display: flex; align-items: center; gap: 8px; box-shadow: 0 6px 14px rgba(2, 6, 23, 0.05); }

        .diff-container {
          background: var(--panel-solid);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          box-shadow: var(--shadow);
          overflow: auto;
          max-height: calc(100vh - 230px);
        }
        table { border-collapse: collapse; width: 100%; table-layout: fixed; }
        thead th {
          position: sticky;
          top: 0;
          z-index: 3;
          background: rgba(248, 250, 252, 0.92);
          backdrop-filter: blur(10px);
          color: var(--muted);
          font-weight: 650;
          font-size: 12px;
          padding: 12px 14px;
          text-align: left;
          border-bottom: 1px solid var(--border);
        }
        td {
          padding: 12px 14px;
          border-bottom: 1px solid rgba(15,23,42,0.06);
          vertical-align: top;
          font-size: 14px;
          line-height: 1.65;
          color: var(--text);
        }
        tbody tr:hover td { background: rgba(2, 6, 23, 0.02); }
        tr.diff-row-active td { box-shadow: inset 0 0 0 2px rgba(37,99,235,0.28); }
        tr:last-child td { border-bottom: none; }
        
        .block-content { 
          white-space: pre-wrap;
          word-break: break-word;
        }
        .block-content p { margin: 0 0 8px 0; }
        .block-content p:last-child { margin-bottom: 0; }
        .block-content ul, .block-content ol { margin: 4px 0; padding-left: 24px; }
        .block-content li { margin-bottom: 4px; }
        
        .bg-inserted { background-color: rgba(16,185,129,0.06); }
        .bg-inserted .status-cell { color: rgba(2, 122, 72, 1); }
        .bg-deleted { background-color: rgba(239,68,68,0.06); }
        .bg-deleted .status-cell { color: rgba(185, 28, 28, 1); }
        .bg-changed { background-color: rgba(245, 158, 11, 0.06); }
        .bg-changed .status-cell { color: rgba(146, 64, 14, 1); }
        
        .status-cell { text-align: center; font-weight: 800; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace; font-size: 14px; user-select: none; }

        .aligned-lines { display: block; overflow: hidden; }
        .aligned-line { display: block; white-space: pre-wrap; word-break: break-word; }
        .aligned-line.empty { color: transparent; }
        .aligned-table { width: 200%; border-collapse: collapse; table-layout: fixed; transform: translateX(0); }
        .aligned-table.right-view { transform: translateX(-50%); }
        .aligned-table td { padding: 0; border: 0; vertical-align: top; }
        .aligned-table .aligned-col { width: 50%; }
        .aligned-cell-inner { width: 100%; white-space: pre-wrap; word-break: break-word; }
        .aligned-table.left-view td.right-col .aligned-cell-inner { visibility: hidden; }
        .aligned-table.right-view td.left-col .aligned-cell-inner { visibility: hidden; }
        
        .meta-info { display: none; }

        @media (max-width: 980px) {
          .upload-grid { grid-template-columns: 1fr; }
          .diff-container { max-height: none; }
        }
      `}</style>

      <div className="header">
        <h1>
          <div className="header-logo">D</div>
          DocComparison
        </h1>
        <div className="toolbar">
          <button
            className="btn-secondary"
            onClick={() => { setMode(mode === 'compare' ? 'config' : 'compare'); setError('') }}
          >
            {mode === 'compare' ? '配置规则' : '返回对比'}
          </button>
          {mode === 'compare' && (
            <>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={aiEnabled}
                  onChange={(e) => setAiEnabled(e.target.checked)}
                />
                <span>启用AI检查</span>
              </label>
              <input
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
                style={{ height: 38, borderRadius: 12, border: '1px solid rgba(15,23,42,0.10)', padding: '0 10px', fontWeight: 650 }}
              />
              <button
                className="btn-secondary"
                onClick={runChecks}
                disabled={checkLoading || rightBlocks.length === 0}
              >
                {checkLoading ? '检查中...' : (checkRun ? '重新检查' : '运行检查')}
              </button>
              {checkRun && (
                <>
                  <button
                    className="btn-secondary"
                    title="仅展示非 PASS 的检查项"
                    onClick={() => setCheckFilter('issues')}
                    disabled={checkFilter === 'issues'}
                  >
                    只看问题
                  </button>
                  <button
                    className="btn-secondary"
                    title="展示全部检查项（含 PASS）"
                    onClick={() => setCheckFilter('all')}
                    disabled={checkFilter === 'all'}
                  >
                    全部
                  </button>
                </>
              )}
              <button
                className="btn-secondary"
                onClick={() => { setCheckPaneOpen(v => !v); if (checkPaneOpen) setCheckExpanded(false) }}
              >
                {checkPaneOpen ? '收起检查栏' : '展开检查栏'}
              </button>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={showOnlyDiff}
                  onChange={(e) => { setShowOnlyDiff(e.target.checked); setActiveDiffIndex(0) }}
                />
                <span>只看差异</span>
              </label>
              <button
                className="btn-secondary"
                onClick={() => jumpToDiff(activeDiffIndex - 1)}
                disabled={diffOnlyRows.length === 0}
              >
                上一处差异
              </button>
              <button
                className="btn-secondary"
                onClick={() => jumpToDiff(activeDiffIndex + 1)}
                disabled={diffOnlyRows.length === 0}
              >
                下一处差异
              </button>
              <button 
                className="btn-primary"
                onClick={handleDiff} 
                disabled={loading || leftBlocks.length === 0 || rightBlocks.length === 0}
              >
                {loading ? 'Processing...' : 'Compare Documents'}
              </button>
            </>
          )}
        </div>
      </div>
      
      {mode === 'compare' && (
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
      )}

      {mode === 'compare' && checkRun && diffRows.length === 0 && (
        <div style={{ marginTop: 14 }}>
          {renderCheckPanel()}
        </div>
      )}

      {error && (
        <div className="error-msg">
          <span>⚠️</span> {error}
        </div>
      )}

      {mode === 'compare' && diffRows.length > 0 && (
        <div className="diff-container">
          <table>
          <colgroup>
            <col style={{ width: '42%' }} />
            <col style={{ width: '40px' }} />
            <col style={{ width: '42%' }} />
            {checkPaneOpen && <col style={{ width: '360px' }} />}
          </colgroup>
          <thead>
            <tr>
              <th>Original Content</th>
              <th></th>
              <th>Modified Content</th>
              {checkPaneOpen && (
                <th>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <div>检查结果</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {checkRun ? (
                        <div style={{ fontSize: 11, color: 'rgba(15,23,42,0.55)' }}>
                          通过 {checkRun.summary?.counts?.pass ?? 0} · 不通过 {checkRun.summary?.counts?.fail ?? 0} · 警告 {checkRun.summary?.counts?.warn ?? 0} · 需人工 {checkRun.summary?.counts?.manual ?? 0}
                        </div>
                      ) : (
                        <div style={{ fontSize: 11, color: 'rgba(15,23,42,0.55)' }}>未运行检查</div>
                      )}
                      <button
                        className="btn-secondary"
                        style={{ padding: '6px 10px', fontSize: 12 }}
                        onClick={() => setCheckExpanded(v => !v)}
                      >
                        {checkExpanded ? '汇总' : '明细'}
                      </button>
                      <button
                        className="btn-secondary"
                        style={{ padding: '6px 10px', fontSize: 12 }}
                        onClick={() => { setCheckPaneOpen(false); setCheckExpanded(false) }}
                      >
                        收起栏
                      </button>
                      {checkLoading && <div style={{ fontSize: 11, color: 'rgba(15,23,42,0.55)' }}>检查中...</div>}
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
                    <td style={{ borderLeft: '1px solid rgba(15,23,42,0.06)', background: 'rgba(248,250,252,0.55)' }}>
                      {checkRun ? (
                        checkExpanded ? (
                          rowVisibleCheckItems.length > 0 ? (
                            <div style={{ display: 'grid', gap: 8 }}>
                              {rowVisibleCheckItems.map(it => {
                                const color = it.status === 'fail' ? 'rgba(185, 28, 28, 1)' : it.status === 'warn' ? 'rgba(146, 64, 14, 1)' : it.status === 'manual' ? 'rgba(30, 64, 175, 1)' : it.status === 'error' ? 'rgba(185, 28, 28, 1)' : 'rgba(15,23,42,0.70)'
                                const tagBg = it.status === 'fail' ? 'rgba(239,68,68,0.10)' : it.status === 'warn' ? 'rgba(245,158,11,0.14)' : it.status === 'manual' ? 'rgba(37,99,235,0.10)' : it.status === 'error' ? 'rgba(239,68,68,0.10)' : 'rgba(15,23,42,0.06)'
                                return (
                                  <div key={it.pointId} style={{ border: '1px solid rgba(15,23,42,0.10)', borderRadius: 12, padding: 10, background: 'rgba(255,255,255,0.75)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                                      <div style={{ fontWeight: 750, lineHeight: 1.25 }}>{it.title}</div>
                                      <div style={{ fontSize: 11, fontWeight: 800, color, background: tagBg, padding: '3px 8px', borderRadius: 999 }}>
                                        {it.status.toUpperCase()}
                                      </div>
                                    </div>
                                    <div style={{ marginTop: 6, fontSize: 13, color: 'rgba(15,23,42,0.80)' }}>{it.message}</div>
                                    {it.ai?.summary && (
                                      <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px dashed rgba(15,23,42,0.12)', fontSize: 12, color: 'rgba(15,23,42,0.78)' }}>
                                        AI：{it.ai.summary}
                                      </div>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          ) : (
                            <div style={{ fontSize: 12, color: 'rgba(15,23,42,0.55)' }}>
                              {!row.rightBlockId ? '—' : rowAllCheckItems.length === 0 ? '无检查项' : checkFilter === 'issues' ? '通过' : '—'}
                            </div>
                          )
                        ) : (
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                            {(() => {
                              if (!row.rightBlockId) return <div style={{ fontSize: 12, color: 'rgba(15,23,42,0.55)' }}>—</div>
                              if (rowAllCheckItems.length === 0) return <div style={{ fontSize: 12, color: 'rgba(15,23,42,0.55)' }}>无检查项</div>
                              const fail = rowAllCheckItems.filter(it => it.status === 'fail').length
                              const warn = rowAllCheckItems.filter(it => it.status === 'warn').length
                              const manual = rowAllCheckItems.filter(it => it.status === 'manual').length
                              const err = rowAllCheckItems.filter(it => it.status === 'error').length
                              const skipped = rowAllCheckItems.filter(it => it.status === 'skipped').length
                              const nonPass = rowAllCheckItems.filter(it => it.status !== 'pass').length

                              const Badge = ({ text, fg, bg }: { text: string, fg: string, bg: string }) => (
                                <span style={{ fontSize: 11, fontWeight: 800, color: fg, background: bg, padding: '3px 8px', borderRadius: 999, border: '1px solid rgba(15,23,42,0.08)' }}>
                                  {text}
                                </span>
                              )

                              const badges: React.ReactNode[] = []
                              if (fail > 0) badges.push(<Badge key="fail" text={`不通过 ${fail}`} fg="rgba(185, 28, 28, 1)" bg="rgba(239,68,68,0.10)" />)
                              if (warn > 0) badges.push(<Badge key="warn" text={`警告 ${warn}`} fg="rgba(146, 64, 14, 1)" bg="rgba(245,158,11,0.14)" />)
                              if (manual > 0) badges.push(<Badge key="manual" text={`需人工 ${manual}`} fg="rgba(30, 64, 175, 1)" bg="rgba(37,99,235,0.10)" />)
                              if (err > 0) badges.push(<Badge key="error" text={`错误 ${err}`} fg="rgba(185, 28, 28, 1)" bg="rgba(239,68,68,0.10)" />)
                              if (skipped > 0 && badges.length === 0) badges.push(<Badge key="skipped" text={`跳过 ${skipped}`} fg="rgba(15,23,42,0.70)" bg="rgba(15,23,42,0.06)" />)
                              if (badges.length === 0 && nonPass === 0) badges.push(<Badge key="pass" text="通过" fg="rgba(22, 101, 52, 1)" bg="rgba(34,197,94,0.12)" />)
                              return badges
                            })()}
                          </div>
                        )
                      ) : (
                        <div style={{ fontSize: 12, color: 'rgba(15,23,42,0.55)' }}>—</div>
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

      {mode === 'config' && (
        <div style={{ display: 'grid', gap: 14 }}>
          <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', padding: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ fontWeight: 800 }}>规则配置</div>
              <input
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
                style={{ height: 38, borderRadius: 12, border: '1px solid rgba(15,23,42,0.10)', padding: '0 10px', fontWeight: 650 }}
              />
              <button className="btn-secondary" onClick={loadRuleset} disabled={rulesetLoading}>{rulesetLoading ? '加载中...' : '加载规则集'}</button>
              <button className="btn-primary" onClick={saveRuleset} disabled={rulesetLoading || !rulesetJson.trim()}>{rulesetLoading ? '保存中...' : '保存规则集'}</button>
            </div>
            <div style={{ marginTop: 12 }}>
              <textarea
                value={rulesetJson}
                onChange={(e) => setRulesetJson(e.target.value)}
                placeholder="点击“加载规则集”，或直接粘贴/编辑 Ruleset JSON"
                style={{ width: '100%', minHeight: 260, resize: 'vertical', borderRadius: 12, border: '1px solid rgba(15,23,42,0.10)', padding: 12, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace', fontSize: 12, lineHeight: 1.5 }}
              />
            </div>
          </div>

          <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', padding: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ fontWeight: 800 }}>按分块录入检查内容（用于 AI 可选检查）</div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button className="btn-secondary" onClick={syncPromptsIntoRuleset} disabled={!rulesetJson.trim() || templateBlocks.length === 0}>同步到规则集</button>
              </div>
            </div>
            <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>上传标准合同（用于展示分块）</div>
                <div className="file-upload-card" onClick={() => {}}>
                  <input
                    type="file"
                    accept=".docx"
                    style={{ display: 'block' }}
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f) parseTemplateFile(f)
                    }}
                  />
                </div>
                <div style={{ marginTop: 10, fontSize: 12, color: 'var(--muted)' }}>
                  录入的“检查内容”会作为该分块的 AI 提示词，点击“同步到规则集”后可保存。
                </div>
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                建议写法：第一行写检查点标题，后续写判断标准/输出要求。AI 关闭时，这些检查点不会自动判定，通过规则引擎的结果为准。
              </div>
            </div>
            {templateBlocks.length > 0 && (
              <div style={{ marginTop: 12, display: 'grid', gap: 10, maxHeight: '60vh', overflow: 'auto', paddingRight: 2 }}>
                {templateBlocks.map((b) => (
                  <div key={b.blockId} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, border: '1px solid rgba(15,23,42,0.10)', borderRadius: 12, padding: 12, background: 'rgba(255,255,255,0.6)' }}>
                    <div>
                      <div style={{ fontWeight: 750, marginBottom: 6 }}>分块内容</div>
                      <div style={{ fontSize: 12, color: 'rgba(15,23,42,0.78)', whiteSpace: 'pre-wrap' }}>{(b.text || '').slice(0, 260)}{(b.text || '').length > 260 ? '…' : ''}</div>
                      <div style={{ marginTop: 6, fontSize: 11, color: 'var(--muted)' }}>{b.stableKey}</div>
                    </div>
                    <div>
                      <div style={{ fontWeight: 750, marginBottom: 6 }}>检查内容</div>
                      <textarea
                        value={blockPrompts[b.stableKey] || ''}
                        onChange={(e) => setBlockPrompts((prev) => ({ ...prev, [b.stableKey]: e.target.value }))}
                        placeholder="例如：\n交货日期请填写，至少精确到月\n- 若为空或仅占位线：不通过\n- 输出：缺失位置与建议填写格式"
                        style={{ width: '100%', minHeight: 110, resize: 'vertical', borderRadius: 10, border: '1px solid rgba(15,23,42,0.10)', padding: 10, fontSize: 12, lineHeight: 1.5 }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default App
