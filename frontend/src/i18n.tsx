import React from 'react'

export type Lang = 'zh-CN' | 'en-US'

type Dict = Record<string, string>

const zhCN: Dict = {
  'app.title': '文档对比',
  'toolbar.lang.switchTitle': '切换语言',
  'toolbar.theme.toLight': '切换到亮色系',
  'toolbar.theme.toDark': '切换到暗色系',
  'toolbar.theme.light': '☀️ 亮色',
  'toolbar.theme.dark': '🌙 暗色',
  'toolbar.configRules': '⚙ 配置规则',
  'toolbar.configRules.disabled': '未匹配模板时无法配置规则',

  'upload.collapsed.original': '原始：',
  'upload.collapsed.revised': '修订：',
  'upload.collapsed.none': '未选择',
  'upload.collapsed.expand': '展开上传区',

  'upload.leftTitle': '原始文档',
  'upload.rightTitle': '修订文档',
  'upload.clickUpload': '点击上传 .docx',
  'upload.parsedBlocks': '✓ 已解析 {count} 个分块',

  'side.contractType': '合同类型',
  'side.contractType.unmatched': '（未匹配模板：使用通用提示词）',
  'side.aiCheck': 'AI检查',
  'side.aiAnalyze': 'AI分析',
  'side.compare.loading': '⏳ 对比中',
  'side.compare.start': '⇄ 开始对比',
  'side.reset.title': '清空已上传文件与对比结果',
  'side.reset': '↺ 重置',

  'mid.showOnlyDiff.title': '仅展示差异行',
  'mid.showOnlyDiff': '显示差异',
  'mid.diff.prev': '上一处差异',
  'mid.diff.next': '下一处差异',
  'mid.checkPane.collapse': '收起检查栏',
  'mid.checkPane.expand': '展开检查栏',
  'mid.checkFilter.title': '开启：只看问题；关闭：全部',
  'mid.checkFilter.issuesOnly': '只看问题',
  'mid.checkFilter.all': '全部',
  'mid.globalPane.collapse': '收起全局建议',
  'mid.globalPane.expand': '展开全局建议',
  'mid.globalAnalyze.loading': '分析中',
  'mid.check.loading': 'AI执行中',

  'check.title': '检查结果',
  'check.summary': '通过 {pass} · 不通过 {fail} · 警告 {warn} · 需人工 {manual}',
  'check.empty.issues': '未发现问题。',
  'check.empty.all': '无检查项。',
  'check.notRun': '未运行检查',
  'check.loading': '检查中...',
  'check.cell.none': '无检查项',

  'global.title': '全局风险与改进建议',
  'global.reanalyze': '重新分析',
  'global.reanalyze.loading': '分析中...',

  'ai.globalAnalyze.templateNote': '背景：左侧可能是“范本/空白模板”，左侧出现的下划线或空白属于占位符。对比与分析时不要把左侧空白当成问题或矛盾。请优先判断右侧是否仍为空白模板；若右侧已填写，重点检查右侧必填项完整性、一致性以及数值/日期/金额计算逻辑，并给出可执行的修改建议。',

  'globalAnalyze.empty.needDiff': '请先完成对比。',
  'globalAnalyze.empty.disabled': 'AI分析已关闭。',
  'globalAnalyze.empty.loading': '分析中...',
  'globalAnalyze.empty.none': '暂无结果。',
  'globalAnalyze.conclusion': '总体结论',
  'globalAnalyze.confidence': '置信度：{value}',
  'globalAnalyze.raw.hide': '隐藏原始JSON',
  'globalAnalyze.raw.show': '查看原始JSON',
  'globalAnalyze.keyFindings': '关键问题',
  'globalAnalyze.table.issue': '问题',
  'globalAnalyze.table.detail': '说明',
  'globalAnalyze.table.evidence': '证据',
  'globalAnalyze.suggestions': '修改建议',
  'globalAnalyze.table.priority': '优先级',
  'globalAnalyze.table.suggestion': '建议',
  'globalAnalyze.table.content': '内容',
  'globalAnalyze.missing': '缺失信息（需补全）',
  'globalAnalyze.sections': '按章节/主题查看',
  'globalAnalyze.blocks': '逐块检查（抽样/重点块）',
  'globalAnalyze.evidenceCount': '证据：{count}',
  'globalAnalyze.shownFirst': '已展示前 {count} 条逐块结果。',

  'diff.left': '原文内容',
  'diff.right': '修订内容',

  'ref.thisBlock': '该分块',
  'ref.thisTable': '该表格',
  'ref.thisField': '该字段',

  'evidence.none': '—',
  'evidence.left': '左：{text}',
  'evidence.right': '右：{text}',
  'evidence.excerpt': '摘录：{text}',
  'evidence.rowAt': '所在行：{label}（{id}）',

  'label.row': '第{n}行',
  'label.block': '分块{n}',
  'label.table': '表格',
  'label.field': '字段',
  'label.blockShort': '分块',
  'label.tableShort': '表格',
  'label.fieldShort': '字段',

  'risk.high': '高风险',
  'risk.medium': '中风险',
  'risk.low': '低风险',
  'priority.critical': '紧急',
  'priority.high': '高',
  'priority.medium': '中',
  'priority.low': '低',

  'rules.modal.title': '合同规则配置',
  'common.close': '关闭',

  'rules.templateLibrary.title': '模板库',
  'common.loading': '加载中...',
  'rules.templateLibrary.refresh': '刷新模板库',
  'rules.templateLibrary.existing': '已有模板',
  'rules.templateLibrary.versions': '{count} 个版本',
  'common.edit': '编辑',
  'rules.templateLibrary.export': '导出',
  'rules.templateLibrary.rename': '重命名',
  'rules.templateLibrary.renamePrompt': '请输入新的模板名称：',
  'common.delete': '删除',
  'rules.templateLibrary.deleteConfirm': '确认删除模板「{name}」？这会同时删除对应规则集。',
  'common.use': '使用',
  'rules.templateLibrary.empty': '暂无模板。可在右侧生成模板快照。',
  'rules.templateLibrary.generate': '生成模板快照',
  'rules.templateLibrary.name': '名称',
  'rules.templateLibrary.version': '版本',
  'rules.templateLibrary.chooseFile': '选择模板文件',
  'rules.templateLibrary.noFile': '未选择文件',
  'rules.templateLibrary.draftHint': '已载入模板草稿（未保存）。完成规则配置后点击“保存（创建/更新）”才会写入模板库。',
  'rules.templateLibrary.uploadHint': '上传模板文件后会自动载入分块，无需在分块区重复上传。',
  'rules.templateLibrary.import': '导入',
  'rules.templateLibrary.importOverwrite': '检测到同版本技能包，是否覆盖（确定=覆盖，取消=拒绝导入）？',

  'rules.blockRules.title': '按分块配置检查（固定规则 + AI 可选检查）',
  'rules.blockRules.expandAll': '全部展开',
  'rules.blockRules.collapseAll': '全部收起',
  'rules.blockRules.save': '保存（创建/更新）',
  'rules.blockRules.saving': '保存中...',
  'rules.blockRules.loaded': '当前载入：{text}',
  'rules.blockRules.loaded.blocks': '{count} 个分块',
  'rules.blockRules.loaded.empty': '未载入模板分块',
  'rules.blockRules.groupByTop': '按第一级分块',
  'rules.blockRules.groupByInputs': '按输入字段分块',
  'rules.blockRules.onlyInputBlocks': '仅展示“包含输入区域”的条款（下划线/冒号空白/表格）。',
  'rules.blockRules.aiHint': 'AI 提示词建议：第一行写标题，后续写判断标准/输出格式。AI 关闭时仅执行固定规则。',
  'rules.blockRules.itemsCount': '{count} 项',
  'rules.blockRules.blockContent': '分块内容',
  'rules.blockRules.blockContentMissing': '（未找到分块内容）',
  'rules.blockRules.blockFallbackTitle': '分块',
  'rules.blockRules.fixedRules': '固定规则',
  'rules.blockRules.table': '表格',
  'rules.blockRules.from': '来自：{title}{excerpt}',
  'rules.blockRules.excerpt': ' · 片段：{excerpt}',
  'rules.blockRules.requiredAfterColon': '必填（冒号/下划线后）',
  'rules.blockRules.dateFormat': '日期格式',
  'rules.blockRules.dateMonth': '日期至少精确到月',
  'rules.blockRules.salesTable': '销售明细表校验',
  'rules.blockRules.tableAiPrompt': '表格 AI 提示词（可选）',
  'rules.blockRules.tableAiPlaceholder': '例如：\n校验该表格中 产品名称/数量/单价/总价/合计金额 是否填写完整、计算是否一致，输出问题清单（简短、可执行）。',
  'rules.blockRules.aiPromptOptional': 'AI 提示词（可选）',
  'rules.blockRules.blockUnifiedPrompt': '该分块统一提示词',
  'rules.blockRules.blockAiPlaceholder': '例如：\n检查本条款中 运输方式/交货地点/交货日期/最终用户 的填写是否一致、是否存在矛盾，并输出问题清单（严格 JSON）。',
  'rules.blockRules.promptTitle': '标题：{title}',
  'rules.blockRules.noneConfigurable': '未检测到可配置的输入区域。请先在“生成模板快照”上传标准合同。',

  'rules.globalPrompt.title': '全局提示词（用于“全局风险与改进建议”）',
  'common.load': '加载',
  'common.save': '保存',
  'common.saving': '保存中...',
  'rules.globalPrompt.defaultTitle': '默认提示词',
  'rules.globalPrompt.defaultPlaceholder': '例如：请基于 blocks/diffRows/checkRun，总结整体风险等级、关键问题、改进建议与缺失信息。输出严格 JSON。',
  'rules.globalPrompt.templateTitle': '当前合同类型覆盖（{templateId}）',
  'rules.globalPrompt.templatePlaceholder': '留空表示使用默认提示词。',

  'template.defaultName.sales': '买卖合同（销售）',

  'side.leftShort': '左侧',
  'side.rightShort': '右侧',

  'label.standardTemplate': '标准模板',
  'label.ai': 'AI：',

  'filename.standardTemplate': '标准模板-{label}.docx',

  'ruleset.title.tableCheck': '表格检查',
  'ruleset.title.dateCheckSuffix': '日期校验',
  'ruleset.title.fillSuffix': '请填写',
  'ruleset.title.blockAiCheck': '分块 AI 检查',
  'ruleset.unnamed': '未命名规则集',

  'error.templateId.required': 'templateId 不能为空',
  'error.file.parse': '解析{side}文件失败：{message}',
  'error.diff': '对比失败：{message}',
  'error.needParseRight': '请先解析右侧文件。',
  'error.needParseLeftOrTemplate': '请先解析左侧文件，或先匹配/选择标准模板。',
  'error.needParseRightContract': '请先解析右侧合同文件。',
  'error.template.loadStandard': '加载标准模板失败：{message}',
  'error.template.load': '加载模板失败：{message}',
  'error.template.save': '保存模板失败：{message}',
  'error.template.parse': '解析模板失败：{message}',
  'error.templateIndex.load': '加载模板库失败：{message}',
  'error.template.rename': '重命名失败：{message}',
  'error.template.delete': '删除失败：{message}',
  'error.ruleset.load': '加载规则集失败：{message}',
  'error.ruleset.save': '保存规则集失败：{message}',
  'error.skill.export': '导出失败：{message}',
  'error.skill.import': '导入失败：{message}',

  'error.globalPrompt.load': '加载全局提示词失败：{message}',
  'error.globalPrompt.save': '保存全局提示词失败：{message}'
}

