import DiffMatchPatch from "diff-match-patch";
import { diceCoefficient, escapeHtml, getLeadingSectionLabel, stripSectionNoise } from "./text";

export function inlineDiffHtml(
  beforeText: string,
  afterText: string,
  options?: { lineLookahead?: number; alignLines?: boolean; ignoreSectionNumber?: boolean }
): {
  leftHtml: string;
  rightHtml: string;
  insIds: string[];
  delIds: string[];
} {
  const alignEnabled = options?.alignLines !== false;
  const window = Math.max(1, Math.min(50, Math.floor(options?.lineLookahead ?? 10)));
  const normalizeNewlinesForDiff = (s: string): string => {
    return (s ?? "")
      .replace(/\r\n/g, "\n")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trimEnd();
  };

  let before = normalizeNewlinesForDiff(beforeText);
  let after = normalizeNewlinesForDiff(afterText);
  const ignoreSectionNumber = options?.ignoreSectionNumber !== false;

  const shouldAlignLines = (aLines: string[], bLines: string[], ignoreSectionNumber: boolean): boolean => {
    const key = (line: string): string => {
      const x = ignoreSectionNumber ? stripSectionNoise(line) : line;
      return x.toLowerCase().replace(/\s+/g, " ").trim();
    };

    const scoreLine = (line: string): { len: number; anchor: boolean } => {
      const s = (line ?? "").trim();
      if (!s) return { len: 0, anchor: false };
      const len = s.length;
      const label = getLeadingSectionLabel(s);
      const isLabel = Boolean(label && /^\d+(?:\.\d+)*$/.test(label));
      const isAlphaBullet = /^[a-z]\)/i.test(s);
      const isNumBullet = /^\d+\)/.test(s);
      const isCnBullet = /^[（(]?[一二三四五六七八九十]+[）)]/.test(s) || /^[一二三四五六七八九十]+[、.]/.test(s);
      const isDash = /^[-*•]\s+/.test(s);
      const anchor = isLabel || isAlphaBullet || isNumBullet || isCnBullet || isDash;
      return { len, anchor };
    };

    const analyze = (lines: string[]) => {
      const scored = lines.map(scoreLine).filter((x) => x.len > 0);
      const n = scored.length;
      if (n === 0) return { n: 0, shortRatio: 0, anchorRatio: 0, avgLen: 0 };
      const short = scored.filter((x) => x.len <= 60).length;
      const anchor = scored.filter((x) => x.anchor).length;
      const avgLen = scored.reduce((sum, x) => sum + x.len, 0) / n;
      return { n, shortRatio: short / n, anchorRatio: anchor / n, avgLen };
    };

    const a = analyze(aLines);
    const b = analyze(bLines);
    const minN = Math.min(a.n, b.n);
    if (minN < 6) return false;

    const aStructured = a.shortRatio >= 0.55 && a.anchorRatio >= 0.12 && a.avgLen <= 90;
    const bStructured = b.shortRatio >= 0.55 && b.anchorRatio >= 0.12 && b.avgLen <= 90;
    if (aStructured && bStructured) return true;

    const aTocish = aLines.filter((l) => /\.\.{3,}\s*\d+\s*$/.test((l ?? "").trim())).length / Math.max(1, a.n);
    const bTocish = bLines.filter((l) => /\.\.{3,}\s*\d+\s*$/.test((l ?? "").trim())).length / Math.max(1, b.n);
    if (aTocish >= 0.2 && bTocish >= 0.2) return true;

    const aKeys = new Set(aLines.map(key).filter(Boolean));
    const bKeys = new Set(bLines.map(key).filter(Boolean));
    let overlap = 0;
    for (const k of aKeys) if (bKeys.has(k)) overlap++;
    const overlapRatio = overlap / Math.max(1, Math.min(aKeys.size, bKeys.size));
    return overlapRatio >= 0.25 && minN >= 10 && a.avgLen <= 120 && b.avgLen <= 120;
  };

  let preserveHardLineBreaks = false;
  if (alignEnabled) {
    const aLines = before.split("\n");
    const bLines = after.split("\n");
    preserveHardLineBreaks = (aLines.length >= 6 || bLines.length >= 6) && shouldAlignLines(aLines, bLines, ignoreSectionNumber);
    if (preserveHardLineBreaks) {
      const aligned = alignLinesWithLookahead(aLines, bLines, window, ignoreSectionNumber);
      before = aligned.left.join("\n");
      after = aligned.right.join("\n");
    }
  }

  const dmp = new DiffMatchPatch();
  const diffs = dmp.diff_main(before, after) as Array<[number, string]>;
  dmp.diff_cleanupSemantic(diffs);

  const insIds: string[] = [];
  const delIds: string[] = [];
  let insN = 1;
  let delN = 1;

  const renderText = (data: string): string => {
    const escaped = escapeHtml(data);
    if (preserveHardLineBreaks) return escaped.replace(/\n/g, "<br/>");
    return escaped.replace(/\n\n/g, "<br/><br/>").replace(/\n/g, " ");
  };

  const leftHtml = diffs
    .map(([op, data]: [number, string]) => {
      const escaped = renderText(data);
      if (op === DiffMatchPatch.DIFF_INSERT) {
        const id = `i_${insN++}`;
        insIds.push(id);
        return "";
      }
      if (op === DiffMatchPatch.DIFF_DELETE) {
        const id = `d_${delN++}`;
        delIds.push(id);
        return `<del data-del-id="${id}">${escaped}</del>`;
      }
      return escaped;
    })
    .join("");

  insN = 1;
  delN = 1;

  const rightHtml = diffs
    .map(([op, data]: [number, string]) => {
      const escaped = renderText(data);
      if (op === DiffMatchPatch.DIFF_INSERT) {
        const id = `i_${insN++}`;
        return `<ins data-ins-id="${id}">${escaped}</ins>`;
      }
      if (op === DiffMatchPatch.DIFF_DELETE) {
        const id = `d_${delN++}`;
        return "";
      }
      return escaped;
    })
    .join("");

  return { leftHtml, rightHtml, insIds, delIds };
}

