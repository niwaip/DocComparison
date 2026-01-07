export function normalizeText(input: string): string {
  let out = input
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const cjkSpace = /([\u4e00-\u9fff])\s+([\u4e00-\u9fff])/g;
  while (cjkSpace.test(out)) out = out.replace(cjkSpace, "$1$2");
  return out;
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

export function getLeadingSectionLabel(text: string): string | null {
  const norm = normalizeText(text);
  const firstLine = norm.split("\n").map((x) => x.trim()).find((x) => x.length > 0) ?? "";
  if (!firstLine) return null;

  const mNum = /^(\d+(?:\.\d+)*)(?=(?:\s|[.。:：、\-—\)])|$)/.exec(firstLine);
  if (mNum) return mNum[1];

  const mCn = /^(第[一二三四五六七八九十百千0-9]+[条章节篇部分])(?=(?:\s|[.。:：、\-—\)])|$)/.exec(firstLine);
  if (mCn) return mCn[1];

  return null;
}

export function stripSectionNoise(text: string): string {
  const norm = normalizeText(text);
  if (!norm) return "";
  const lines = norm.split("\n").map((line) => {
    let s = line.trim();
    if (!s) return "";

    s = s.replace(/(?:\.{3,}|…{2,}|·{3,}|-{3,}|_{3,})\s*\d+\s*$/g, "").trim();

    const mNum = /^(\d+(?:\.\d+)*)(?=(?:\s|[.。:：、\-—\)])|$)/.exec(s);
    if (mNum) {
      s = s.slice(mNum[0].length).replace(/^[\s.。:：、\-—)\]]+/g, "").trimStart();
    } else {
      const mCn = /^(第[一二三四五六七八九十百千0-9]+[条章节篇部分])(?=(?:\s|[.。:：、\-—\)])|$)/.exec(s);
      if (mCn) s = s.slice(mCn[0].length).replace(/^[\s.。:：、\-—)\]]+/g, "").trimStart();
    }

    return s;
  });
  return normalizeText(lines.filter(Boolean).join("\n"));
}