const enUS: Dict = {
  'app.title': 'Doc Comparison',
  'toolbar.lang.switchTitle': 'Switch language',
  'toolbar.theme.toLight': 'Switch to light theme',
  'toolbar.theme.toDark': 'Switch to dark theme',
  'toolbar.theme.light': '☀️ Light',
  'toolbar.theme.dark': '🌙 Dark',
  'toolbar.configRules': '⚙ Rules',
  'toolbar.configRules.disabled': 'Rules are unavailable without a matched template',

  'upload.collapsed.original': 'Original: ',
  'upload.collapsed.revised': 'Revised: ',
  'upload.collapsed.none': 'Not selected',
  'upload.collapsed.expand': 'Expand upload panel',

  'upload.leftTitle': 'Original',
  'upload.rightTitle': 'Revised',
  'upload.clickUpload': 'Click to upload .docx',
  'upload.parsedBlocks': '✓ Parsed {count} blocks',

  'side.contractType': 'Contract Type',
  'side.contractType.unmatched': '(No matched template: use generic prompts)',
  'side.aiCheck': 'AI Check',
  'side.aiAnalyze': 'AI Analyze',
  'side.compare.loading': '⏳ Comparing',
  'side.compare.start': '⇄ Compare',
  'side.reset.title': 'Clear uploaded files and comparison results',
  'side.reset': '↺ Reset',

  'mid.showOnlyDiff.title': 'Show only changed rows',
  'mid.showOnlyDiff': 'Diff only',
  'mid.diff.prev': 'Previous diff',
  'mid.diff.next': 'Next diff',
  'mid.checkPane.collapse': 'Collapse check panel',
  'mid.checkPane.expand': 'Expand check panel',
  'mid.checkFilter.title': 'On: issues only; Off: all',
  'mid.checkFilter.issuesOnly': 'Issues only',
  'mid.checkFilter.all': 'All',
  'mid.globalPane.collapse': 'Collapse global analysis',
  'mid.globalPane.expand': 'Expand global analysis',
  'mid.globalAnalyze.loading': 'Analyzing',
  'mid.check.loading': 'AI running',

  'check.title': 'Check Results',
  'check.summary': 'Pass {pass} · Fail {fail} · Warn {warn} · Manual {manual}',
  'check.empty.issues': 'No issues found.',
  'check.empty.all': 'No check items.',
  'check.notRun': 'Not run',
  'check.loading': 'Checking...',
  'check.cell.none': 'No check items',

  'global.title': 'Global Risks & Suggestions',
  'global.reanalyze': 'Re-analyze',
  'global.reanalyze.loading': 'Analyzing...',

  'ai.globalAnalyze.templateNote': 'Background: the left side may be a blank template. Underlines or blanks on the left are placeholders. During comparison and analysis, do not treat left-side blanks as issues or contradictions. First determine whether the right side is still a blank template; if the right side is filled, focus on required-field completeness, consistency, and numeric/date/amount calculations, and provide actionable suggestions.',

  'globalAnalyze.empty.needDiff': 'Run comparison first.',
  'globalAnalyze.empty.disabled': 'AI Analyze is off.',
  'globalAnalyze.empty.loading': 'Analyzing...',
  'globalAnalyze.empty.none': 'No results.',
  'globalAnalyze.conclusion': 'Conclusion',
  'globalAnalyze.confidence': 'Confidence: {value}',
  'globalAnalyze.raw.hide': 'Hide raw JSON',
  'globalAnalyze.raw.show': 'View raw JSON',
  'globalAnalyze.keyFindings': 'Key Findings',
  'globalAnalyze.table.issue': 'Issue',
  'globalAnalyze.table.detail': 'Detail',
  'globalAnalyze.table.evidence': 'Evidence',
  'globalAnalyze.suggestions': 'Suggestions',
  'globalAnalyze.table.priority': 'Priority',
  'globalAnalyze.table.suggestion': 'Suggestion',
  'globalAnalyze.table.content': 'Content',
  'globalAnalyze.missing': 'Missing information',
  'globalAnalyze.sections': 'By section/topic',
  'globalAnalyze.blocks': 'Block review (sampled)',
  'globalAnalyze.evidenceCount': 'Evidence: {count}',
  'globalAnalyze.shownFirst': 'Showing first {count} block reviews.',

  'diff.left': 'Original',
  'diff.right': 'Revised',

  'ref.thisBlock': 'this block',
  'ref.thisTable': 'this table',
  'ref.thisField': 'this field',

  'evidence.none': '—',
  'evidence.left': 'L: {text}',
  'evidence.right': 'R: {text}',
  'evidence.excerpt': 'Excerpt: {text}',
  'evidence.rowAt': 'Row: {label} ({id})',

  'label.row': 'Row {n}',
  'label.block': 'Block {n}',
  'label.table': 'Table',
  'label.field': 'Field',
  'label.blockShort': 'Block',
  'label.tableShort': 'Table',
  'label.fieldShort': 'Field',

  'risk.high': 'High risk',
  'risk.medium': 'Medium risk',
  'risk.low': 'Low risk',
  'priority.critical': 'Critical',
  'priority.high': 'High',
  'priority.medium': 'Medium',
  'priority.low': 'Low',

  'rules.modal.title': 'Contract Rules',
  'common.close': 'Close',

  'rules.templateLibrary.title': 'Templates',
  'common.loading': 'Loading...',
  'rules.templateLibrary.refresh': 'Refresh',
  'rules.templateLibrary.existing': 'Existing',
  'rules.templateLibrary.versions': '{count} versions',
  'common.edit': 'Edit',
  'rules.templateLibrary.export': 'Export',
  'rules.templateLibrary.rename': 'Rename',
  'rules.templateLibrary.renamePrompt': 'Enter a new template name:',
  'common.delete': 'Delete',
  'rules.templateLibrary.deleteConfirm': 'Delete template “{name}”? This also deletes its ruleset.',
  'common.use': 'Use',
  'rules.templateLibrary.empty': 'No templates. Generate a snapshot on the right.',
  'rules.templateLibrary.generate': 'Generate Snapshot',
  'rules.templateLibrary.name': 'Name',
  'rules.templateLibrary.version': 'Version',
  'rules.templateLibrary.chooseFile': 'Choose template file',
  'rules.templateLibrary.noFile': 'No file selected',
  'rules.templateLibrary.draftHint': 'Template draft is loaded (not saved). Click “Save (create/update)” after configuring rules to persist it.',
  'rules.templateLibrary.uploadHint': 'Uploading a template loads blocks automatically; no need to upload again in the block section.',
  'rules.templateLibrary.import': 'Import',
  'rules.templateLibrary.importOverwrite': 'Same version detected. Overwrite? (OK=overwrite, Cancel=abort import)',

  'rules.blockRules.title': 'Block Rules (built-in + optional AI)',
  'rules.blockRules.expandAll': 'Expand all',
  'rules.blockRules.collapseAll': 'Collapse all',
  'rules.blockRules.save': 'Save (create/update)',
  'rules.blockRules.saving': 'Saving...',
  'rules.blockRules.loaded': 'Loaded: {text}',
  'rules.blockRules.loaded.blocks': '{count} blocks',
  'rules.blockRules.loaded.empty': 'No template blocks loaded',
  'rules.blockRules.groupByTop': 'Group by top-level',
  'rules.blockRules.groupByInputs': 'Group by inputs',
  'rules.blockRules.onlyInputBlocks': 'Only blocks with inputs are shown (underline / colon blank / table).',
  'rules.blockRules.aiHint': 'AI prompt tip: first line as title, following lines as criteria/output format. When AI is off, only built-in rules run.',
  'rules.blockRules.itemsCount': '{count} items',
  'rules.blockRules.blockContent': 'Block Content',
  'rules.blockRules.blockContentMissing': '(Block content not found)',
  'rules.blockRules.blockFallbackTitle': 'Block',
  'rules.blockRules.fixedRules': 'Built-in Rules',
  'rules.blockRules.table': 'Table',
  'rules.blockRules.from': 'From: {title}{excerpt}',
  'rules.blockRules.excerpt': ' · Excerpt: {excerpt}',
  'rules.blockRules.requiredAfterColon': 'Required (after colon/underline)',
  'rules.blockRules.dateFormat': 'Date format',
  'rules.blockRules.dateMonth': 'At least month precision',
  'rules.blockRules.salesTable': 'Sales items table check',
  'rules.blockRules.tableAiPrompt': 'Table AI prompt (optional)',
  'rules.blockRules.tableAiPlaceholder': 'Example:\nValidate whether product/qty/price/total/subtotal are filled and calculations are consistent. Output a concise, actionable issue list.',
  'rules.blockRules.aiPromptOptional': 'AI prompt (optional)',
  'rules.blockRules.blockUnifiedPrompt': 'Unified prompt for this block',
  'rules.blockRules.blockAiPlaceholder': 'Example:\nCheck consistency for shipping method/delivery location/delivery date/end user. Output issue list (strict JSON).',
  'rules.blockRules.promptTitle': 'Title: {title}',
  'rules.blockRules.noneConfigurable': 'No configurable input areas detected. Upload a standard contract under “Generate Snapshot” first.',

  'rules.globalPrompt.title': 'Global Prompt (for “Global Risks & Suggestions”)',
  'common.load': 'Load',
  'common.save': 'Save',
  'common.saving': 'Saving...',
  'rules.globalPrompt.defaultTitle': 'Default Prompt',
  'rules.globalPrompt.defaultPlaceholder': 'Example: Based on blocks/diffRows/checkRun, summarize overall risk level, key issues, suggestions, and missing info. Output strict JSON.',
  'rules.globalPrompt.templateTitle': 'Override for contract type ({templateId})',
  'rules.globalPrompt.templatePlaceholder': 'Leave empty to use the default prompt.',

  'template.defaultName.sales': 'Sales Contract',

  'side.leftShort': 'Left',
  'side.rightShort': 'Right',

  'label.standardTemplate': 'Standard Template',
  'label.ai': 'AI: ',

  'filename.standardTemplate': 'StandardTemplate-{label}.docx',

  'ruleset.title.tableCheck': 'Table check',
  'ruleset.title.dateCheckSuffix': 'date check',
  'ruleset.title.fillSuffix': 'required',
  'ruleset.title.blockAiCheck': 'Block AI check',
  'ruleset.unnamed': 'Unnamed ruleset',

  'error.templateId.required': 'templateId is required',
  'error.file.parse': 'Failed to parse {side} file: {message}',
  'error.diff': 'Comparison failed: {message}',
  'error.needParseRight': 'Parse the right file first.',
  'error.needParseLeftOrTemplate': 'Parse the left file first, or match/select a standard template.',
  'error.needParseRightContract': 'Parse the right contract file first.',
  'error.template.loadStandard': 'Failed to load standard template: {message}',
  'error.template.load': 'Failed to load template: {message}',
  'error.template.save': 'Failed to save template: {message}',
  'error.template.parse': 'Failed to parse template: {message}',
  'error.templateIndex.load': 'Failed to load template library: {message}',
  'error.template.rename': 'Rename failed: {message}',
  'error.template.delete': 'Delete failed: {message}',
  'error.ruleset.load': 'Failed to load ruleset: {message}',
  'error.ruleset.save': 'Failed to save ruleset: {message}',
  'error.skill.export': 'Export failed: {message}',
  'error.skill.import': 'Import failed: {message}',

  'error.globalPrompt.load': 'Failed to load global prompt: {message}',
  'error.globalPrompt.save': 'Failed to save global prompt: {message}'
}

