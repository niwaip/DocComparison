import React, { useEffect, useMemo, useState } from 'react'
import ContractRulesModal, { DetectedField, FieldRuleState } from './ContractRulesModal'

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

interface TemplateListItem {
  templateId: string
  name: string
  versions: string[]
}

interface TemplateMatchItem {
  templateId: string
  name: string
  version: string
  score: number
}

interface TemplateMatchResponse {
  best?: TemplateMatchItem | null
  candidates: TemplateMatchItem[]
}

interface GlobalPromptConfig {
  defaultPrompt: string
  byTemplateId: Record<string, string>
}

interface GlobalAnalyzeResponse {
  raw: string
}

const hashString = (input: string) => {
  let h = 5381
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h) ^ input.charCodeAt(i)
  }
  const n = h >>> 0
  return n.toString(16).padStart(8, '0')
}

const escapeRegex = (s: string) => (s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const decodeHtmlLite = (s: string) => {
  return (s || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

const normalizeFieldLabel = (raw: string) => {
  let s = (raw || '').trim()
  s = s.replace(/^\s*\d+\s*[.．、]?\s*/g, '')
  s = s.replace(/^\s*[一二三四五六七八九十]+\s*[、.．]\s*/g, '')
  const idx1 = s.indexOf('：')
  const idx2 = s.indexOf(':')
  const idx = idx1 >= 0 ? idx1 : idx2
  if (idx >= 0) s = s.slice(0, idx)
  s = s.trim().replace(/\s+/g, ' ')
  return s
}

const detectFieldsFromBlock = (b: Block): DetectedField[] => {
  const sp = b.structurePath
  if (!sp) return []
  const out: DetectedField[] = []

  const html = b.htmlFragment || ''
  const looksTableByText = () => {
    const t = b.text || ''
    if (!t) return false
    const lines = t
      .split('\n')
      .map((x) => x.trim())
      .filter(Boolean)
    if (lines.length < 2) return false
    const headerLike = lines.find((x) => /产品名称|型号|数量|单价|总价|合计金额/.test(x))
    if (!headerLike) return false
    const cols = headerLike.split(/\t+|\s{2,}/).map((x) => x.trim()).filter(Boolean)
    return cols.length >= 3
  }

  const isTableLike = b.kind === 'table' || /table/i.test(b.kind || '') || /<(table|tr|td)[\s>]/i.test(html) || looksTableByText()
  if (isTableLike) {
    const fieldId = `table::${sp}`
    out.push({ fieldId, structurePath: sp, kind: 'table', label: '表格', labelRegex: '' })
    return out
  }

  const orderedLabels: string[] = []
  const labelSeen = new Set<string>()
  const addLabel = (lab: string) => {
    const s = (lab || '').trim().replace(/\s+/g, ' ')
    if (!s) return
    if (labelSeen.has(s)) return
    labelSeen.add(s)
    orderedLabels.push(s)
  }

  const underlineSentenceShortLabels = new Set<string>()
  const knownLabels = new Set<string>(['运输方式', '交货地点', '交货日期', '最终用户', '签订日期', '签订地点', '合同编号', '买方', '卖方'])
  const isProbablyHeadingLabel = (lab: string) => {
    if (!lab) return true
    if (knownLabels.has(lab)) return false
    if (/附件/.test(lab)) return true
    if (/[、，,]/.test(lab) && /(及|以及|和)/.test(lab)) return true
    if (/(条|章节|部分|目录|说明|定义)/.test(lab) && lab.length >= 4) return true
    return false
  }

  const stripTags = (s: string) => decodeHtmlLite((s || '').replace(/<[^>]+>/g, ''))
  const isUnderlinePlaceholder = (inner: string) => {
    const t = stripTags(inner).replace(/\s+/g, '')
    if (!t) return true
    return /^[_＿—－-]{2,}$/.test(t)
  }
  const addSentenceLabel = (beforeText: string, afterText: string) => {
    const b = (beforeText || '').replace(/\s+/g, ' ').trim()
    const a = (afterText || '').replace(/\s+/g, ' ').trim()
    const aCore = a.replace(/[，,。.;；:：\s]/g, '')
    if (!aCore) {
      const lab = normalizeFieldLabel(b)
      if (lab && !isProbablyHeadingLabel(lab)) addLabel(lab)
      return
    }
    const sentence = `${b}___${a}`.replace(/\s+/g, ' ').trim()
    if (!sentence) return
    const shortLab = normalizeFieldLabel(b)
    if (shortLab && shortLab.length <= 12 && !isProbablyHeadingLabel(shortLab)) underlineSentenceShortLabels.add(shortLab)
    const idx = sentence.indexOf('___')
    if (idx >= 0) {
      const markers: number[] = []
      const re = /(^|[\s：:。；;])(\d{1,2})\s*[.．、]/g
      for (const m of sentence.matchAll(re)) {
        const i = (m.index ?? 0) + (m[1] ? m[1].length : 0)
        markers.push(i)
      }
      if (markers.length > 0) {
        let start = 0
        for (const i of markers) {
          if (i <= idx) start = i
          else break
        }
        let end = sentence.length
        for (const i of markers) {
          if (i > idx) {
            end = i
            break
          }
        }
        const seg = sentence.slice(start, end).trim()
        if (seg && seg.length <= 160) {
          addLabel(seg)
          return
        }
      }
    }
    if (sentence.length > 160) return
    addLabel(sentence)
  }
  const spanUnderlineRe = /<p[^>]*>([\s\S]*?)<span[^>]*text-decoration\s*:\s*underline[^>]*>([\s\S]*?)<\/span>([\s\S]*?)<\/p>/gi
  for (const m of html.matchAll(spanUnderlineRe)) {
    const beforeText = stripTags(m[1] || '')
    const underlineInner = m[2] || ''
    const afterText = stripTags(m[3] || '')
    if (!isUnderlinePlaceholder(underlineInner)) continue
    if (afterText.trim()) {
      addSentenceLabel(beforeText, afterText)
      continue
    }
    const lab = normalizeFieldLabel(beforeText)
    if (lab && !isProbablyHeadingLabel(lab)) addLabel(lab)
  }
  const uUnderlineRe = /<p[^>]*>([\s\S]*?)<u[^>]*>([\s\S]*?)<\/u>([\s\S]*?)<\/p>/gi
  for (const m of html.matchAll(uUnderlineRe)) {
    const beforeText = stripTags(m[1] || '')
    const underlineInner = m[2] || ''
    const afterText = stripTags(m[3] || '')
    if (!isUnderlinePlaceholder(underlineInner)) continue
    if (afterText.trim()) {
      addSentenceLabel(beforeText, afterText)
      continue
    }
    const lab = normalizeFieldLabel(beforeText)
    if (lab && !isProbablyHeadingLabel(lab)) addLabel(lab)
  }

  const lines = (b.text || '').split('\n')
  const isSectionHeadingLine = (line: string) => {
    const s = (line || '').trim()
    if (!s) return false
    if (/^\s*[一二三四五六七八九十]+\s*[、，,．.。]/.test(s)) return true
    if (/^\s*第[一二三四五六七八九十]+\s*[条章节]/.test(s)) return true
    if (/^\s*[（(]?[一二三四五六七八九十]+[)）]/.test(s)) return true
    return false
  }
  const isNumberedTitleWithColonOnly = (line: string) => {
    const s = (line || '').trim()
    if (!s) return false
    return /^\s*(?:[一二三四五六七八九十]+\s*[、.．]|第[一二三四五六七八九十]+\s*[条章节]|[（(]?[一二三四五六七八九十]+[)）]|\d+\s*[.．、])\s*[^:：]{1,30}[:：]\s*$/.test(s)
  }

  for (const line of lines) {
    const raw = (line || '').trim()
    if (!raw) continue
    if (!/[:：]/.test(raw)) continue
    if (isSectionHeadingLine(raw)) continue
    const m = raw.match(/^\s*(?:\d+\s*[.．、]\s*)?(.{1,40}?)([:：])(.*)$/)
    if (!m) continue
    const after = (m[3] || '').trim()
    const lab = normalizeFieldLabel(m[1] || '')
    if (!lab) continue
    if (lab.length > 12) continue
    if (/[、,，]/.test(lab) && /(及|以及|和)/.test(lab)) continue
    if (underlineSentenceShortLabels.has(lab)) continue
    const phAnyRe = /_{3,}|＿{3,}|—{3,}|－{3,}|-{3,}/g
    const phMatches = Array.from(raw.matchAll(phAnyRe))
    if (phMatches.length > 0) {
      const firstIdx = phMatches[0].index ?? -1
      const firstToken = phMatches[0][0] || ''
      if (firstIdx >= 0) {
        const afterPh = raw.slice(firstIdx + firstToken.length)
        const cleanedAfterPh = afterPh.replace(phAnyRe, '').trim().replace(/[，,。.;；:：]+$/g, '').trim()
        const multi = phMatches.length >= 2
        const hasTextAfterPh = cleanedAfterPh.length > 0
        if (multi || hasTextAfterPh) continue
      }
    }
    if (after === '' && isNumberedTitleWithColonOnly(raw) && !knownLabels.has(lab)) continue
    if (after === '' && isProbablyHeadingLabel(lab) && !knownLabels.has(lab)) continue
    addLabel(lab)
  }

  for (const line of lines) {
    const s = line || ''
    const phRe = /_{3,}|＿{3,}|—{3,}|－{3,}|-{3,}/g
    const matches = Array.from(s.matchAll(phRe))
    if (matches.length === 0) continue

    const firstIdx = matches[0].index ?? -1
    const firstToken = matches[0][0] || ''
    if (firstIdx < 0) continue
    const before = s.slice(0, firstIdx)
    const after = s.slice(firstIdx + firstToken.length)
    const beforeHasColon = before.includes('：') || before.includes(':')

    if (beforeHasColon) {
      const cleanedAfter = after.replace(phRe, '').trim().replace(/[，,。.;；:：]+$/g, '').trim()
      const multi = matches.length >= 2
      const hasTextAfter = cleanedAfter.length > 0
      if (multi || hasTextAfter) {
        const sentence = s.trim().replace(/\s+/g, ' ').replace(phRe, '___').trim()
        if (!sentence) continue
        if (sentence.length > 160) continue
        addLabel(sentence)
        continue
      }
      const lab = normalizeFieldLabel(before)
      if (!lab) continue
      if (lab.length > 12) continue
      if (isProbablyHeadingLabel(lab)) continue
      addLabel(lab)
      continue
    }

    const cleanedAfter = after.replace(phRe, '').trim().replace(/[，,。.;；:：]+$/g, '').trim()
    const multi = matches.length >= 2
    const hasTextAfter = cleanedAfter.length > 0
    if (multi || hasTextAfter) {
      const sentence = s.trim().replace(/\s+/g, ' ').replace(phRe, '___').trim()
      if (!sentence) continue
      if (sentence.length > 140) continue
      addLabel(sentence)
      continue
    }

    const lab = normalizeFieldLabel(before)
    if (!lab) continue
    if (lab.length > 12) continue
    if (isProbablyHeadingLabel(lab)) continue
    addLabel(lab)
  }

  const sentenceShortLabels = new Set<string>()
  for (const lab of orderedLabels) {
    const idx = lab.indexOf('___')
    if (idx < 0) continue
    const before = lab.slice(0, idx)
    const short = normalizeFieldLabel(before)
    if (short && short.length <= 12 && !isProbablyHeadingLabel(short)) sentenceShortLabels.add(short)
  }

  const finalLabels = orderedLabels.filter((lab) => {
    if (lab.includes('___')) return true
    if (sentenceShortLabels.has(lab)) return false
    return true
  })

  for (const lab of finalLabels) {
    const fieldId = `field::${sp}::${hashString(lab)}`
    out.push({ fieldId, structurePath: sp, kind: 'field', label: lab, labelRegex: escapeRegex(lab) })
  }
  return out
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
  const [uploadPaneCollapsed, setUploadPaneCollapsed] = useState(false)
  const [checkLoading, setCheckLoading] = useState(false)
  const [checkRun, setCheckRun] = useState<CheckRunResponse | null>(null)
  const [checkFilter, setCheckFilter] = useState<'all' | 'issues'>('all')
  const [checkPaneOpen, setCheckPaneOpen] = useState(false)
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const [rulesetLoading, setRulesetLoading] = useState(false)
  const [templateBlocks, setTemplateBlocks] = useState<Block[]>([])
  const [templateIndex, setTemplateIndex] = useState<TemplateListItem[]>([])
  const [templateIndexLoading, setTemplateIndexLoading] = useState(false)
  const [newTemplateId, setNewTemplateId] = useState('sales_contract_cn')
  const [newTemplateName, setNewTemplateName] = useState('买卖合同（销售）')
  const [newTemplateVersion, setNewTemplateVersion] = useState(new Date().toISOString().slice(0, 10))
  const [templateDraftFile, setTemplateDraftFile] = useState<File | null>(null)
  const [fieldRules, setFieldRules] = useState<Record<string, FieldRuleState>>({})
  const [blockPrompts, setBlockPrompts] = useState<Record<string, string>>({})
  const [globalPromptCfg, setGlobalPromptCfg] = useState<GlobalPromptConfig | null>(null)
  const [globalPromptLoading, setGlobalPromptLoading] = useState(false)
  const [globalPromptDefaultDraft, setGlobalPromptDefaultDraft] = useState('')
  const [globalPromptTemplateDraft, setGlobalPromptTemplateDraft] = useState('')
  const [globalAnalyzeLoading, setGlobalAnalyzeLoading] = useState(false)
  const [globalAnalyzeRaw, setGlobalAnalyzeRaw] = useState<string | null>(null)
  const [globalPaneOpen, setGlobalPaneOpen] = useState(false)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setTemplateIndexLoading(true)
      try {
        const res = await fetch('/api/templates')
        if (!res.ok) return
        const items = await res.json()
        if (cancelled) return
        if (!Array.isArray(items)) return
        const next: TemplateListItem[] = items
          .filter((x: any) => x && typeof x.templateId === 'string')
          .map((x: any) => ({
            templateId: String(x.templateId),
            name: typeof x.name === 'string' ? x.name : String(x.templateId),
            versions: Array.isArray(x.versions) ? x.versions.map((v: any) => String(v)) : []
          }))
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
    const exists = templateIndex.some((t) => t.templateId === templateId)
    const base = templateIndex.map((t) => ({ templateId: t.templateId, name: t.name || t.templateId }))
    if (exists) return base
    return [{ templateId, name: templateNameById.get(templateId) || templateId }, ...base]
  }, [templateIndex, templateId, templateNameById])

  useEffect(() => {
    if (!globalPromptCfg) return
    setGlobalPromptTemplateDraft(globalPromptCfg?.byTemplateId?.[templateId] || '')
  }, [templateId, globalPromptCfg])

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
          tableSalesItems: f.kind === 'table'
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
      else {
        setRightBlocks(blocks)
        try {
          const m = await fetch('/api/templates/match', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ blocks })
          })
          if (m.ok) {
            const obj: TemplateMatchResponse = await m.json()
            const best = obj?.best || null
            if (best && typeof best.templateId === 'string' && typeof best.score === 'number' && best.score >= 0.6) {
              setTemplateId(best.templateId)
            }
          }
        } catch {
          void 0
        }
      }
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
      const cr = await runChecks()
      if (cr) {
        await runGlobalAnalyze(rows, cr)
      } else {
        await runGlobalAnalyze(rows, null)
      }
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

  const runChecks = async (): Promise<CheckRunResponse | null> => {
    if (rightBlocks.length === 0) {
      setError('请先解析右侧合同文件。')
      return null
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
      return payload
    } catch (err: any) {
      console.error(err)
      setError(err.message)
      return null
    } finally {
      setCheckLoading(false)
    }
  }

  const runGlobalAnalyze = async (rows: AlignmentRow[], cr: CheckRunResponse | null) => {
    setGlobalAnalyzeLoading(true)
    setError('')
    try {
      const res = await fetch('/api/analyze/global', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId,
          rightBlocks,
          diffRows: rows,
          checkRun: cr,
          promptOverride: null
        })
      })
      if (!res.ok) throw new Error(`全局分析失败：${res.statusText}`)
      const payload: GlobalAnalyzeResponse = await res.json()
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
      const res = await fetch(`/api/templates/${encodeURIComponent(tid)}/latest`)
      if (!res.ok) throw new Error(`加载模板失败：${res.statusText}`)
      const snapshot = await res.json()
      if (snapshot && Array.isArray(snapshot.blocks)) {
        setTemplateBlocks(snapshot.blocks as Block[])
      } else {
        setTemplateBlocks([])
      }
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
        if (!draftTemplateId) throw new Error('templateId 不能为空')
        const formData = new FormData()
        formData.append('templateId', draftTemplateId)
        formData.append('name', draftName || draftTemplateId)
        formData.append('version', draftVersion || today)
        formData.append('file', templateDraftFile)
        const resTpl = await fetch('/api/templates/generate', { method: 'POST', body: formData })
        if (!resTpl.ok) throw new Error(`保存模板失败：${resTpl.statusText}`)
        const snapshot = await resTpl.json()
        if (snapshot && Array.isArray(snapshot.blocks)) setTemplateBlocks(snapshot.blocks as Block[])
        await reloadTemplateIndex()
        setTemplateDraftFile(null)
        setTemplateId(draftTemplateId)
        targetTemplateId = draftTemplateId
        nameOverride = draftName || draftTemplateId
        versionOverride = draftVersion || today
      }

      let existing: any | null = null
      try {
        const res = await fetch(`/api/check/rulesets/${encodeURIComponent(targetTemplateId)}`)
        if (res.ok) existing = await res.json()
        else if (res.status !== 404) throw new Error(`加载规则集失败：${res.statusText}`)
      } catch (e: any) {
        if (!String(e?.message || '').includes('404')) throw e
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
        const st = fieldRules[fieldId] || { requiredAfterColon: false, dateMonth: false, dateFormat: false, tableSalesItems: false }
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
        const titleFallback = f.kind === 'table' ? '表格检查' : isDate ? `${f.label} 日期校验` : `${f.label} 请填写`
        const title = titleFallback.slice(0, 60)
        const prefix = f.kind === 'table' ? 'table' : 'field'
        const pointId = `${prefix}.${hashString(fieldId)}`
        const anchor =
          f.kind === 'field' ? anchorForField(f.label, f.structurePath) : { type: 'structurePath', value: f.structurePath }
        generated.push({
          pointId,
          title,
          severity: f.kind === 'table' ? 'medium' : 'high',
          anchor,
          rules,
          ai: null
        })
      }

      const spSet = new Set(templateBlocks.map((b) => b.structurePath).filter(Boolean))
      for (const [sp, rawPrompt] of Object.entries(blockPrompts || {})) {
        const prompt = (rawPrompt || '').trim()
        if (!prompt) continue
        if (!spSet.has(sp)) continue
        const title = ((prompt.split('\n')[0] || '').trim() || '分块 AI 检查').slice(0, 60)
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

      const name = (existing?.name || nameOverride || templateNameById.get(targetTemplateId) || targetTemplateId || '未命名规则集').trim()
      const version = (existing?.version || versionOverride || today).trim()
      const payload = {
        templateId: targetTemplateId,
        name,
        version,
        referenceData: existing?.referenceData || {},
        points: [...kept, ...generated]
      }

      const res2 = await fetch(`/api/check/rulesets/${encodeURIComponent(targetTemplateId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      if (!res2.ok) throw new Error(`保存规则集失败：${res2.statusText}`)
      await res2.json()
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
      const res = await fetch('/api/templates')
      if (!res.ok) throw new Error(`加载模板库失败：${res.statusText}`)
      const items = await res.json()
      if (!Array.isArray(items)) return
      const next: TemplateListItem[] = items
        .filter((x: any) => x && typeof x.templateId === 'string')
        .map((x: any) => ({
          templateId: String(x.templateId),
          name: typeof x.name === 'string' ? x.name : String(x.templateId),
          versions: Array.isArray(x.versions) ? x.versions.map((v: any) => String(v)) : []
        }))
      setTemplateIndex(next)
    } catch (err: any) {
      console.error(err)
      setError(err?.message || String(err))
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
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/parse', { method: 'POST', body: formData })
      if (!res.ok) throw new Error(`解析模板失败：${res.statusText}`)
      const blocks = await res.json()
      if (Array.isArray(blocks)) setTemplateBlocks(blocks as Block[])
    } catch (err: any) {
      console.error(err)
      setError(err?.message || String(err))
    } finally {
      setLoading(false)
    }
  }

  const loadGlobalPrompt = async () => {
    setGlobalPromptLoading(true)
    setError('')
    try {
      const res = await fetch('/api/prompts/global')
      if (!res.ok) throw new Error(`加载全局提示词失败：${res.statusText}`)
      const cfg: GlobalPromptConfig = await res.json()
      setGlobalPromptCfg(cfg)
      setGlobalPromptDefaultDraft(cfg?.defaultPrompt || '')
      setGlobalPromptTemplateDraft(cfg?.byTemplateId?.[templateId] || '')
    } catch (err: any) {
      console.error(err)
      setError(err?.message || String(err))
    } finally {
      setGlobalPromptLoading(false)
    }
  }

  const saveGlobalPrompt = async () => {
    setGlobalPromptLoading(true)
    setError('')
    try {
      const next: GlobalPromptConfig = {
        defaultPrompt: globalPromptDefaultDraft,
        byTemplateId: { ...(globalPromptCfg?.byTemplateId || {}) }
      }
      const trimmed = globalPromptTemplateDraft.trim()
      if (trimmed) next.byTemplateId[templateId] = trimmed
      else delete next.byTemplateId[templateId]
      const res = await fetch('/api/prompts/global', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next)
      })
      if (!res.ok) throw new Error(`保存全局提示词失败：${res.statusText}`)
      const saved: GlobalPromptConfig = await res.json()
      setGlobalPromptCfg(saved)
      setGlobalPromptDefaultDraft(saved?.defaultPrompt || '')
      setGlobalPromptTemplateDraft(saved?.byTemplateId?.[templateId] || '')
    } catch (err: any) {
      console.error(err)
      setError(err?.message || String(err))
    } finally {
      setGlobalPromptLoading(false)
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
          overflow-x: hidden;
          overflow-y: visible;
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
          overflow-wrap: anywhere;
          overflow-x: hidden;
        }
        .block-content p[style*="text-indent"], .block-content p[style*="padding-left"]{
          text-indent: 0 !important;
          padding-left: 0 !important;
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
                    {contractTypeOptions.map(o => (
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
        <button
          className="icon-btn"
          title={globalPaneOpen ? '收起全局建议' : '展开全局建议'}
          onClick={async () => {
            const next = !globalPaneOpen
            setGlobalPaneOpen(next)
            if (next && diffRows.length > 0 && !globalAnalyzeRaw && !globalAnalyzeLoading) {
              await runGlobalAnalyze(diffRows, checkRun)
            }
          }}
          disabled={diffRows.length === 0}
        >
          {globalPaneOpen ? '🧠▾' : '🧠▸'}
        </button>
      </div>

      {checkRun && checkPaneOpen && diffRows.length === 0 && (
        <div style={{ marginTop: 14 }}>
          {renderCheckPanel()}
        </div>
      )}

      {globalPaneOpen && (
        <div style={{ marginTop: 14, background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', padding: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ fontWeight: 800 }}>全局风险与改进建议</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button
                className="btn-secondary"
                disabled={globalAnalyzeLoading || diffRows.length === 0}
                onClick={async () => { await runGlobalAnalyze(diffRows, checkRun) }}
              >
                {globalAnalyzeLoading ? '分析中...' : '重新分析'}
              </button>
            </div>
          </div>
          <div style={{ marginTop: 10 }}>
            {globalAnalyzeRaw ? (
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 12, lineHeight: 1.6, padding: 12, borderRadius: 12, border: '1px solid var(--control-border)', background: 'var(--control-bg)' }}>{globalAnalyzeRaw}</pre>
            ) : (
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                {diffRows.length === 0 ? '请先完成对比。' : globalAnalyzeLoading ? '分析中...' : '暂无结果。'}
              </div>
            )}
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
          const res = await fetch(`/api/templates/${encodeURIComponent(id)}/name`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
          })
          if (!res.ok) throw new Error(`重命名失败：${res.statusText}`)
          await reloadTemplateIndex()
        }}
        deleteTemplate={async (id) => {
          const res = await fetch(`/api/templates/${encodeURIComponent(id)}`, { method: 'DELETE' })
          if (!res.ok) throw new Error(`删除失败：${res.statusText}`)
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
  )
}

export default App
