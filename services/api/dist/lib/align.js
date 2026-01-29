"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.alignBlocks = alignBlocks;
const diff_1 = require("diff");
const text_1 = require("./text");
const hash_1 = require("./hash");
function alignBlocks(left, right, options) {
    const ignoreSectionNumber = options?.ignoreSectionNumber !== false;
    const looksLikeTocishLine = (t) => {
        const s = (t ?? "").trim();
        if (!s)
            return false;
        if (/(?:(?:\.\s*){3,}|\.{3,}|(?:…\s*){2,}|…{2,}|(?:·\s*){3,}|·{3,}|-{3,}|_{3,})\s*\d+\s*$/.test(s))
            return true;
        if (/\s{3,}\d+\s*$/.test(s))
            return true;
        return false;
    };
    const alignKey = (b) => {
        if (!ignoreSectionNumber)
            return b.stableKey;
        const t = b.text ?? "";
        if (!t)
            return b.stableKey;
        const normalized = t.toLowerCase().replace(/\s+/g, " ").trim();
        const stripped = (0, text_1.stripSectionNoise)(t).toLowerCase().replace(/\s+/g, " ").trim();
        if (!stripped)
            return b.stableKey;
        if (stripped === normalized)
            return b.stableKey;
        const tocish = t.includes("\n") ? t.split("\n").some((x) => looksLikeTocishLine(x)) : looksLikeTocishLine(t);
        if (stripped.length < 10 && !tocish)
            return b.stableKey;
        return `k:${b.kind}:${tocish ? "toc:" : ""}${(0, hash_1.sha1)(stripped)}`;
    };
    const leftKeys = left.map((b) => alignKey(b));
    const rightKeys = right.map((b) => alignKey(b));
    const parts = (0, diff_1.diffArrays)(leftKeys, rightKeys);
    let li = 0;
    let ri = 0;
    const rows = [];
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
function coalesceModified(rows, left, right, options) {
    const leftMap = new Map(left.map((b) => [b.blockId, b]));
    const rightMap = new Map(right.map((b) => [b.blockId, b]));
    const out = [];
    for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        if (r.kind === "inserted") {
            const insRun = [];
            let j = i;
            while (j < rows.length && rows[j].kind === "inserted") {
                insRun.push(rows[j]);
                j++;
            }
            const delRun = [];
            let k = j;
            while (k < rows.length && rows[k].kind === "deleted") {
                delRun.push(rows[k]);
                k++;
            }
            if (delRun.length > 0) {
                out.push(...coalesceRunInOrder(delRun, insRun, leftMap, rightMap, options));
                i = k - 1;
                continue;
            }
        }
        if (r.kind !== "deleted") {
            out.push(r);
            continue;
        }
        const delRun = [];
        let j = i;
        while (j < rows.length && rows[j].kind === "deleted") {
            delRun.push(rows[j]);
            j++;
        }
        const insRun = [];
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
    const normalized = out.map((r) => ({ ...r, kind: normalizeRowKind(r.kind) }));
    if (!options.ignoreSectionNumber)
        return normalized;
    const canonicalAfterStrip = (b) => {
        return (0, text_1.stripSectionNoise)(b.text)
            .toLowerCase()
            .replace(/[：∶︰﹕]/g, ":")
            .replace(/\s+/g, "")
            .trim();
    };
    return normalized.map((r) => {
        if (r.kind !== "matched")
            return r;
        if (!r.leftBlockId || !r.rightBlockId)
            return r;
        const lb = leftMap.get(r.leftBlockId);
        const rb = rightMap.get(r.rightBlockId);
        if (!lb || !rb)
            return r;
        const beforeLabel = (0, text_1.getLeadingSectionLabel)(lb.text);
        const afterLabel = (0, text_1.getLeadingSectionLabel)(rb.text);
        if (!beforeLabel || !afterLabel || beforeLabel === afterLabel)
            return r;
        if (canonicalAfterStrip(lb) !== canonicalAfterStrip(rb))
            return r;
        return {
            ...r,
            kind: "modified",
            meta: { sectionNumberChanged: true, beforeSectionLabel: beforeLabel, afterSectionLabel: afterLabel }
        };
    });
}
function normalizeRowKind(kind) {
    if (kind === "matched" || kind === "modified" || kind === "inserted" || kind === "deleted")
        return kind;
    return "matched";
}
function coalesceRunInOrder(delRun, insRun, leftMap, rightMap, options) {
    const out = [];
    const window = 10;
    let i = 0;
    let j = 0;
    const strip = (t) => {
        return options.ignoreSectionNumber ? (0, text_1.stripSectionNoise)(t) : t;
    };
    const canonicalAfterStrip = (b) => {
        const s = strip(b?.text ?? "");
        if (!s)
            return "";
        return s
            .toLowerCase()
            .replace(/[：∶︰﹕]/g, ":")
            .replace(/\s+/g, "")
            .trim();
    };
    const getTextBeforeColon = (text) => {
        const s = strip(text).trim();
        const colonIndex = s.search(/[:：∶︰﹕]/);
        return colonIndex !== -1 ? s.slice(0, colonIndex).trim() : s;
    };
    const isDatePlaceholderMatch = (textA, textB) => {
        const sA = strip(textA).trim();
        const sB = strip(textB).trim();
        const placeholderPatterns = [
            /年\s*月\s*日/,
            /YYYY[/-]?MM[/-]?DD/,
            /\{日期\}/,
            /\[日期\]/
        ];
        const datePatterns = [
            /\d{4}\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*日/,
            /\d{4}[-/]\d{1,2}[-/]\d{1,2}/
        ];
        const hasPlaceholder = placeholderPatterns.some(pattern => 
            pattern.test(sA) || pattern.test(sB)
        );
        const hasDate = datePatterns.some(pattern => 
            pattern.test(sA) || pattern.test(sB)
        );
        if (!hasPlaceholder || !hasDate) return false;
        const cleanA = sA.replace(/年\s*月\s*日|[{\[]日期[}\]]|YYYY[/-]?MM[/-]?DD|\d{4}\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*日|\d{4}[-/\s]*\d{1,2}[-/\s]*\d{1,2}/g, "");
        const cleanB = sB.replace(/年\s*月\s*日|[{\[]日期[}\]]|YYYY[/-]?MM[/-]?DD|\d{4}\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*日|\d{4}[-/\s]*\d{1,2}[-/\s]*\d{1,2}/g, "");
        const similarity = (0, text_1.diceCoefficient)(cleanA, cleanB);
        return similarity >= 0.8;
    };
    const score = (a, b) => {
        const ca = canonicalAfterStrip(a);
        const cb = canonicalAfterStrip(b);
        if (ca && cb && ca === cb)
            return 1;
        const ka = strip(a?.text ?? "").trim();
        const kb = strip(b?.text ?? "").trim();
        if (!ka || !kb)
            return 0;
        if (isDatePlaceholderMatch(a?.text ?? "", b?.text ?? "")) {
            return 0.95;
        }
        const beforeColonA = getTextBeforeColon(a?.text ?? "");
        const beforeColonB = getTextBeforeColon(b?.text ?? "");
        if (beforeColonA && beforeColonB && beforeColonA === beforeColonB) {
            return 0.95;
        }
        return (0, text_1.diceCoefficient)(ka, kb);
    };
    const isGoodMatch = (a, b) => {
        const ca = canonicalAfterStrip(a);
        const cb = canonicalAfterStrip(b);
        if (ca && cb && ca === cb)
            return true;
        const sa = strip(a?.text ?? "").trim();
        const sb = strip(b?.text ?? "").trim();
        if (!sa || !sb)
            return false;
        if (isDatePlaceholderMatch(a?.text ?? "", b?.text ?? "")) {
            return true;
        }
        const beforeColonA = getTextBeforeColon(a?.text ?? "");
        const beforeColonB = getTextBeforeColon(b?.text ?? "");
        if (beforeColonA && beforeColonB && beforeColonA === beforeColonB) {
            return true;
        }
        const aLen = sa.length;
        const bLen = sb.length;
        const maxLen = Math.max(aLen, bLen);
        if (options.ignoreSectionNumber) {
            const la = a ? (0, text_1.getLeadingSectionLabel)(a.text) : null;
            const lb = b ? (0, text_1.getLeadingSectionLabel)(b.text) : null;
            if (la && lb && la === lb) {
                const s = (0, text_1.diceCoefficient)(sa, sb);
                const threshold = maxLen <= 40 ? 0.45 : maxLen <= 120 ? 0.33 : 0.25;
                if (s >= threshold)
                    return true;
            }
        }
        if (maxLen > 0 && maxLen <= 40) {
            const ka = sa.toLowerCase().replace(/\s+/g, " ").trim();
            const kb = sb.toLowerCase().replace(/\s+/g, " ").trim();
            if (ka !== kb) {
                const ok = Math.max(ka.length, kb.length) >= 10 &&
                    (ka.includes(kb) || kb.includes(ka)) &&
                    (0, text_1.diceCoefficient)(sa, sb) >= 0.92;
                if (!ok)
                    return false;
            }
        }
        const s = (0, text_1.diceCoefficient)(sa, sb);
        let threshold = maxLen <= 40 ? 0.92 : maxLen <= 80 ? 0.6 : 0.35;
        const la = a ? (0, text_1.getLeadingSectionLabel)(a.text) : null;
        const lb = b ? (0, text_1.getLeadingSectionLabel)(b.text) : null;
        if (options.ignoreSectionNumber && la && lb && la !== lb)
            threshold = Math.max(threshold, 0.78);
        return s >= threshold;
    };
    const pushPair = (d, ins) => {
        const lb = d.leftBlockId ? leftMap.get(d.leftBlockId) : undefined;
        const rb = ins.rightBlockId ? rightMap.get(ins.rightBlockId) : undefined;
        const beforeLabel = lb ? (0, text_1.getLeadingSectionLabel)(lb.text) : null;
        const afterLabel = rb ? (0, text_1.getLeadingSectionLabel)(rb.text) : null;
        const sectionNumberChanged = beforeLabel !== afterLabel;
        const beforeColonA = getTextBeforeColon(lb?.text ?? "");
        const beforeColonB = getTextBeforeColon(rb?.text ?? "");
        const contentSameAfterStripping = options.ignoreSectionNumber && (0, text_1.stripSectionNoise)(lb?.text ?? "") === (0, text_1.stripSectionNoise)(rb?.text ?? "");
        const isDateMatch = isDatePlaceholderMatch(lb?.text ?? "", rb?.text ?? "");
        let kind = contentSameAfterStripping ? "matched" : "modified";
        if ((beforeColonA && beforeColonB && beforeColonA === beforeColonB) || isDateMatch) {
            kind = "modified";
        }
        out.push({
            rowId: d.rowId,
            kind: kind,
            leftBlockId: d.leftBlockId,
            rightBlockId: ins.rightBlockId,
            meta: options.ignoreSectionNumber && sectionNumberChanged
                ? { sectionNumberChanged: true, beforeSectionLabel: beforeLabel, afterSectionLabel: afterLabel }
                : undefined
        });
    };
    const bestInRight = (lb, startJ) => {
        let bestK = -1;
        let bestScore = 0;
        for (let k = 0; k <= window && startJ + k < insRun.length; k++) {
            const rb2 = insRun[startJ + k].rightBlockId ? rightMap.get(insRun[startJ + k].rightBlockId) : undefined;
            if (!isGoodMatch(lb, rb2))
                continue;
            const s = score(lb, rb2);
            if (bestK < 0 || s > bestScore) {
                bestK = k;
                bestScore = s;
            }
        }
        return { k: bestK, score: bestScore };
    };
    const bestInLeft = (rb, startI) => {
        let bestK = -1;
        let bestScore = 0;
        for (let k = 0; k <= window && startI + k < delRun.length; k++) {
            const lb2 = delRun[startI + k].leftBlockId ? leftMap.get(delRun[startI + k].leftBlockId) : undefined;
            if (!isGoodMatch(lb2, rb))
                continue;
            const s = score(lb2, rb);
            if (bestK < 0 || s > bestScore) {
                bestK = k;
                bestScore = s;
            }
        }
        return { k: bestK, score: bestScore };
    };
    while (i < delRun.length || j < insRun.length) {
        if (i >= delRun.length) {
            out.push(insRun[j++]);
            continue;
        }
        if (j >= insRun.length) {
            out.push(delRun[i++]);
            continue;
        }
        const d = delRun[i];
        const ins = insRun[j];
        const lb = d.leftBlockId ? leftMap.get(d.leftBlockId) : undefined;
        const rb = ins.rightBlockId ? rightMap.get(ins.rightBlockId) : undefined;
        const strippedA = strip(lb?.text ?? "").trim();
        const strippedB = strip(rb?.text ?? "").trim();
        const currentScore = score(lb, rb);
        const bestRight = bestInRight(lb, j);
        if (bestRight.k > 0 && bestRight.score >= currentScore + 0.08) {
            for (let t = 0; t < bestRight.k; t++)
                out.push(insRun[j + t]);
            j += bestRight.k;
            continue;
        }
        if (isGoodMatch(lb, rb)) {
            pushPair(d, ins);
            i++;
            j++;
            continue;
        }
        if (bestRight.k > 0) {
            for (let t = 0; t < bestRight.k; t++)
                out.push(insRun[j + t]);
            j += bestRight.k;
            continue;
        }
        const bestLeft = bestInLeft(rb, i);
        if (bestLeft.k > 0) {
            for (let t = 0; t < bestLeft.k; t++)
                out.push(delRun[i + t]);
            i += bestLeft.k;
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
        }
        else {
            out.push(ins);
            j++;
        }
    }
    return out;
}
