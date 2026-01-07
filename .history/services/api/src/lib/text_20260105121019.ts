export function normalizeText(input: string): string {
  return input
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function diceCoefficient(a: string, b: string): number {
  const sa = normalizeText(a).toLowerCase();
  const sb = normalizeText(b).toLowerCase();
  if (!sa || !sb) return 0;
  if (sa === sb) return 1;
  const bgA = bigrams(sa);
  const bgB = bigrams(sb);
  let overlap = 0;
  const map = new Map<string, number>();
  for (const x of bgA) map.set(x, (map.get(x) ?? 0) + 1);
  for (const y of bgB) {
    const c = map.get(y) ?? 0;
    if (c > 0) {
      overlap += 1;
      map.set(y, c - 1);
    }
  }
  return (2 * overlap) / (bgA.length + bgB.length);
}

function bigrams(s: string): string[] {
  const x = s.replace(/\s+/g, " ");
  const out: string[] = [];
  for (let i = 0; i < x.length - 1; i++) out.push(x.slice(i, i + 2));
  return out.length ? out : [x];
}
