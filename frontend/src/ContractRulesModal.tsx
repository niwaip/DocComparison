import React from 'react'

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

interface TemplateListItem {
  templateId: string
  name: string
  versions: string[]
}

export interface DetectedField {
  fieldId: string
  structurePath: string
  kind: 'field' | 'table'
  label: string
  labelRegex: string
}

export interface FieldRuleState {
  requiredAfterColon: boolean
  dateMonth: boolean
  dateFormat: boolean
  tableSalesItems: boolean
  aiPrompt: string
}

type Props = {
  open: boolean
  onClose: () => void

  templateId: string
  setTemplateId: (v: string) => void
  saveRuleset: () => void
  rulesetLoading: boolean

  templateIndex: TemplateListItem[]
  templateIndexLoading: boolean
  reloadTemplateIndex: () => void
  loadTemplateSnapshot: (templateId: string) => Promise<void>
  renameTemplate: (templateId: string, name: string) => Promise<void>
  deleteTemplate: (templateId: string) => Promise<void>

  newTemplateId: string
  setNewTemplateId: (v: string) => void
  newTemplateName: string
  setNewTemplateName: (v: string) => void
  newTemplateVersion: string
  setNewTemplateVersion: (v: string) => void
  generateTemplateSnapshot: (file: File) => void

  templateBlocks: Block[]
  detectedFields: DetectedField[]
  fieldRules: Record<string, FieldRuleState>
  updateFieldRule: (fieldId: string, patch: Partial<FieldRuleState>) => void
  blockPrompts: Record<string, string>
  setBlockPrompts: React.Dispatch<React.SetStateAction<Record<string, string>>>

  globalPromptLoading: boolean
  globalPromptDefaultDraft: string
  setGlobalPromptDefaultDraft: (v: string) => void
  globalPromptTemplateDraft: string
  setGlobalPromptTemplateDraft: (v: string) => void
  loadGlobalPrompt: () => void
  saveGlobalPrompt: () => void
}

const titleFromPrompt = (prompt: string) => {
  const t = (prompt || '').trim().split('\n')[0] || ''
  return t.trim()
}

