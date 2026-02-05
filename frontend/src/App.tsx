import React, { useEffect, useState } from 'react'

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
  const [configOpen, setConfigOpen] = useState(false)
  const [templateId, setTemplateId] = useState('sales_contract_cn')
  const [aiEnabled, setAiEnabled] = useState(false)
  const [attachmentPaneOpen, setAttachmentPaneOpen] = useState(true)
  const [uploadPaneCollapsed, setUploadPaneCollapsed] = useState(false)
  const [rulesetOptions, setRulesetOptions] = useState<Array<{ templateId: string, name: string }>>([
    { templateId: 'sales_contract_cn', name: '买卖合同（销售）' }
  ])
  const [checkLoading, setCheckLoading] = useState(false)
  const [checkRun, setCheckRun] = useState<CheckRunResponse | null>(null)
  const [checkFilter, setCheckFilter] = useState<'all' | 'issues'>('all')
  const [checkPaneOpen, setCheckPaneOpen] = useState(false)
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const [rulesetJson, setRulesetJson] = useState('')
  const [rulesetLoading, setRulesetLoading] = useState(false)
  const [templateBlocks, setTemplateBlocks] = useState<Block[]>([])
  const [blockPrompts, setBlockPrompts] = useState<Record<string, string>>({})

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch('/api/check/rulesets')
        if (!res.ok) return
        const items = await res.json()
        if (cancelled) return
        if (!Array.isArray(items)) return
        const next = items
          .filter((x: any) => x && typeof x.templateId === 'string')
          .map((x: any) => ({ templateId: String(x.templateId), name: typeof x.name === 'string' ? x.name : String(x.templateId) }))
        if (next.length > 0) setRulesetOptions(next)
      } catch {
        if (cancelled) return
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

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
        throw new Error(`解析${side === 'left' ? '左侧' : '右侧'}文件失败：${res.statusText}`)
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
      setError('请先解析左右两份文件。')
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
        throw new Error(`对比失败：${res.statusText}`)
      }

      const rows: AlignmentRow[] = await res.json()
      setDiffRows(rows)
      setActiveDiffIndex(0)
      setActiveRowId(null)
      setCheckRun(null)
      setCheckPaneOpen(false)
      setUploadPaneCollapsed(true)
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
          <h3>{side === 'left' ? '原始文档' : '修订文档'}</h3>
          <p className={fileName ? 'file-name' : 'placeholder'}>
            {fileName || '点击上传 .docx'}
          </p>
          {blocks.length > 0 && (
            <div className="status-badge">
              ✓ 已解析 {blocks.length} 个分块
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
      if (!res.ok) throw new Error(`检查失败：${res.statusText}`)
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
      if (!res.ok) throw new Error(`加载规则集失败：${res.statusText}`)
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
      if (!res.ok) throw new Error(`保存规则集失败：${res.statusText}`)
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
      if (!res.ok) throw new Error(`解析标准合同失败：${res.statusText}`)
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

  const renderCheckPanel = () => {
    if (!checkRun) return null
    const items = checkRun.items.filter(it => checkFilter === 'all' ? true : it.status !== 'pass')
    return (
      <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', padding: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ fontWeight: 800 }}>检查结果</div>
          {checkRun.runId && <div style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace' }}>{checkRun.runId}</div>}
        </div>
        <div style={{ marginTop: 10, fontSize: 12, color: 'var(--muted)' }}>
          通过 {checkRun.summary?.counts?.pass ?? 0} · 不通过 {checkRun.summary?.counts?.fail ?? 0} · 警告 {checkRun.summary?.counts?.warn ?? 0} · 需人工 {checkRun.summary?.counts?.manual ?? 0}
        </div>
        {items.length > 0 ? (
          <div style={{ marginTop: 10, display: 'grid', gap: 8, paddingRight: 2 }}>
            {items.map(it => {
              const color = it.status === 'fail' ? 'rgba(185, 28, 28, 1)' : it.status === 'warn' ? 'rgba(146, 64, 14, 1)' : it.status === 'manual' ? 'rgba(30, 64, 175, 1)' : 'var(--text)'
              const bg = it.status === 'fail' ? 'rgba(239,68,68,0.10)' : it.status === 'warn' ? 'rgba(245,158,11,0.14)' : it.status === 'manual' ? 'rgba(37,99,235,0.10)' : 'rgba(255,255,255,0.06)'
              return (
                <div key={it.pointId} style={{ border: '1px solid var(--control-border)', borderRadius: 12, padding: 10, background: bg }}>
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
                  {it.ai?.summary && (
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px dashed var(--control-border)', fontSize: 12, color: 'var(--muted)' }}>
                      AI：{it.ai.summary}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          <div style={{ marginTop: 10, fontSize: 13, color: 'var(--muted)' }}>
            {checkFilter === 'issues' ? '未发现问题。' : '无检查项。'}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="app-container">
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
          gap: 10px;
          padding: 8px 10px;
          border: 1px solid var(--control-border);
          border-radius: 999px;
          background: var(--control-bg);
          user-select: none;
          cursor: pointer;
        }
        .switch input {
          position: absolute;
          opacity: 0;
          width: 1px;
          height: 1px;
          overflow: hidden;
        }
        .switch-ui {
          width: 40px;
          height: 22px;
          border-radius: 999px;
          background: var(--divider-bg);
          position: relative;
          transition: background 0.12s ease, box-shadow 0.12s ease;
          flex: 0 0 auto;
        }
        .switch-ui::after {
          content: '';
          position: absolute;
          top: 3px;
          left: 3px;
          width: 16px;
          height: 16px;
          border-radius: 999px;
          background: rgba(255,255,255,0.98);
          box-shadow: 0 6px 12px rgba(2, 6, 23, 0.12);
          transition: transform 0.12s ease;
        }
        .switch input:checked + .switch-ui { background: rgba(37,99,235,0.55); }
        .switch input:checked + .switch-ui::after { transform: translateX(18px); }
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
          gap: 14px;
          margin: 0;
          flex: 1 1 auto;
        }

        .side-actions {
          width: 320px;
          flex: 0 0 320px;
          background: var(--panel);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          padding: 14px;
          box-shadow: 0 6px 18px rgba(2, 6, 23, 0.06);
          display: flex;
          flex-direction: column;
          gap: 12px;
          justify-content: space-between;
        }
        .side-actions-top {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 12px;
          align-items: end;
        }
        .field-label { font-size: 12px; font-weight: 700; color: var(--muted); margin-bottom: 6px; }
        .select {
          width: 100%;
          height: 38px;
          border-radius: 12px;
          border: 1px solid var(--control-border);
          padding: 0 10px;
          font-weight: 650;
          background: var(--control-bg);
          color: var(--control-text);
        }
        .side-actions-buttons {
          display: grid;
          gap: 10px;
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
          overflow: visible;
          max-height: none;
        }
        table { border-collapse: collapse; width: 100%; table-layout: fixed; }
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
        tbody tr:hover td { background: rgba(255,255,255,0.03); }
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
        .bg-inserted td:first-child { box-shadow: inset 4px 0 0 var(--row-ins-accent); }
        .bg-deleted td:first-child { box-shadow: inset 4px 0 0 var(--row-del-accent); }
        .bg-changed td:first-child { box-shadow: inset 4px 0 0 var(--row-chg-accent); }
        
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
          .upload-wrap { flex-direction: column; }
          .side-actions { width: auto; flex: 1 1 auto; }
          .upload-grid { grid-template-columns: 1fr; }
          .diff-container { max-height: none; }
        }
      `}</style>

      <div className="header">
        <h1>
          <div className="header-logo">D</div>
          文档对比
        </h1>
        <div className="toolbar">
          <button
            className="btn-secondary"
            onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
            title={theme === 'dark' ? '切换到亮色系' : '切换到暗色系'}
          >
            {theme === 'dark' ? '☀️ 亮色' : '🌙 暗色'}
          </button>
          <button
            className="btn-secondary"
            onClick={() => { setConfigOpen(true); setError('') }}
          >
            ⚙ 配置规则
          </button>
        </div>
      </div>
      
      {uploadPaneCollapsed ? (
        <div className="upload-collapsed">
          <div className="upload-collapsed-files">
            <div><b>原始：</b>{leftFile?.name || '未选择'}</div>
            <div><b>修订：</b>{rightFile?.name || '未选择'}</div>
          </div>
          <button className="icon-btn" title="展开上传区" onClick={() => setUploadPaneCollapsed(false)}>▾</button>
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
              <div style={{ display: 'grid', gap: 12 }}>
                <div>
                  <div className="field-label">合同类型</div>
                  <select
                    className="select"
                    value={templateId}
                    onChange={(e) => setTemplateId(e.target.value)}
                  >
                    {(rulesetOptions.some(o => o.templateId === templateId) ? rulesetOptions : [{ templateId, name: templateId }, ...rulesetOptions]).map(o => (
                      <option key={o.templateId} value={o.templateId}>{o.name}</option>
                    ))}
                  </select>
                </div>
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={aiEnabled}
                    onChange={(e) => setAiEnabled(e.target.checked)}
                  />
                  <span className="switch-ui" aria-hidden="true" />
                  <span className="switch-text">启用AI检查</span>
                </label>
              </div>
              <button 
                className="btn-primary"
                onClick={handleDiff} 
                disabled={loading || leftBlocks.length === 0 || rightBlocks.length === 0}
                style={{ height: 88, padding: '10px 18px' }}
              >
                {loading ? '⏳ 对比中' : '⇄ 开始对比'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mid-actions">
        <button
          className="icon-btn"
          title={attachmentPaneOpen ? '收起附件区' : '展开附件区'}
          onClick={() => setAttachmentPaneOpen(v => !v)}
        >
          {attachmentPaneOpen ? '📎▾' : '📎▸'}
        </button>
        {attachmentPaneOpen && (
          <>
            <label className="switch" title="仅展示差异行">
              <input
                type="checkbox"
                checked={showOnlyDiff}
                onChange={(e) => { setShowOnlyDiff(e.target.checked); setActiveDiffIndex(0) }}
              />
              <span className="switch-ui" aria-hidden="true" />
              <span className="switch-text">只看差异</span>
            </label>
            <button
              className="btn-secondary"
              onClick={() => jumpToDiff(activeDiffIndex - 1)}
              disabled={diffOnlyRows.length === 0}
              title="上一处差异"
            >
              ↑
            </button>
            <button
              className="btn-secondary"
              onClick={() => jumpToDiff(activeDiffIndex + 1)}
              disabled={diffOnlyRows.length === 0}
              title="下一处差异"
            >
              ↓
            </button>
          </>
        )}
        <label className="switch" title="开启：只看问题；关闭：全部">
          <input
            type="checkbox"
            checked={checkFilter === 'issues'}
            onChange={(e) => setCheckFilter(e.target.checked ? 'issues' : 'all')}
          />
          <span className="switch-ui" aria-hidden="true" />
          <span className="switch-text">{checkFilter === 'issues' ? '只看问题' : '全部'}</span>
        </label>
        <button
          className="icon-btn"
          title={checkPaneOpen ? '收起检查栏' : '展开检查栏'}
          onClick={() => setCheckPaneOpen(v => !v)}
          disabled={!checkRun}
        >
          {checkPaneOpen ? '🧾▾' : '🧾▸'}
        </button>
      </div>

      {checkRun && checkPaneOpen && diffRows.length === 0 && (
        <div style={{ marginTop: 14 }}>
          {renderCheckPanel()}
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
            <col style={{ width: '48%' }} />
            <col style={{ width: '24px' }} />
            <col style={{ width: '48%' }} />
            {checkPaneOpen && <col style={{ width: '360px' }} />}
          </colgroup>
          <thead>
            <tr>
              <th style={{ textAlign: 'center' }}>原文内容</th>
              <th className="status-divider"></th>
              <th style={{ textAlign: 'center' }}>修订内容</th>
              {checkPaneOpen && (
                <th>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <div>检查结果</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {checkRun ? (
                        <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                          通过 {checkRun.summary?.counts?.pass ?? 0} · 不通过 {checkRun.summary?.counts?.fail ?? 0} · 警告 {checkRun.summary?.counts?.warn ?? 0} · 需人工 {checkRun.summary?.counts?.manual ?? 0}
                        </div>
                      ) : (
                        <div style={{ fontSize: 11, color: 'var(--muted)' }}>未运行检查</div>
                      )}
                      {checkLoading && <div style={{ fontSize: 11, color: 'var(--muted)' }}>检查中...</div>}
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
                    <td style={{ borderLeft: '1px solid var(--border)', background: 'rgba(255,255,255,0.04)' }}>
                      {checkRun ? (
                        rowVisibleCheckItems.length > 0 ? (
                          <div style={{ display: 'grid', gap: 8 }}>
                            {rowVisibleCheckItems.map(it => {
                              const color = it.status === 'fail' ? 'rgba(185, 28, 28, 1)' : it.status === 'warn' ? 'rgba(146, 64, 14, 1)' : it.status === 'manual' ? 'rgba(30, 64, 175, 1)' : it.status === 'error' ? 'rgba(185, 28, 28, 1)' : 'var(--text)'
                              const tagBg = it.status === 'fail' ? 'rgba(239,68,68,0.10)' : it.status === 'warn' ? 'rgba(245,158,11,0.14)' : it.status === 'manual' ? 'rgba(37,99,235,0.10)' : it.status === 'error' ? 'rgba(239,68,68,0.10)' : 'var(--divider-bg)'
                              return (
                                <div key={it.pointId} style={{ border: '1px solid var(--control-border)', borderRadius: 12, padding: 10, background: 'rgba(255,255,255,0.06)' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                                    <div style={{ fontWeight: 750, lineHeight: 1.25 }}>{it.title}</div>
                                    <div style={{ fontSize: 11, fontWeight: 800, color, background: tagBg, padding: '3px 8px', borderRadius: 999 }}>
                                      {it.status.toUpperCase()}
                                    </div>
                                  </div>
                                  <div style={{ marginTop: 6, fontSize: 13, color: 'var(--text)' }}>{it.message}</div>
                                  {it.ai?.summary && (
                                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px dashed var(--control-border)', fontSize: 12, color: 'var(--muted)' }}>
                                      AI：{it.ai.summary}
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        ) : (
                          <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                            {!row.rightBlockId ? '—' : checkFilter === 'issues' ? '—' : '无检查项'}
                          </div>
                        )
                      ) : (
                        <div style={{ fontSize: 12, color: 'var(--muted)' }}>—</div>
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

      {configOpen && (
        <div
          className="modal-overlay"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setConfigOpen(false)
          }}
        >
          <div className="modal" role="dialog" aria-modal="true">
            <div className="modal-topbar">
              <div className="modal-title">规则配置</div>
              <button className="icon-btn" title="关闭" onClick={() => setConfigOpen(false)}>✕</button>
            </div>
            <div style={{ padding: 14, display: 'grid', gap: 14 }}>
          <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', padding: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ fontWeight: 800 }}>规则配置</div>
              <select
                className="select"
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
                style={{ width: 260 }}
              >
                {(rulesetOptions.some(o => o.templateId === templateId) ? rulesetOptions : [{ templateId, name: templateId }, ...rulesetOptions]).map(o => (
                  <option key={o.templateId} value={o.templateId}>{o.name}</option>
                ))}
              </select>
              <button className="btn-secondary" onClick={loadRuleset} disabled={rulesetLoading}>{rulesetLoading ? '加载中...' : '加载规则集'}</button>
              <button className="btn-primary" onClick={saveRuleset} disabled={rulesetLoading || !rulesetJson.trim()}>{rulesetLoading ? '保存中...' : '保存规则集'}</button>
            </div>
            <div style={{ marginTop: 12 }}>
              <textarea
                value={rulesetJson}
                onChange={(e) => setRulesetJson(e.target.value)}
                placeholder="点击“加载规则集”，或直接粘贴/编辑 Ruleset JSON"
                style={{ width: '100%', minHeight: 260, resize: 'vertical', borderRadius: 12, border: '1px solid var(--control-border)', background: 'var(--control-bg)', color: 'var(--text)', padding: 12, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace', fontSize: 12, lineHeight: 1.5 }}
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
                  <div key={b.blockId} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, border: '1px solid var(--control-border)', borderRadius: 12, padding: 12, background: 'rgba(255,255,255,0.06)' }}>
                    <div>
                      <div style={{ fontWeight: 750, marginBottom: 6 }}>分块内容</div>
                      <div style={{ fontSize: 12, color: 'var(--text)', whiteSpace: 'pre-wrap' }}>{(b.text || '').slice(0, 260)}{(b.text || '').length > 260 ? '…' : ''}</div>
                      <div style={{ marginTop: 6, fontSize: 11, color: 'var(--muted)' }}>{b.stableKey}</div>
                    </div>
                    <div>
                      <div style={{ fontWeight: 750, marginBottom: 6 }}>检查内容</div>
                      <textarea
                        value={blockPrompts[b.stableKey] || ''}
                        onChange={(e) => setBlockPrompts((prev) => ({ ...prev, [b.stableKey]: e.target.value }))}
                        placeholder="例如：\n交货日期请填写，至少精确到月\n- 若为空或仅占位线：不通过\n- 输出：缺失位置与建议填写格式"
                        style={{ width: '100%', minHeight: 110, resize: 'vertical', borderRadius: 10, border: '1px solid var(--control-border)', background: 'var(--control-bg)', color: 'var(--text)', padding: 10, fontSize: 12, lineHeight: 1.5 }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
