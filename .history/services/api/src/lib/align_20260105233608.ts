import { diffArrays } from "diff";
import { diceCoefficient, getLeadingSectionLabel, stripSectionNoise } from "./text";
import { sha1 } from "./hash";
import { AlignmentRow, Block, RowKind } from "./types";

export function alignBlocks(left: Block[], right: Block[], options?: { ignoreSectionNumber?: boolean }): AlignmentRow[] {
  const ignoreSectionNumber = options?.ignoreSectionNumber !== false;

  const looksLikeTocishLine = (t: string): boolean => {
    const s = (t ?? "").trim();
    if (!s) return false;
    if (/(?:(?:\.\s*){3,}|\.{3,}|(?:…\s*){2,}|…{2,}|(?:·\s*){3,}|·{3,}|-{3,}|_{3,})\s*\d+\s*$/.test(s)) return true;
    if (/\s{3,}\d+\s*$/.test(s)) return true;
    return false;
  };

  const alignKey = (b: Block): string => {
    if (!ignoreSectionNumber) return b.stableKey;
    const t = b.text ?? "";
    if (!t) return b.stableKey;
    const normalized = t.toLowerCase().replace(/\s+/g, " ").trim();
    const stripped = stripSectionNoise(t).toLowerCase().replace(/\s+/g, " ").trim();
    if (!stripped) return b.stableKey;
    if (stripped === normalized) return b.stableKey;
    const tocish = t.includes("\n") ? t.split("\n").some((x) => looksLikeTocishLine(x)) : looksLikeTocishLine(t);
    if (stripped.length < 10 && !tocish) return b.stableKey;
    return `k:${b.kind}:${tocish ? "toc:" : ""}${sha1(stripped)}`;
  };

  const leftKeys = left.map((b) => alignKey(b));
  const rightKeys = right.map((b) => alignKey(b));
  const parts = diffArrays(leftKeys, rightKeys);

  let li = 0;
  let ri = 0;
  const rows: AlignmentRow[] = [];
  let nextRow = 1;

  for (const part of parts) {
    if (part.added) {
      for (let k = 0; k < part.value.length; k++) {
        rows.push({
          rowId: `r_${String(nextRow++).padStart(4, "0")}`,
          kind: "inserted",
          leftBlockId: null,
          rightBlockId: right[ri++]?.blockId ?? null
        });
      }
      continue;
    }
    if (part.removed) {
      for (let k = 0; k < part.value.length; k++) {
        rows.push({
          rowId: `r_${String(nextRow++).padStart(4, "0")}`,
          kind: "deleted",
          leftBlockId: left[li++]?.blockId ?? null,
          rightBlockId: null
        });
      }
      continue;
    }
    for (let k = 0; k < part.value.length; k++) {
      rows.push({
        rowId: `r_${String(nextRow++).padStart(4, "0")}`,
        kind: "matched",
        leftBlockId: left[li++]?.blockId ?? null,
        rightBlockId: right[ri++]?.blockId ?? null
      });
    }
  }

  return coalesceModified(rows, left, right, { ignoreSectionNumber });
}

function coalesceModified(rows: AlignmentRow[], left: Block[], right: Block[], options: { ignoreSectionNumber: boolean }): AlignmentRow[] {
  const leftMap = new Map(left.map((b) => [b.blockId, b]));
  const rightMap = new Map(right.map((b) => [b.blockId, b]));

  const out: AlignmentRow[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (r.kind !== "deleted") {
      out.push(r);
      continue;
    }

    const delRun: AlignmentRow[] = [];
    let j = i;
    while (j < rows.length && rows[j].kind === "deleted") {
      delRun.push(rows[j]);
      j++;
    }

    const insRun: AlignmentRow[] = [];
    let k = j;
    while (k < rows.length && rows[k].kind === "inserted") {
      insRun.push(rows[k]);
      k++;
    }

    if (insRun.length === 0) {
      out.push(...delRun);
      i = j - 1;
      continue;
    }

    out.push(...coalesceRunInOrder(delRun, insRun, leftMap, rightMap, options));

    i = k - 1;
  }

  return out.map((r) => ({ ...r, kind: normalizeRowKind(r.kind) }));
}

function normalizeRowKind(kind: RowKind): RowKind {
  if (kind === "matched" || kind === "modified" || kind === "inserted" || kind === "deleted") return kind;
  return "matched";
}