function alignLinesWithLookahead(
  leftLines: string[],
  rightLines: string[],
  window: number,
  ignoreSectionNumber: boolean
): { left: string[]; right: string[] } {
  const key = (line: string): string => {
    const x = ignoreSectionNumber ? stripSectionNoise(line) : line;
    return x.toLowerCase().replace(/\s+/g, " ").trim();
  };

  const isMatch = (a: string, b: string): boolean => {
    const ka = key(a);
    const kb = key(b);
    if (!ka || !kb) return false;
    return ka === kb;
  };

  const joinLines = (a: string, b: string): string => {
    const x = `${(a ?? "").trim()} ${(b ?? "").trim()}`.trim();
    return x.replace(/\s+/g, " ");
  };

  let i = 0;
  let j = 0;
  const outL: string[] = [];
  const outR: string[] = [];
  const maxGapRun = 3;
  let gapRun = 0;

  const parseLabel = (line: string): number[] | null => {
    const label = getLeadingSectionLabel(line);
    if (!label) return null;
    if (!/^\d+(?:\.\d+)*$/.test(label)) return null;
    const segs = label.split(".").map((x) => Number(x)).filter((n) => Number.isFinite(n));
    return segs.length ? segs : null;
  };

  const isCnSection = (line: string): boolean => {
    const s = line.trim();
    if (!s) return false;
    if (/^第[一二三四五六七八九十百千0-9]+[章节条篇部分]/.test(s)) return true;
    if (/^[一二三四五六七八九十]+[、.]/.test(s)) return true;
    return false;
  };

  const anchorScore = (line: string): number => {
    const s = line.trim();
    if (!s) return 0;
    let score = 0;
    if (parseLabel(s)) score += 3;
    if (isCnSection(s)) score += 2;
    if (/^[a-z]\)/i.test(s) || /^\d+\)/.test(s)) score += 2;
    if (/^[-*•]\s+/.test(s)) score += 2;
    if (s.length <= 40) score += 1;
    return score;
  };

  const canSoftJoin = (a: string, b: string): boolean => {
    const x = (a ?? "").trim();
    const y = (b ?? "").trim();
    if (!x || !y) return false;
    if (anchorScore(y) >= 2) return false;
    if (/[。.!?;；:：]$/.test(x)) return false;
    if (x.length > 60) return false;
    return true;
  };

  const compareLabel = (a: number[], b: number[]): number => {
    const n = Math.max(a.length, b.length);
    for (let k = 0; k < n; k++) {
      const av = a[k] ?? -1;
      const bv = b[k] ?? -1;
      if (av !== bv) return av < bv ? -1 : 1;
    }
    return 0;
  };

  while (i < leftLines.length || j < rightLines.length) {
    if (i >= leftLines.length) {
      outL.push("");
      outR.push(rightLines[j++] ?? "");
      gapRun = Math.min(maxGapRun, gapRun + 1);
      continue;
    }
    if (j >= rightLines.length) {
      outL.push(leftLines[i++] ?? "");
      outR.push("");
      gapRun = Math.min(maxGapRun, gapRun + 1);
      continue;
    }

    const a = leftLines[i] ?? "";
    const b = rightLines[j] ?? "";
    if (isMatch(a, b)) {
      outL.push(a);
      outR.push(b);
      i++;
      j++;
      gapRun = 0;
      continue;
    }

    if (i + 1 < leftLines.length && canSoftJoin(a, leftLines[i + 1] ?? "")) {
      const mergedLeft = joinLines(a, leftLines[i + 1] ?? "");
      if (diceCoefficient(key(mergedLeft), key(b)) >= 0.92) {
        outL.push(mergedLeft);
        outR.push(b);
        i += 2;
        j += 1;
        gapRun = 0;
        continue;
      }
    }

    if (j + 1 < rightLines.length && canSoftJoin(b, rightLines[j + 1] ?? "")) {
      const mergedRight = joinLines(b, rightLines[j + 1] ?? "");
      if (diceCoefficient(key(a), key(mergedRight)) >= 0.92) {
        outL.push(a);
        outR.push(mergedRight);
        i += 1;
        j += 2;
        gapRun = 0;
        continue;
      }
    }

    let kRight = -1;
    for (let k = 1; k <= window && j + k < rightLines.length; k++) {
      if (isMatch(a, rightLines[j + k] ?? "")) {
        kRight = k;
        break;
      }
    }

    let kLeft = -1;
    for (let k = 1; k <= window && i + k < leftLines.length; k++) {
      if (isMatch(leftLines[i + k] ?? "", b)) {
        kLeft = k;
        break;
      }
    }

    if (kRight > 0 && (kLeft < 0 || kRight <= kLeft)) {
      if (gapRun < maxGapRun) {
        outL.push("");
        outR.push(b);
        j++;
        gapRun += 1;
      } else {
        outL.push(a);
        outR.push(b);
        i++;
        j++;
        gapRun = 0;
      }
      continue;
    }

    if (kLeft > 0) {
      if (gapRun < maxGapRun) {
        outL.push(a);
        outR.push("");
        i++;
        gapRun += 1;
      } else {
        outL.push(a);
        outR.push(b);
        i++;
        j++;
        gapRun = 0;
      }
      continue;
    }

    const la = parseLabel(a);
    const lb = parseLabel(b);
    if (la && lb) {
      const cmp = compareLabel(la, lb);
      if (cmp < 0) {
        if (gapRun < maxGapRun) {
          outL.push(a);
          outR.push("");
          i++;
          gapRun += 1;
        } else {
          outL.push(a);
          outR.push(b);
          i++;
          j++;
          gapRun = 0;
        }
        continue;
      }
      if (cmp > 0) {
        if (gapRun < maxGapRun) {
          outL.push("");
          outR.push(b);
          j++;
          gapRun += 1;
        } else {
          outL.push(a);
          outR.push(b);
          i++;
          j++;
          gapRun = 0;
        }
        continue;
      }
    }

    if (!a && b) {
      if (gapRun < maxGapRun) {
        outL.push("");
        outR.push(b);
        j++;
        gapRun += 1;
      } else {
        outL.push(a);
        outR.push(b);
        i++;
        j++;
        gapRun = 0;
      }
      continue;
    }

    const aScore = anchorScore(a);
    const bScore = anchorScore(b);
    const sim = diceCoefficient(key(a), key(b));

    if (aScore > bScore && sim < 0.7) {
      if (gapRun < maxGapRun) {
        outL.push(a);
        outR.push("");
        i++;
        gapRun += 1;
      } else {
        outL.push(a);
        outR.push(b);
        i++;
        j++;
        gapRun = 0;
      }
      continue;
    }
    if (bScore > aScore && sim < 0.7) {
      if (gapRun < maxGapRun) {
        outL.push("");
        outR.push(b);
        j++;
        gapRun += 1;
      } else {
        outL.push(a);
        outR.push(b);
        i++;
        j++;
        gapRun = 0;
      }
      continue;
    }

    if (sim < 0.45) {
      if (gapRun < maxGapRun) {
        outL.push(a);
        outR.push("");
        i++;
        gapRun += 1;
      } else {
        outL.push(a);
        outR.push(b);
        i++;
        j++;
        gapRun = 0;
      }
      continue;
    }

    outL.push(a);
    outR.push(b);
    i++;
    j++;
    gapRun = 0;
  }

  return { left: outL, right: outR };
}