export default function ContractRulesModal(props: Props) {
  const {
    open,
    onClose,
    templateId,
    setTemplateId,
    saveRuleset,
    rulesetLoading,
    templateIndex,
    templateIndexLoading,
    reloadTemplateIndex,
    loadTemplateSnapshot,
    renameTemplate,
    deleteTemplate,
    newTemplateId,
    setNewTemplateId,
    newTemplateName,
    setNewTemplateName,
    newTemplateVersion,
    setNewTemplateVersion,
    generateTemplateSnapshot,
    templateBlocks,
    detectedFields,
    fieldRules,
    updateFieldRule,
    blockPrompts,
    setBlockPrompts,
    globalPromptLoading,
    globalPromptDefaultDraft,
    setGlobalPromptDefaultDraft,
    globalPromptTemplateDraft,
    setGlobalPromptTemplateDraft,
    loadGlobalPrompt,
    saveGlobalPrompt
  } = props

  const renderTableFromText = (text: string) => {
    const lines = (text || '')
      .split('\n')
      .map((x) => x.trim())
      .filter(Boolean)
    const splitCols = (line: string) => {
      if (line.includes('|')) return line.split('|').map((c) => c.trim()).filter((x) => x !== '')
      if (/\t/.test(line)) return line.split(/\t+/).map((c) => c.trim()).filter((x) => x !== '')
      return line.split(/\s{2,}/).map((c) => c.trim()).filter((x) => x !== '')
    }
    const rows = lines.map((line) => splitCols(line))
    const colCount = Math.max(0, ...rows.map((r) => r.length))
    const normalized = rows.map((r) => (r.length < colCount ? [...r, ...new Array(colCount - r.length).fill('')] : r))
    if (normalized.length === 0 || colCount <= 1) return null
    return (
      <table>
        <tbody>
          {normalized.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    )
  }
  const getBlockTitle = (b: Block | null) => {
    const t = (b?.text || '').trim()
    if (!t) return '分块'
    const line = (t.split('\n').map((x) => x.trim()).filter(Boolean)[0] || '').trim()
    const s = line.replace(/\s+/g, ' ')
    return s.length > 36 ? `${s.slice(0, 36)}…` : s
  }
  const findLabelExcerpt = (b: Block | null, label: string) => {
    const t = (b?.text || '').trim()
    if (!t || !label) return ''
    const lines = t.split('\n').map((x) => x.trim()).filter(Boolean)
    const placeholderRe = /_{2,}|＿{2,}|—{2,}|－{2,}|-{2,}/
    const headingishRe = /^\s*(?:[一二三四五六七八九十]+\s*[、.．]|第[一二三四五六七八九十]+\s*[条章节]|[（(]?[一二三四五六七八九十]+[)）]|\d+\s*[.．、])\s*[^:：]{1,40}[:：]?\s*$/
    let best: { line: string; score: number } | null = null
    for (const line of lines) {
      if (!line.includes(label)) continue
      let score = 0
      if (placeholderRe.test(line)) score += 10
      if (headingishRe.test(line)) score -= 8
      if (line.length >= 12 && /[。；;]/.test(line)) score += 2
      if (!best || score > best.score) best = { line, score }
    }
    if (best) {
      const s = best.line.replace(/\s+/g, ' ').trim()
      return s.length > 70 ? `${s.slice(0, 70)}…` : s
    }
    if (!label.includes('___')) {
      const idx = t.indexOf(label)
      if (idx < 0) return ''
      const start = Math.max(0, idx - 18)
      const end = Math.min(t.length, idx + label.length + 24)
      const s = t.slice(start, end).replace(/\s+/g, ' ').trim()
      return s.length > 70 ? `${s.slice(0, 70)}…` : s
    }
    let bestPh: { line: string; score: number } | null = null
    for (const line of lines) {
      if (!placeholderRe.test(line)) continue
      let score = 0
      score += 10
      if (headingishRe.test(line)) score -= 8
      if (line.length >= 12 && /[。；;]/.test(line)) score += 2
      if (!bestPh || score > bestPh.score) bestPh = { line, score }
    }
    if (bestPh) {
      const s = bestPh.line.replace(/\s+/g, ' ').trim()
      return s.length > 70 ? `${s.slice(0, 70)}…` : s
    }
    const idx = t.indexOf(label)
    if (idx < 0) return ''
    const start = Math.max(0, idx - 18)
    const end = Math.min(t.length, idx + label.length + 24)
    const s = t.slice(start, end).replace(/\s+/g, ' ').trim()
    return s.length > 70 ? `${s.slice(0, 70)}…` : s
  }
  const hasBlocks = templateBlocks.length > 0
  const hasDetected = detectedFields.length > 0
  const [blockOpen, setBlockOpen] = React.useState<Record<string, boolean>>({})
  const [snapshotFileName, setSnapshotFileName] = React.useState('')
  const blockGroups = React.useMemo(() => {
    const order = new Map<string, number>()
    templateBlocks.forEach((b, idx) => order.set(b.structurePath, idx))
    const map = new Map<string, DetectedField[]>()
    for (const f of detectedFields) {
      const sp = f.structurePath
      if (!sp) continue
      const arr = map.get(sp) || []
      arr.push(f)
      map.set(sp, arr)
    }
    const groups = Array.from(map.entries()).map(([structurePath, fields]) => {
      const block = templateBlocks.find((b) => b.structurePath === structurePath) || null
      return { structurePath, block, fields }
    })
    groups.sort((a, c) => {
      const ai = order.has(a.structurePath) ? (order.get(a.structurePath) as number) : Number.MAX_SAFE_INTEGER
      const ci = order.has(c.structurePath) ? (order.get(c.structurePath) as number) : Number.MAX_SAFE_INTEGER
      if (ai !== ci) return ai - ci
      return a.structurePath.localeCompare(c.structurePath, 'zh-Hans-CN')
    })
    return groups
  }, [detectedFields, templateBlocks])
  const allExpanded = blockGroups.length > 0 && blockGroups.every((g) => blockOpen[g.structurePath] === true)

  if (!open) return null

  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="modal" role="dialog" aria-modal="true">
        <div className="modal-topbar">
          <div className="modal-title">合同规则配置</div>
          <button className="icon-btn" title="关闭" onClick={onClose}>
            ✕
          </button>
        </div>

        <div style={{ padding: 14, display: 'grid', gap: 14 }}>
          <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', padding: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ fontWeight: 800 }}>模板库</div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button className="btn-secondary" onClick={reloadTemplateIndex} disabled={templateIndexLoading}>
                  {templateIndexLoading ? '加载中...' : '刷新模板库'}
                </button>
              </div>
            </div>

            <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ border: '1px solid var(--control-border)', borderRadius: 12, padding: 12, background: 'rgba(255,255,255,0.06)' }}>
                <div style={{ fontWeight: 750, marginBottom: 8 }}>已有模板</div>
                {templateIndex.length > 0 ? (
                  <div style={{ display: 'grid', gap: 8, maxHeight: 220, overflow: 'auto', paddingRight: 2 }}>
                    {templateIndex.map((t) => (
                      <div key={t.templateId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, border: '1px solid var(--control-border)', borderRadius: 10, padding: '8px 10px', background: 'var(--control-bg)' }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 750, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {t.templateId} · {t.versions.length} 个版本
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                          <button
                            className="btn-secondary"
                            onClick={async () => {
                              setTemplateId(t.templateId)
                              setNewTemplateId(t.templateId)
                              setNewTemplateName(t.name || t.templateId)
                              const latestVersion = (Array.isArray(t.versions) ? [...t.versions].sort() : []).slice(-1)[0]
                              if (latestVersion) setNewTemplateVersion(latestVersion)
                              try {
                                await loadTemplateSnapshot(t.templateId)
                              } catch (e: any) {
                                window.alert(e?.message || String(e))
                              }
                            }}
                            style={{ height: 34, padding: '0 10px' }}
                          >
                            编辑
                          </button>
                          <button
                            className="btn-secondary"
                            onClick={async () => {
                              const nextName = (window.prompt('请输入新的模板名称：', t.name || '') || '').trim()
                              if (!nextName) return
                              try {
                                await renameTemplate(t.templateId, nextName)
                              } catch (e: any) {
                                window.alert(e?.message || String(e))
                              }
                            }}
                            style={{ height: 34, padding: '0 10px' }}
                          >
                            重命名
                          </button>
                          <button
                            className="btn-secondary"
                            onClick={async () => {
                              if (!window.confirm(`确认删除模板「${t.name || t.templateId}」？这会同时删除对应规则集。`)) return
                              try {
                                await deleteTemplate(t.templateId)
                              } catch (e: any) {
                                window.alert(e?.message || String(e))
                              }
                            }}
                            style={{ height: 34, padding: '0 10px', borderColor: 'rgba(239,68,68,0.55)', color: 'rgba(239,68,68,0.95)' }}
                          >
                            删除
                          </button>
                          <button
                            className="btn-secondary"
                            onClick={async () => {
                              setTemplateId(t.templateId)
                              try {
                                await loadTemplateSnapshot(t.templateId)
                              } catch (e: any) {
                                window.alert(e?.message || String(e))
                              }
                            }}
                            style={{ height: 34, padding: '0 10px' }}
                          >
                            使用
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>{templateIndexLoading ? '加载中...' : '暂无模板。可在右侧生成模板快照。'}</div>
                )}
              </div>

              <div style={{ border: '1px solid var(--control-border)', borderRadius: 12, padding: 12, background: 'rgba(255,255,255,0.06)' }}>
                <div style={{ fontWeight: 750, marginBottom: 8 }}>生成模板快照</div>
                <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 8, alignItems: 'center' }}>
                  <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 700 }}>templateId</div>
                  <input value={newTemplateId} onChange={(e) => setNewTemplateId(e.target.value)} style={{ height: 36, borderRadius: 10, border: '1px solid var(--control-border)', background: 'var(--control-bg)', color: 'var(--text)', padding: '0 10px' }} />
                  <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 700 }}>名称</div>
                  <input value={newTemplateName} onChange={(e) => setNewTemplateName(e.target.value)} style={{ height: 36, borderRadius: 10, border: '1px solid var(--control-border)', background: 'var(--control-bg)', color: 'var(--text)', padding: '0 10px' }} />
                  <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 700 }}>版本</div>
                  <input value={newTemplateVersion} onChange={(e) => setNewTemplateVersion(e.target.value)} style={{ height: 36, borderRadius: 10, border: '1px solid var(--control-border)', background: 'var(--control-bg)', color: 'var(--text)', padding: '0 10px' }} />
                </div>
                <div style={{ marginTop: 10 }}>
                  <input
                    id="template-snapshot-upload"
                    type="file"
                    accept=".docx"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (!f) return
                      setSnapshotFileName(f.name)
                      generateTemplateSnapshot(f)
                      window.setTimeout(() => {
                        const el = document.getElementById('block-config-panel')
                        el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                      }, 0)
                    }}
                  />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <label htmlFor="template-snapshot-upload" className="btn-secondary" style={{ height: 34, padding: '0 10px', display: 'inline-flex', alignItems: 'center' }}>
                      选择模板文件
                    </label>
                    <div style={{ fontSize: 12, color: 'var(--text)', border: '1px solid var(--control-border)', borderRadius: 999, padding: '6px 10px', background: 'var(--control-bg)', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {snapshotFileName || '未选择文件'}
                    </div>
                  </div>
                  {snapshotFileName && (
                    <div style={{ marginTop: 8, fontSize: 12, color: 'var(--muted)' }}>
                      已载入模板草稿（未保存）。完成规则配置后点击“保存（创建/更新）”才会写入模板库。
                    </div>
                  )}
                </div>
                <div style={{ marginTop: 10, fontSize: 12, color: 'var(--muted)' }}>上传模板文件后会自动载入分块，无需在分块区重复上传。</div>
              </div>
            </div>
          </div>

          <div id="block-config-panel" style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', padding: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ fontWeight: 800 }}>按分块配置检查（固定规则 + AI 可选检查）</div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button
                  className="btn-secondary"
                  disabled={!hasDetected}
                  onClick={() => {
                    setBlockOpen(() => {
                      const next: Record<string, boolean> = {}
                      for (const g of blockGroups) next[g.structurePath] = !allExpanded
                      return next
                    })
                  }}
                >
                  {allExpanded ? '全部收起' : '全部展开'}
                </button>
                <button className="btn-primary" onClick={saveRuleset} disabled={rulesetLoading || !hasBlocks}>
                  {rulesetLoading ? '保存中...' : '保存（创建/更新）'}
                </button>
              </div>
            </div>

            <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                当前载入：{hasBlocks ? `${templateBlocks.length} 个分块` : '未载入模板分块'}
                <br />
                仅展示“包含输入区域”的条款（下划线/冒号空白/表格）。
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>AI 提示词建议：第一行写标题，后续写判断标准/输出格式。AI 关闭时仅执行固定规则。</div>
            </div>

            {hasDetected ? (
              <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
                {blockGroups.map((g) => {
                  const checkboxStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text)' }
                  const sp = g.structurePath
                  const excerpt = g.block ? (g.block.text || '') : ''
                  const blockTitle = getBlockTitle(g.block)
                  return (
                    <details
                      key={sp}
                      open={blockOpen[sp] === true}
                      onToggle={(e) => {
                        const el = e.currentTarget as HTMLDetailsElement
                        setBlockOpen((prev) => ({ ...prev, [sp]: el.open }))
                      }}
                      style={{ border: '1px solid var(--control-border)', borderRadius: 12, background: 'rgba(255,255,255,0.06)' }}
                    >
                      <summary
                        style={{
                          cursor: 'pointer',
                          padding: '10px 12px',
                          fontWeight: 850,
                          color: 'var(--text)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 10
                        }}
                      >
                        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{blockTitle}</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>{g.fields.length} 项</span>
                      </summary>
                      <div style={{ padding: 12, display: 'grid', gridTemplateColumns: '1fr 1.45fr 0.85fr', gap: 12 }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 750, marginBottom: 6 }}>分块内容</div>
                          {g.block ? (
                            <div
                              style={{
                                fontSize: 12,
                                color: 'var(--text)',
                                border: '1px solid var(--control-border)',
                                borderRadius: 10,
                                padding: 10,
                                background: 'var(--control-bg)',
                                maxWidth: '100%',
                                overflowX: 'hidden',
                                overflowWrap: 'anywhere',
                                wordBreak: 'break-word'
                              }}
                            >
                              {g.block.htmlFragment ? (
                                <div dangerouslySetInnerHTML={{ __html: g.block.htmlFragment }} />
                              ) : /table/i.test(g.block.kind || '') || g.block.kind === 'table' ? (
                                renderTableFromText(g.block.text || '') || <div style={{ whiteSpace: 'pre-wrap' }}>{excerpt}</div>
                              ) : (
                                <div style={{ whiteSpace: 'pre-wrap' }}>{excerpt}</div>
                              )}
                            </div>
                          ) : (
                            <div style={{ fontSize: 12, color: 'var(--muted)' }}>（未找到分块内容）</div>
                          )}
                        </div>

                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 750, marginBottom: 6 }}>固定规则</div>
                          <div style={{ display: 'grid', gap: 10 }}>
                            {g.fields.map((f) => {
                              const st = fieldRules[f.fieldId] || { requiredAfterColon: f.kind === 'field', dateMonth: f.kind === 'field' && f.label.includes('日期'), dateFormat: f.kind === 'field' && f.label.includes('日期'), tableSalesItems: f.kind === 'table', aiPrompt: '' }
                              const title = f.kind === 'table' ? '表格' : f.label
                              const excerptLine = f.kind === 'field' ? findLabelExcerpt(g.block, f.label) : ''
                              return (
                                <div key={f.fieldId} style={{ border: '1px solid var(--control-border)', borderRadius: 12, padding: 10, background: 'var(--control-bg)' }}>
                                  <div style={{ fontWeight: 800, fontSize: 13, textDecorationLine: 'underline', textDecorationThickness: '2px', textUnderlineOffset: '4px' }}>{title}</div>
                                  <div style={{ marginTop: 4, fontSize: 11, color: 'var(--muted)' }}>
                                    来自：{blockTitle}
                                    {excerptLine ? ` · 片段：${excerptLine}` : ''}
                                  </div>
                                  <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
                                    {f.kind === 'field' ? (
                                      <>
                                        <label style={checkboxStyle}>
                                          <input type="checkbox" checked={st.requiredAfterColon} onChange={(e) => updateFieldRule(f.fieldId, { requiredAfterColon: e.target.checked })} />
                                          <span>必填（冒号/下划线后）</span>
                                        </label>
                                        {f.label.includes('日期') && (
                                          <>
                                            <label style={checkboxStyle}>
                                              <input type="checkbox" checked={st.dateFormat} onChange={(e) => updateFieldRule(f.fieldId, { dateFormat: e.target.checked })} />
                                              <span>日期格式</span>
                                            </label>
                                            <label style={checkboxStyle}>
                                              <input type="checkbox" checked={st.dateMonth} onChange={(e) => updateFieldRule(f.fieldId, { dateMonth: e.target.checked })} />
                                              <span>日期至少精确到月</span>
                                            </label>
                                          </>
                                        )}
                                      </>
                                    ) : (
                                      <>
                                        <label style={checkboxStyle}>
                                          <input type="checkbox" checked={st.tableSalesItems} onChange={(e) => updateFieldRule(f.fieldId, { tableSalesItems: e.target.checked })} />
                                          <span>销售明细表校验</span>
                                        </label>
                                        <div style={{ marginTop: 8 }}>
                                          <div style={{ fontSize: 12, fontWeight: 750, color: 'var(--text)' }}>表格 AI 提示词（可选）</div>
                                          <textarea
                                            value={st.aiPrompt || ''}
                                            onChange={(e) => updateFieldRule(f.fieldId, { aiPrompt: e.target.value })}
                                            placeholder={'例如：\n校验该表格中 产品名称/数量/单价/总价/合计金额 是否填写完整、计算是否一致，输出问题清单（简短、可执行）。'}
                                            style={{
                                              width: '100%',
                                              maxWidth: '100%',
                                              boxSizing: 'border-box',
                                              marginTop: 8,
                                              minHeight: 120,
                                              resize: 'vertical',
                                              borderRadius: 10,
                                              border: '1px solid var(--control-border)',
                                              background: 'var(--panel)',
                                              color: 'var(--text)',
                                              padding: 10,
                                              fontSize: 12,
                                              lineHeight: 1.5
                                            }}
                                          />
                                        </div>
                                      </>
                                    )}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>

                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 750, marginBottom: 6 }}>AI 提示词（可选）</div>
                          {(() => {
                            const v = blockPrompts[sp] || ''
                            return (
                              <div style={{ border: '1px solid var(--control-border)', borderRadius: 12, padding: 10, background: 'var(--control-bg)' }}>
                                <div style={{ fontWeight: 750, fontSize: 13 }}>该分块统一提示词</div>
                                <textarea
                                  value={v}
                                  onChange={(e) => setBlockPrompts((prev) => ({ ...prev, [sp]: e.target.value }))}
                                  placeholder={'例如：\n检查本条款中 运输方式/交货地点/交货日期/最终用户 的填写是否一致、是否存在矛盾，并输出问题清单（严格 JSON）。'}
                                  style={{
                                    width: '100%',
                                    maxWidth: '100%',
                                    boxSizing: 'border-box',
                                    marginTop: 8,
                                    minHeight: 160,
                                    resize: 'vertical',
                                    borderRadius: 10,
                                    border: '1px solid var(--control-border)',
                                    background: 'var(--panel)',
                                    color: 'var(--text)',
                                    padding: 10,
                                    fontSize: 12,
                                    lineHeight: 1.5
                                  }}
                                />
                                {v.trim() && <div style={{ marginTop: 8, fontSize: 12, color: 'var(--muted)' }}>标题：{titleFromPrompt(v) || '—'}</div>}
                              </div>
                            )
                          })()}
                        </div>
                      </div>
                    </details>
                  )
                })}
              </div>
            ) : (
              <div style={{ marginTop: 12, fontSize: 12, color: 'var(--muted)' }}>未检测到可配置的输入区域。请先在“生成模板快照”上传标准合同。</div>
            )}
          </div>

          <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', padding: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ fontWeight: 800 }}>全局提示词（用于“全局风险与改进建议”）</div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button className="btn-secondary" onClick={loadGlobalPrompt} disabled={globalPromptLoading}>
                  {globalPromptLoading ? '加载中...' : '加载'}
                </button>
                <button className="btn-primary" onClick={saveGlobalPrompt} disabled={globalPromptLoading}>
                  {globalPromptLoading ? '保存中...' : '保存'}
                </button>
              </div>
            </div>
            <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 750, marginBottom: 8 }}>默认提示词</div>
                <textarea value={globalPromptDefaultDraft} onChange={(e) => setGlobalPromptDefaultDraft(e.target.value)} placeholder="例如：请基于 blocks/diffRows/checkRun，总结整体风险等级、关键问题、改进建议与缺失信息。输出严格 JSON。" style={{ width: '100%', maxWidth: '100%', boxSizing: 'border-box', minHeight: 160, resize: 'vertical', borderRadius: 12, border: '1px solid var(--control-border)', background: 'var(--control-bg)', color: 'var(--text)', padding: 12, fontSize: 12, lineHeight: 1.6 }} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 750, marginBottom: 8, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>当前合同类型覆盖（{templateId}）</div>
                <textarea value={globalPromptTemplateDraft} onChange={(e) => setGlobalPromptTemplateDraft(e.target.value)} placeholder="留空表示使用默认提示词。" style={{ width: '100%', maxWidth: '100%', boxSizing: 'border-box', minHeight: 160, resize: 'vertical', borderRadius: 12, border: '1px solid var(--control-border)', background: 'var(--control-bg)', color: 'var(--text)', padding: 12, fontSize: 12, lineHeight: 1.6 }} />
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
