import pdf from "pdf-parse";
import { escapeHtml, getLeadingSectionLabel, normalizeText } from "./text";

export async function pdfBufferToSafeHtml(buffer: Buffer): Promise<string> {
  const data = await pdf(buffer);
  const text = normalizeText(data.text ?? "");
  if (!text) return "<p></p>";

  const rawParas = splitToRawParagraphs(text);
  const paras = reorderTermBlocks(rawParas.flatMap((p) => expandParagraph(p))).slice(0, 5000);

  const html = paras
    .map((p) => {
      const escaped = escapeHtml(p).replace(/\n/g, "<br/>");
      return `<p>${escaped}</p>`;
    })
    .join("");

  return html || "<p></p>";
}

function splitToRawParagraphs(text: string): string[] {
  const lines = text.split("\n").map((x) => x.trimEnd());
  const out: string[] = [];
  let buf: string[] = [];
  const flush = () => {
    const s = normalizeText(buf.join("\n"));
    if (s) out.push(s);
    buf = [];
  };
  for (const line of lines) {
    if (!line.trim()) {
      flush();
      continue;
    }
    buf.push(line);
  }
  flush();
  return out;
}

function expandParagraph(p: string): string[] {
  const norm = normalizeText(p);
  if (!norm) return [];
  const lines = norm.split("\n").map((x) => normalizeText(x)).filter(Boolean);
  if (lines.length <= 1) return [norm];

  const bulletLikeCount = lines.filter((l) => looksLikeBulletLine(l)).length;
  const shortCount = lines.filter((l) => l.trim().length > 0 && l.trim().length <= 60).length;
  const structured = shortCount / Math.max(1, lines.length) >= 0.55 && bulletLikeCount / Math.max(1, lines.length) >= 0.12;

  const shouldSplitLines =
    lines.length >= 12 ||
    lines.some((l) => looksLikeTocLine(l)) ||
    (lines.length >= 8 && (structured || lines.some((l) => looksLikeSectionHeading(l))));
  if (!shouldSplitLines) return [norm];

  return lines;
}

function looksLikeTocLine(line: string): boolean {
  const s = line.trim();
  if (!s) return false;
  if (/(?:\.{3,}|…{2,}|·{3,}|-{3,}|_{3,})\s*\d+\s*$/.test(s)) return true;
  if (/^\d+(?:\.\d+)*\s+.+\s+\d+\s*$/.test(s)) return true;
  return false;
}

function looksLikeSectionHeading(line: string): boolean {
  const s = line.trim();
  if (!s) return false;
  if (/^\d+(?:\.\d+)*(\s|[.。:：、\-—\)])/.test(s)) return true;
  if (/^第[一二三四五六七八九十百千0-9]+[章节条篇部分]/.test(s)) return true;
  return false;
}

function looksLikeBulletLine(line: string): boolean {
  const s = line.trim();
  if (!s) return false;
  if (/^[a-z]\)/i.test(s)) return true;
  if (/^\d+\)/.test(s)) return true;
  if (/^[（(]?[一二三四五六七八九十]+[）)]/.test(s)) return true;
  if (/^[一二三四五六七八九十]+[、.]/.test(s)) return true;
  if (/^[-*•]\s+/.test(s)) return true;
  return false;
}

function reorderTermBlocks(paras: string[]): string[] {
  const parseLabelSegs = (label: string): number[] | null => {
    if (!/^\d+(?:\.\d+)+$/.test(label)) return null;
    const segs = label.split(".").map((x) => Number(x)).filter((n) => Number.isFinite(n));
    return segs.length >= 2 ? segs : null;
  };

  const compareSegs = (a: number[], b: number[]): number => {
    const n = Math.max(a.length, b.length);
    for (let i = 0; i < n; i++) {
      const av = a[i] ?? -1;
      const bv = b[i] ?? -1;
      if (av !== bv) return av < bv ? -1 : 1;
    }
    return 0;
  };

  const isTermLabelPara = (p: string): { major: number; segs: number[] } | null => {
    const s = (p ?? "").trim();
    if (!s) return null;
    if (looksLikeTocLine(s)) return null;
    const label = getLeadingSectionLabel(s);
    if (!label) return null;
    const segs = parseLabelSegs(label);
    if (!segs) return null;
    if (s === label) return { major: segs[0] ?? -1, segs };
    if (new RegExp(`^${label}(?:\\s|[.。:：、\\-—\\)])`).test(s)) return { major: segs[0] ?? -1, segs };
    return null;
  };

  const sortGroupsIfNeeded = (groups: Array<{ major: number; segs: number[]; paras: string[] }>): string[] => {
    if (groups.length < 5) return groups.flatMap((g) => g.paras);
    const major = groups[0]?.major ?? -1;
    if (major < 0 || groups.some((g) => g.major !== major)) return groups.flatMap((g) => g.paras);
    let inversions = 0;
    for (let i = 1; i < groups.length; i++) if (compareSegs(groups[i - 1].segs, groups[i].segs) > 0) inversions++;
    if (inversions === 0) return groups.flatMap((g) => g.paras);
    const sorted = [...groups].sort((x, y) => compareSegs(x.segs, y.segs));
    return sorted.flatMap((g) => g.paras);
  };

  const out: string[] = [];
  let bufPrefix: string[] = [];
  let currentMajor: number | null = null;
  let currentGroups: Array<{ major: number; segs: number[]; paras: string[] }> = [];
  let currentGroup: { major: number; segs: number[]; paras: string[] } | null = null;

  const flushRegion = () => {
    out.push(...bufPrefix);
    bufPrefix = [];
    if (currentGroup) currentGroups.push(currentGroup);
    out.push(...sortGroupsIfNeeded(currentGroups));
    currentGroups = [];
    currentGroup = null;
    currentMajor = null;
  };

  for (const p of paras) {
    const hit = isTermLabelPara(p);
    if (!hit) {
      if (!currentGroup) bufPrefix.push(p);
      else currentGroup.paras.push(p);
      continue;
    }

    if (currentMajor !== null && hit.major !== currentMajor) {
      flushRegion();
    }

    if (!currentGroup) {
      out.push(...bufPrefix);
      bufPrefix = [];
      currentMajor = hit.major;
      currentGroup = { major: hit.major, segs: hit.segs, paras: [p] };
      continue;
    }

    currentGroups.push(currentGroup);
    currentMajor = hit.major;
    currentGroup = { major: hit.major, segs: hit.segs, paras: [p] };
  }

  if (currentGroup || currentGroups.length) flushRegion();
  else out.push(...bufPrefix);

  return out;
}
