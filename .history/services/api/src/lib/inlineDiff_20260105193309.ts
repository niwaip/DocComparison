import DiffMatchPatch from "diff-match-patch";
import { escapeHtml, getLeadingSectionLabel, stripSectionNoise } from "./text";

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
  let before = beforeText;
  let after = afterText;
  if (alignEnabled) {
    const aLines = before.split("\n");
    const bLines = after.split("\n");
    if (aLines.length >= 6 || bLines.length >= 6) {
      const aligned = alignLinesWithLookahead(aLines, bLines, window, options?.ignoreSectionNumber !== false);
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

  const leftHtml = diffs
    .map(([op, data]: [number, string]) => {
      const escaped = escapeHtml(data).replace(/\n/g, "<br/>");
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
      const escaped = escapeHtml(data).replace(/\n/g, "<br/>");
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

  let i = 0;
  let j = 0;
  const outL: string[] = [];
  const outR: string[] = [];

  const parseLabel = (line: string): number[] | null => {
    const label = getLeadingSectionLabel(line);
    if (!label) return null;
    if (!/^\d+(?:\.\d+)*$/.test(label)) return null;
    const segs = label.split(".").map((x) => Number(x)).filter((n) => Number.isFinite(n));
    return segs.length ? segs : null;
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
      continue;
    }
    if (j >= rightLines.length) {
      outL.push(leftLines[i++] ?? "");
      outR.push("");
      continue;
    }

    const a = leftLines[i] ?? "";
    const b = rightLines[j] ?? "";
    if (isMatch(a, b)) {
      outL.push(a);
      outR.push(b);
      i++;
      j++;
      continue;
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
      outL.push("");
      outR.push(b);
      j++;
      continue;
    }

    if (kLeft > 0) {
      outL.push(a);
      outR.push("");
      i++;
      continue;
    }

    const la = parseLabel(a);
    const lb = parseLabel(b);
    if (la && lb) {
      const cmp = compareLabel(la, lb);
      if (cmp < 0) {
        outL.push(a);
        outR.push("");
        i++;
        continue;
      }
      if (cmp > 0) {
        outL.push("");
        outR.push(b);
        j++;
        continue;
      }
    }

    if (!a && b) {
      outL.push("");
      outR.push(b);
      j++;
      continue;
    }

    outL.push(a);
    outR.push(b);
    i++;
    j++;
  }

  return { left: outL, right: outR };
}
