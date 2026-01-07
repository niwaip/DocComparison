import { diffArrays } from "diff";
import { diceCoefficient, getLeadingSectionLabel, stripSectionNoise } from "./text";
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
    if (t.includes("\n")) return b.stableKey;
    if (t.length > 240) return b.stableKey;
    const stripped = stripSectionNoise(t).toLowerCase().replace(/\s+/g, " ").trim();
    const tocish = looksLikeTocishLine(t);
    if (stripped.length < 10 && !tocish) return b.stableKey;
    if (stripped.length > 140) return b.stableKey;
    return `k:${b.kind}:${tocish ? "toc:" : ""}${stripped}`;
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

    if (options.ignoreSectionNumber && shouldAlignRunByLookahead(delRun, insRun, leftMap, rightMap)) {
      out.push(...coalesceRunByLookahead(delRun, insRun, leftMap, rightMap));
      i = k - 1;
      continue;
    }

    const usedIns = new Set<number>();
    for (const d of delRun) {
      const lb = d.leftBlockId ? leftMap.get(d.leftBlockId) : undefined;
      if (!lb) {
        out.push(d);
        continue;
      }
      const aStripped = options.ignoreSectionNumber ? stripSectionNoise(lb.text) : lb.text;
      const aLen = aStripped.trim().length;
      let bestIdx = -1;
      let bestScore = 0;
      for (let t = 0; t < insRun.length; t++) {
        if (usedIns.has(t)) continue;
        const rbId = insRun[t].rightBlockId;
        const rb = rbId ? rightMap.get(rbId) : undefined;
        if (!rb) continue;
        const bStripped = options.ignoreSectionNumber ? stripSectionNoise(rb.text) : rb.text;
        const bLen = bStripped.trim().length;
        const maxLen = Math.max(aLen, bLen);
        if (maxLen > 0 && maxLen <= 40) {
          const ka = aStripped.toLowerCase().replace(/\s+/g, " ").trim();
          const kb = bStripped.toLowerCase().replace(/\s+/g, " ").trim();
          if (ka !== kb) {
            const ok =
              Math.max(ka.length, kb.length) >= 10 &&
              (ka.includes(kb) || kb.includes(ka)) &&
              diceCoefficient(aStripped, bStripped) >= 0.92;
            if (!ok) continue;
          }
        }
        const score = diceCoefficient(aStripped, bStripped);
        if (score > bestScore) {
          bestScore = score;
          bestIdx = t;
        }
      }

      const threshold = aLen <= 40 ? 0.92 : aLen <= 80 ? 0.6 : 0.35;
      if (bestIdx >= 0 && bestScore >= threshold) {
        usedIns.add(bestIdx);
        const rb = insRun[bestIdx].rightBlockId ? rightMap.get(insRun[bestIdx].rightBlockId as string) : undefined;
        const beforeLabel = getLeadingSectionLabel(lb.text);
        const afterLabel = rb ? getLeadingSectionLabel(rb.text) : null;
        const sectionNumberChanged = beforeLabel !== afterLabel;
        const contentSameAfterStripping =
          options.ignoreSectionNumber && stripSectionNoise(lb.text) === stripSectionNoise(rb?.text ?? "");
        out.push({
          rowId: d.rowId,
          kind: contentSameAfterStripping ? "matched" : "modified",
          leftBlockId: d.leftBlockId,
          rightBlockId: insRun[bestIdx].rightBlockId,
          meta: options.ignoreSectionNumber && sectionNumberChanged
            ? { sectionNumberChanged: true, beforeSectionLabel: beforeLabel, afterSectionLabel: afterLabel }
            : undefined
        });
      } else {
        out.push(d);
      }
    }

    for (let t = 0; t < insRun.length; t++) {
      if (!usedIns.has(t)) out.push(insRun[t]);
    }

    i = k - 1;
  }

  return out.map((r) => ({ ...r, kind: normalizeRowKind(r.kind) }));
}

function normalizeRowKind(kind: RowKind): RowKind {
  if (kind === "matched" || kind === "modified" || kind === "inserted" || kind === "deleted") return kind;
  return "matched";
}

