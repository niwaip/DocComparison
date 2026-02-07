const readFlag = (key: string, fallback: boolean) => {
  const raw = (import.meta as unknown as { env?: Record<string, unknown> })?.env?.[key]
  if (raw === undefined || raw === null || raw === '') return fallback
  const v = String(raw).toLowerCase().trim()
  if (v === '1' || v === 'true' || v === 'yes' || v === 'on') return true
  if (v === '0' || v === 'false' || v === 'no' || v === 'off') return false
  return fallback
}

export const flags = {
  useRulesModalV2: readFlag('VITE_RULES_MODAL_V2', true)
}
