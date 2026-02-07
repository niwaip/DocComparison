export interface BlockMeta {
  headingLevel?: number
  pageNumber?: number
}

export interface Block {
  blockId: string
  kind: string
  structurePath: string
  stableKey: string
  text: string
  htmlFragment: string
  meta: BlockMeta
}

export interface AlignmentRow {
  rowId: string
  kind: 'matched' | 'inserted' | 'deleted' | 'changed'
  leftBlockId: string | null
  rightBlockId: string | null
  diffHtml?: string
  leftDiffHtml?: string
  rightDiffHtml?: string
}

export interface CheckEvidence {
  rightBlockId?: string | null
  excerpt?: string | null
}

export interface CheckAiResult {
  status?: 'pass' | 'fail' | 'warn' | 'manual' | 'error' | 'skipped' | null
  summary?: string | null
  confidence?: number | null
  raw?: string | null
}

export interface CheckResultItem {
  pointId: string
  title: string
  severity: 'high' | 'medium' | 'low'
  status: 'pass' | 'fail' | 'warn' | 'manual' | 'error' | 'skipped'
  message: string
  evidence: CheckEvidence
  ai?: CheckAiResult | null
}

export interface CheckRunSummaryCounts {
  pass: number
  fail: number
  warn: number
  manual: number
  error: number
  skipped: number
}

export interface CheckRunSummary {
  generatedAt?: string
  counts: CheckRunSummaryCounts
}

export interface CheckRunResponse {
  runId: string
  templateId: string
  templateVersion: string
  summary: CheckRunSummary
  items: CheckResultItem[]
}

export interface TemplateListItem {
  templateId: string
  name: string
  versions: string[]
}

export interface TemplateMatchItem {
  templateId: string
  name: string
  version: string
  score: number
}

export interface TemplateMatchResponse {
  best?: TemplateMatchItem | null
  candidates: TemplateMatchItem[]
}

export interface GlobalPromptConfig {
  defaultPrompt: string
  byTemplateId: Record<string, string>
}

export interface GlobalAnalyzeResponse {
  raw: string
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

export interface RulesetAnchor {
  type: 'structurePath' | 'textRegex'
  value: string
}

export interface RulesetRule {
  type: string
  params?: Record<string, unknown>
}

export interface RulesetAi {
  policy: 'optional' | 'required' | 'disabled' | (string & {})
  prompt?: string
}

export interface RulesetPoint {
  pointId: string
  title: string
  severity: 'high' | 'medium' | 'low'
  anchor: RulesetAnchor
  rules: RulesetRule[]
  ai?: RulesetAi | null
}

export interface Ruleset {
  templateId: string
  name: string
  version: string
  referenceData: Record<string, unknown>
  points: RulesetPoint[]
}
