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

export interface CheckRunResponse {
  runId: string
  templateId: string
  templateVersion: string
  summary: any
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