function shouldAlignRunByLookahead(
  delRun: AlignmentRow[],
  insRun: AlignmentRow[],
  leftMap: Map<string, Block>,
  rightMap: Map<string, Block>
): boolean {
  const isLineLike = (b: Block | undefined): boolean => {
    if (!b) return false;
    const t = b.text ?? "";
    if (!t) return false;
    if (t.includes("\n")) return false;
    if (t.length > 220) return false;
    return true;
  };

  const delOk = delRun.every((r) => isLineLike(r.leftBlockId ? leftMap.get(r.leftBlockId) : undefined));
  const insOk = insRun.every((r) => isLineLike(r.rightBlockId ? rightMap.get(r.rightBlockId) : undefined));
  return delOk && insOk;
}

function coalesceRunByLookahead(
  delRun: AlignmentRow[],
  insRun: AlignmentRow[],
  leftMap: Map<string, Block>,
  rightMap: Map<string, Block>
): AlignmentRow[] {
  const key = (b: Block | undefined): string => {
    if (!b) return "";
    return stripSectionNoise(b.text).toLowerCase().replace(/\s+/g, " ").trim();
  };
  const label = (b: Block | undefined): string | null => {
    if (!b) return null;
    return getLeadingSectionLabel(b.text);
  };
  const isMatch = (a: Block | undefined, b: Block | undefined): boolean => {
    const ka = key(a);
    const kb = key(b);
    if (!ka || !kb) return false;
    const la = label(a);
    const lb = label(b);
    if (la && lb && la === lb) return true;
    if (ka === kb) return true;
    const maxLen = Math.max(ka.length, kb.length);
    if (maxLen >= 10 && maxLen <= 80 && (ka.includes(kb) || kb.includes(ka))) {
      return diceCoefficient(ka, kb) >= 0.9;
    }
    if (maxLen > 0 && maxLen <= 60) return diceCoefficient(ka, kb) >= 0.92;
    return false;
  };

  const out: AlignmentRow[] = [];
  const window = 10;
  let i = 0;
  let j = 0;

  const pushPair = (d: AlignmentRow, ins: AlignmentRow) => {
    const lb = d.leftBlockId ? leftMap.get(d.leftBlockId) : undefined;
    const rb = ins.rightBlockId ? rightMap.get(ins.rightBlockId) : undefined;
    const beforeLabel = lb ? getLeadingSectionLabel(lb.text) : null;
    const afterLabel = rb ? getLeadingSectionLabel(rb.text) : null;
    const sectionNumberChanged = beforeLabel !== afterLabel;
    const contentSameAfterStripping = stripSectionNoise(lb?.text ?? "") === stripSectionNoise(rb?.text ?? "");
    const score = diceCoefficient(stripSectionNoise(lb?.text ?? ""), stripSectionNoise(rb?.text ?? ""));
    out.push({
      rowId: d.rowId,
      kind: contentSameAfterStripping ? "matched" : score >= 0.78 ? "modified" : "modified",
      leftBlockId: d.leftBlockId,
      rightBlockId: ins.rightBlockId,
      meta: contentSameAfterStripping && sectionNumberChanged
        ? { sectionNumberChanged: true, beforeSectionLabel: beforeLabel, afterSectionLabel: afterLabel }
        : undefined
    });
  };

  const bestExactInRight = (lb: Block | undefined, startJ: number): number => {
    for (let k = 1; k <= window && startJ + k < insRun.length; k++) {
      const rb2 = insRun[startJ + k]!.rightBlockId ? rightMap.get(insRun[startJ + k]!.rightBlockId as string) : undefined;
      if (isMatch(lb, rb2)) return k;
    }
    return -1;
  };

  const bestExactInLeft = (rb: Block | undefined, startI: number): number => {
    for (let k = 1; k <= window && startI + k < delRun.length; k++) {
      const lb2 = delRun[startI + k]!.leftBlockId ? leftMap.get(delRun[startI + k]!.leftBlockId as string) : undefined;
      if (isMatch(lb2, rb)) return k;
    }
    return -1;
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

    const strippedA = stripSectionNoise(lb?.text ?? "");
    const strippedB = stripSectionNoise(rb?.text ?? "");

    if (isMatch(lb, rb)) {
      pushPair(d, ins);
      i++;
      j++;
      continue;
    }

    const kRight = bestExactInRight(lb, j);
    if (kRight > 0) {
      for (let t = 0; t < kRight; t++) out.push(insRun[j + t]!);
      j += kRight;
      continue;
    }

    const kLeft = bestExactInLeft(rb, i);
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