const dictByLang: Record<Lang, Dict> = {
  'zh-CN': zhCN,
  'en-US': enUS
}

const format = (tpl: string, params?: Record<string, unknown>) => {
  if (!params) return tpl
  return tpl.replace(/\{(\w+)\}/g, (_m, k) => {
    const v = params[k]
    return v === undefined || v === null ? '' : String(v)
  })
}

export const normalizeLang = (raw: string | null | undefined): Lang => {
  const v = String(raw || '').trim()
  if (v === 'zh-CN' || v === 'en-US') return v
  const nav = (typeof navigator !== 'undefined' ? navigator.language : '') || ''
  if (nav.toLowerCase().startsWith('zh')) return 'zh-CN'
  return 'en-US'
}

export const createT = (lang: Lang) => {
  const primary = dictByLang[lang]
  const fallback = dictByLang['zh-CN']
  return (key: string, params?: Record<string, unknown>) => {
    const raw = primary[key] ?? fallback[key] ?? key
    return format(raw, params)
  }
}

type I18nContextValue = {
  lang: Lang
  setLang: (lang: Lang) => void
  t: (key: string, params?: Record<string, unknown>) => string
}

const I18nContext = React.createContext<I18nContextValue | null>(null)

export const I18nProvider = (props: { lang: Lang; setLang: (lang: Lang) => void; children: React.ReactNode }) => {
  const { lang, setLang, children } = props
  const t = React.useMemo(() => createT(lang), [lang])
  const value = React.useMemo(() => ({ lang, setLang, t }), [lang, setLang, t])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export const useI18n = () => {
  const ctx = React.useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used within I18nProvider')
  return ctx
}
