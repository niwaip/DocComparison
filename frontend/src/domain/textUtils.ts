export const hashString = (input: string) => {
  let h = 5381
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h) ^ input.charCodeAt(i)
  }
  const n = h >>> 0
  return n.toString(16).padStart(8, '0')
}

export const escapeRegex = (s: string) => (s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

