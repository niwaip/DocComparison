import React from 'react'
import { flags } from './config/flags'
import ContractRulesModalV2, { type ContractRulesModalProps } from './features/rules/ContractRulesModalV2'
import ContractRulesModalLegacy from './legacy/ContractRulesModalLegacy'

export type { DetectedField, FieldRuleState } from './domain/types'

export default function ContractRulesModal(props: ContractRulesModalProps) {
  if (flags.useRulesModalV2) return <ContractRulesModalV2 {...props} />
  return <ContractRulesModalLegacy {...props} />
}