function coalesceRunInOrder(
  delRun: AlignmentRow[],
  insRun: AlignmentRow[],
  leftMap: Map<string, Block>,
  rightMap: Map<string, Block>,
  options: { ignoreSectionNumber: boolean }
): AlignmentRow[] {
  const out: AlignmentRow[] = [];
  const window = 10;
  let i = 0;
  let j = 0;

  const strip = (t: string): string => {
    return options.ignoreSectionNumber ? stripSectionNoise(t) : t;
  };

  const score = (a: Block | undefined, b: Block | undefined): number => {
    const ka = strip(a?.text ?? "").trim();
    const kb = strip(b?.text ?? "").trim();
    if (!ka || !kb) return 0;
    return diceCoefficient(ka, kb);
  };

  const isGoodMatch = (a: Block | undefined, b: Block | undefined): boolean => {
    const sa = strip(a?.text ?? "").trim();
    const sb = strip(b?.text ?? "").trim();
    if (!sa || !sb) return false;

    const aLen = sa.length;
    const bLen = sb.length;
    const maxLen = Math.max(aLen, bLen);
    if (maxLen > 0 && maxLen <= 40) {
      const ka = sa.toLowerCase().replace(/\s+/g, " ").trim();
      const kb = sb.toLowerCase().replace(/\s+/g, " ").trim();
      if (ka !== kb) {
        const ok =
          Math.max(ka.length, kb.length) >= 10 &&
          (ka.includes(kb) || kb.includes(ka)) &&
          diceCoefficient(sa, sb) >= 0.92;
        if (!ok) return false;
      }
    }

    const s = diceCoefficient(sa, sb);
    const threshold = maxLen <= 40 ? 0.92 : maxLen <= 80 ? 0.6 : 0.35;
    return s >= threshold;
  };

  const pushPair = (d: AlignmentRow, ins: AlignmentRow) => {
    const lb = d.leftBlockId ? leftMap.get(d.leftBlockId) : undefined;
    const rb = ins.rightBlockId ? rightMap.get(ins.rightBlockId) : undefined;
    const beforeLabel = lb ? getLeadingSectionLabel(lb.text) : null;
    const afterLabel = rb ? getLeadingSectionLabel(rb.text) : null;
    const sectionNumberChanged = beforeLabel !== afterLabel;
    const contentSameAfterStripping =
      options.ignoreSectionNumber && stripSectionNoise(lb?.text ?? "") === stripSectionNoise(rb?.text ?? "");
    out.push({
      rowId: d.rowId,
      kind: contentSameAfterStripping ? "matched" : "modified",
      leftBlockId: d.leftBlockId,
      rightBlockId: ins.rightBlockId,
      meta: options.ignoreSectionNumber && sectionNumberChanged
        ? { sectionNumberChanged: true, beforeSectionLabel: beforeLabel, afterSectionLabel: afterLabel }
        : undefined
    });
  };

  const bestInRight = (lb: Block | undefined, startJ: number): number => {
    let bestK = -1;
    let bestScore = 0;
    for (let k = 1; k <= window && startJ + k < insRun.length; k++) {
      const rb2 = insRun[startJ + k]!.rightBlockId ? rightMap.get(insRun[startJ + k]!.rightBlockId as string) : undefined;
      if (!isGoodMatch(lb, rb2)) continue;
      const s = score(lb, rb2);
      if (bestK < 0 || s > bestScore) {
        bestK = k;
        bestScore = s;
      }
    }
    return bestK;
  };

  const bestInLeft = (rb: Block | undefined, startI: number): number => {
    let bestK = -1;
    let bestScore = 0;
    for (let k = 1; k <= window && startI + k < delRun.length; k++) {
      const lb2 = delRun[startI + k]!.leftBlockId ? leftMap.get(delRun[startI + k]!.leftBlockId as string) : undefined;
      if (!isGoodMatch(lb2, rb)) continue;
      const s = score(lb2, rb);
      if (bestK < 0 || s > bestScore) {
        bestK = k;
        bestScore = s;
      }
    }
    return bestK;
  };

  while (i < delRun.length || j < insRun.length) {
    if (i >= delRun.length) {
      out.push(insRun[j++]!);
      continue;
    }
    if (j >= insRun.length) {
      out.push(delRun[i++]!);
      continue;
    }

    const d = delRun[i]!;
    const ins = insRun[j]!;
    const lb = d.leftBlockId ? leftMap.get(d.leftBlockId) : undefined;
    const rb = ins.rightBlockId ? rightMap.get(ins.rightBlockId) : undefined;

    const strippedA = strip(lb?.text ?? "").trim();
    const strippedB = strip(rb?.text ?? "").trim();

    if (isGoodMatch(lb, rb)) {
      pushPair(d, ins);
      i++;
      j++;
      continue;
    }

    const kRight = bestInRight(lb, j);
    if (kRight > 0) {
      for (let t = 0; t < kRight; t++) out.push(insRun[j + t]!);
      j += kRight;
      continue;
    }

    const kLeft = bestInLeft(rb, i);
    if (kLeft > 0) {
      for (let t = 0; t < kLeft; t++) out.push(delRun[i + t]!);
      i += kLeft;
      continue;
    }

    if (!strippedA) {
      out.push(d);
      i++;
      continue;
    }
    if (!strippedB) {
      out.push(ins);
      j++;
      continue;
    }

    if (delRun.length - i > insRun.length - j) {
      out.push(d);
      i++;
    } else {
      out.push(ins);
      j++;
    }
  }

  return out;
}
