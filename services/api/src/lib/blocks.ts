import * as cheerio from "cheerio";
import { sha1 } from "./hash";
import { escapeHtml, normalizeText } from "./text";
import { Block, BlockKind } from "./types";

type BlockBuildCtx = {
  nextBlockIndex: number;
  currentHeadingText: string;
};

export function buildBlocksFromHtml(html: string, chunkLevel?: number): Block[] {
  const splitLevel = Number.isFinite(chunkLevel) ? Math.max(1, Math.min(6, Math.floor(Number(chunkLevel)))) : 2;
  const $ = cheerio.load(`<body>${html}</body>`);
  const body = $("body").first();

  const blocks: Block[] = [];
  const ctx: BlockBuildCtx = { nextBlockIndex: 1, currentHeadingText: "" };

  let nodes: Array<{ kind: BlockKind; headingLevel: number | null; structurePath: string; html: string; text: string }> = [];
  body.children().each((idx, el) => {
    const tag = (el as any).tagName?.toLowerCase?.() ?? "";
    if (!tag) return;
    if (isBlockTag(tag)) {
      nodes.push(nodeFromElement($, tag, `body.${tag}[${idx}]`, el));
      return;
    }
    $(el)
      .find("h1,h2,h3,h4,h5,h6,p,li,table")
      .each((innerIdx, innerEl) => {
        const itag = (innerEl as any).tagName?.toLowerCase?.() ?? "";
        if (!itag || !isBlockTag(itag)) return;
        nodes.push(nodeFromElement($, itag, `body.${tag}[${idx}].${itag}[${innerIdx}]`, innerEl));
      });
  });

  if (nodes.length === 0) {
    const clone = body.clone();
    clone.find("br").replaceWith("\n");
    const raw = normalizeText(clone.text());
    const paras = raw
      .split("\n\n")
      .map((x) => x.trim())
      .filter((x) => x.length > 0);
    nodes = paras.map((p, i) => {
      const lv = detectHeadingLevel("p", p);
      const tag = lv ? `h${lv}` : "p";
      const kind = tagToKind(tag);
      const escaped = escapeHtml(p).replace(/\n/g, "<br/>");
      const frag = `<${tag}>${escaped}</${tag}>`;
      return { kind, headingLevel: lv, structurePath: `body.text[${i}]`, html: frag, text: p };
    });
  }

  const boilerplateSignature = (text: string): string => {
    const norm = normalizeText(text);
    if (!norm) return "";
    const lines = norm
      .split("\n")
      .map((x) => x.trim())
      .filter((x) => x.length > 0);
    const firstLine = lines[0] ?? "";
    if (/^\d{1,4}[.。]?$/.test(firstLine) && lines.length >= 2) return normalizeText(lines.slice(1).join("\n"));
    const stripped = firstLine.replace(/^\d{1,4}[.。]\s*/g, "");
    if (stripped && stripped !== firstLine) return normalizeText([stripped, ...lines.slice(1)].join("\n"));
    return norm;
  };

  const rawNorms = nodes.map((n) => normalizeText(n.text));
  const signatures = nodes.map((n) => boilerplateSignature(n.text));
  const sigCounts = new Map<string, number>();
  for (const s of signatures) {
    if (!s) continue;
    sigCounts.set(s, (sigCounts.get(s) ?? 0) + 1);
  }

  nodes = nodes.filter((n, i) => {
    const raw = rawNorms[i] ?? "";
    if (raw && /^\d{1,4}[.。]?$/.test(raw)) {
      const prev = rawNorms[i - 1] ?? "";
      const next = rawNorms[i + 1] ?? "";
      const neigh = `${prev}\n${next}`;
      if (/[：:]$/.test(prev) || /[：:]$/.test(next)) return true;
      if (/(产品编号|描述|数量|价格|单价|金额|税率|税额|规格|型号|单位)/.test(neigh)) return true;
      return false;
    }
    const s = signatures[i];
    if (!s) return false;
    if (n.kind === "table") return true;
    const c = sigCounts.get(s) ?? 0;
    if (c < 3) return true;
    if (s.length > 140) return true;
    if (s.length <= 10 && /^[0-9]{1,8}(?:\.[0-9]+)?$/.test(s)) {
      const prev = rawNorms[i - 1] ?? "";
      const next = rawNorms[i + 1] ?? "";
      const neigh = `${prev}\n${next}`;
      if (/[：:]$/.test(prev) || /[：:]$/.test(next)) return true;
      if (/(产品编号|描述|数量|价格|单价|金额|税率|税额|规格|型号|单位)/.test(neigh)) return true;
      return false;
    }
    let ascii = 0;
    for (let k = 0; k < s.length; k++) {
      if (s.charCodeAt(k) < 128) ascii += 1;
    }
    if (ascii / s.length > 0.7) return false;
    if (s.length <= 30 && c >= 4 && ascii / s.length > 0.4) return false;
    return true;
  });

  const hasAnyHeading = nodes.some((n) => n.kind === "heading" || n.headingLevel !== null);

  if (!hasAnyHeading) {
    for (const n of nodes) {
      blocks.push(makeBlock(n.kind, n.structurePath, n.html, n.text, ctx, ""));
    }
    return blocks.filter((b) => normalizeText(b.text).length > 0 || b.kind === "table");
  }

  let secIndex = 1;
  let bufHtml: string[] = [];
  let bufText: string[] = [];
  let bufHasContent = false;

  const headingKey = (text: string): string => {
    const lines = normalizeText(text)
      .split("\n")
      .map((x) => x.trim())
      .filter((x) => x.length > 0);
    return lines[0] ?? "";
  };

  const flush = () => {
    const text = normalizeText(bufText.join("\n\n"));
    const htmlFrag = bufHtml.join("");
    if (normalizeText(text).length > 0) {
      blocks.push(makeBlock("paragraph", `sec[${secIndex++}]`, htmlFrag, text, ctx, ctx.currentHeadingText));
    }
    bufHtml = [];
    bufText = [];
    bufHasContent = false;
  };

  const isLikelySubItem = (text: string): boolean => {
    const s = normalizeText(text);
    if (!s) return false;
    const first = s.split("\n")[0]?.trim() ?? "";
    if (!first) return false;
    if (/^\d{1,3}\s*[.．。]\s*\S+/.test(first)) return true;
    if (/^\d{1,3}\s*[)）]\s*\S+/.test(first)) return true;
    if (/^[（(]\d{1,3}[)）]\s*\S+/.test(first)) return true;
    if (/^[一二三四五六七八九十]+\s*[、.．。]\s*\S+/.test(first)) return true;
    return false;
  };

  const shouldMergeHeadingWithFollowingItems = (i: number): boolean => {
    const n = nodes[i];
    if (!n) return false;
    if (!(n.kind === "heading" || n.headingLevel !== null)) return false;
    const t = normalizeText(n.text);
    if (!/[：:]$/.test(t.trim())) return false;
    for (let j = i + 1; j < Math.min(nodes.length, i + 6); j++) {
      const nn = nodes[j];
      if (!nn) break;
      if (nn.kind === "table") break;
      if (isLikelySubItem(nn.text)) return true;
      const nnIsSplitHeading = (nn.kind === "heading" || nn.headingLevel !== null) && (nn.headingLevel ?? 99) <= splitLevel;
      if (nnIsSplitHeading) break;
      if (normalizeText(nn.text).length > 0) break;
    }
    return false;
  };

  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (n.kind === "table") {
      if (bufHasContent) flush();
      blocks.push(makeBlock("table", `sec[${secIndex++}]`, n.html, n.text, ctx, ctx.currentHeadingText));
      continue;
    }
    const isHeading = n.kind === "heading" || n.headingLevel !== null;
    if (isHeading) {
      const shouldSplit = (n.headingLevel ?? 99) <= splitLevel;
      if (shouldSplit) {
        if (shouldMergeHeadingWithFollowingItems(i)) {
          if (bufHasContent) flush();
          ctx.currentHeadingText = headingKey(n.text);
          bufHasContent = true;
          bufHtml.push(n.html);
          bufText.push(n.text);
          continue;
        } else {
          if (bufHasContent) flush();
          ctx.currentHeadingText = headingKey(n.text);
          blocks.push(makeBlock("heading", `sec[${secIndex++}]`, n.html, n.text, ctx, ctx.currentHeadingText));
          continue;
        }
      }
      bufHasContent = true;
      bufHtml.push(n.html);
      bufText.push(n.text);
      continue;
    }
    bufHasContent = true;
    bufHtml.push(n.html);
    bufText.push(n.text);
  }
  if (bufHasContent) flush();

  return blocks.filter((b) => normalizeText(b.text).length > 0 || b.kind === "table");
}

function makeBlock(
  kind: BlockKind,
  structurePath: string,
  htmlFragment: string,
  text: string,
  ctx: BlockBuildCtx,
  contextHeadingText: string
): Block {
  const norm0 = normalizeText(text);
  const norm = normalizeInlineOrderedListText(norm0);
  const ctxHeading = normalizeText(contextHeadingText);
  const stableKey = ctxHeading && norm.length <= 160 ? sha1(`${kind}:${ctxHeading}:${norm}`) : sha1(`${kind}:${norm}`);
  const blockId = `b_${String(ctx.nextBlockIndex++).padStart(4, "0")}`;
  const meta: Block["meta"] = {};
  if (kind === "heading") {
    const m = /<h([1-6])\b/i.exec(htmlFragment);
    if (m) meta.headingLevel = Number(m[1]);
  }
  const htmlWithLists = normalizeInlineOrderedListHtml(htmlFragment, norm0);
  const htmlWithKeyValueTable = kind === "paragraph" ? normalizeKeyValueTableHtml(htmlWithLists, norm) : htmlWithLists;
  return {
    blockId,
    kind,
    structurePath,
    stableKey,
    text: norm,
    htmlFragment: normalizeBlockHtml(htmlWithKeyValueTable),
    meta
  };
}

function elementText($: cheerio.CheerioAPI, el: any, tag: string): string {
  if (tag === "table") {
    const rows: string[] = [];
    $(el)
      .find("tr")
      .each((_, tr) => {
        const cells: string[] = [];
        $(tr)
          .find("th,td")
          .each((__, cell) => {
            const node = $(cell).clone();
            node.find("br").replaceWith("\n");
            const t = normalizeText(node.text()).replace(/\n+/g, " ").trim();
            if (t) cells.push(t);
          });
        if (!cells.length) return;
        if (cells.length === 2) {
          const k = cells[0] ?? "";
          const v = cells[1] ?? "";
          const key = k.replace(/[：:]\s*$/g, "").trim();
          const val = v.trim();
          const looksLikeKey =
            key.length > 0 &&
            key.length <= 10 &&
            (/[：:]/.test(k) || /方$/.test(key) || /人$/.test(key) || /名称$/.test(key));
          if (looksLikeKey && val) {
            rows.push(`${key}：${val}`.trim());
            return;
          }
        }
        const row = cells.join(" ").trim();
        if (row) rows.push(row);
      });
    return normalizeText(rows.join("\n"));
  }

  const node = $(el).clone();
  node.find("br").replaceWith("\n");
  return node.text();
}

function parseInlineOrderedList(text: string): { prefix: string; items: string[] } | null {
  const t = normalizeText(text ?? "");
  if (!t) return null;
  if (t.includes("\n")) return null;

  const re = /(\d{1,2})\s*[.．、]\s*/g;
  const matches: Array<{ n: number; index: number; end: number }> = [];
  for (let m = re.exec(t); m; m = re.exec(t)) {
    const n = Number(m[1]);
    if (!Number.isFinite(n)) continue;
    matches.push({ n, index: m.index, end: m.index + m[0].length });
    if (matches.length >= 20) break;
  }
  if (matches.length < 2) return null;
  if (matches[0]!.n !== 1) return null;
  for (let i = 1; i < matches.length; i++) {
    if (matches[i]!.n !== matches[i - 1]!.n + 1) return null;
  }

  const prefix = t.slice(0, matches[0]!.index).trim();
  const items: string[] = [];
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i]!.end;
    const end = i + 1 < matches.length ? matches[i + 1]!.index : t.length;
    const item = t.slice(start, end).trim();
    if (!item) return null;
    items.push(item);
  }
  if (items.length < 2) return null;
  return { prefix, items };
}

function normalizeInlineOrderedListText(text: string): string {
  const parsed = parseInlineOrderedList(text);
  if (!parsed) return text;
  const lines = [parsed.prefix, ...parsed.items.map((x, i) => `${i + 1}. ${x}`)].filter(Boolean);
  return normalizeText(lines.join("\n"));
}

function normalizeInlineOrderedListHtml(fragment: string, text: string): string {
  const html = String(fragment ?? "");
  if (!html) return html;
  if (/<\s*(?:ol|ul|li)\b/i.test(html)) return html;
  const parsed = parseInlineOrderedList(text);
  if (!parsed) return html;
  const prefixHtml = parsed.prefix ? `<p>${escapeHtml(parsed.prefix)}</p>` : "";
  const ol = `<ol>${parsed.items.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ol>`;
  return `${prefixHtml}${ol}`;
}

function normalizeKeyValueTableHtml(fragment: string, text: string): string {
  const html = String(fragment ?? "");
  if (!html) return html;
  if (/<\s*table\b/i.test(html)) return html;

  const lines = normalizeText(text)
    .split("\n")
    .map((x) => x.trim())
    .filter((x) => x.length > 0);
  if (lines.length < 2 || lines.length > 20) return html;

  const hasKeywords = (() => {
    const t = normalizeText(text);
    const kw = ["产品编号", "描述", "数量", "价格", "单价", "金额"];
    let hit = 0;
    for (const k of kw) if (t.includes(k)) hit += 1;
    return hit >= 3;
  })();

  const toTable = (pairs: Array<{ k: string; v: string }>): string => {
    const rows = pairs.map((p) => `<tr><td>${escapeHtml(p.k)}</td><td>${escapeHtml(p.v)}</td></tr>`).join("");
    return `<table><tbody>${rows}</tbody></table>`;
  };

  const trySameLinePairs = (): string | null => {
    const pairs: Array<{ k: string; v: string }> = [];
    for (const line of lines) {
      const m = /^([^:：]{1,12})[:：]\s*(.+)$/.exec(line);
      if (!m) return null;
      const k = normalizeText(m[1] ?? "");
      const v = normalizeText(m[2] ?? "");
      if (!k || !v) return null;
      pairs.push({ k, v });
    }
    const unique = new Set(pairs.map((p) => p.k)).size;
    if (unique < 2) return null;
    return toTable(pairs);
  };

  const tryAlternatingPairs = (): string | null => {
    if (!hasKeywords) return null;
    if (lines.length < 4) return null;
    if (lines.length % 2 !== 0) return null;
    const pairs: Array<{ k: string; v: string }> = [];
    for (let i = 0; i < lines.length; i += 2) {
      const rawK = String(lines[i] ?? "");
      const rawV = String(lines[i + 1] ?? "");
      const k = normalizeText(rawK.replace(/[：:]\s*$/g, ""));
      const v = normalizeText(rawV);
      if (!k || !v) return null;
      if (k.length > 12) return null;
      pairs.push({ k, v });
    }
    if (pairs.length < 3) return null;
    const unique = new Set(pairs.map((p) => p.k)).size;
    if (unique < 2) return null;
    return toTable(pairs);
  };

  return trySameLinePairs() ?? tryAlternatingPairs() ?? html;
}

function nodeFromElement($: cheerio.CheerioAPI, tag: string, structurePath: string, el: any) {
  const kind = tagToKind(tag);
  const html = $(el).toString();
  const text = elementText($, el, tag);
  const headingLevel = detectHeadingLevel(tag, text);
  return { kind, headingLevel, structurePath, html, text };
}

function normalizeBlockHtml(fragment: string): string {
  if (!fragment) return fragment;
  let s = fragment;
  s = s.replace(/^\s*(?:<br\s*\/?>\s*)+/gi, "");
  s = s.replace(/(<p[^>]*>)\s*(?:<br\s*\/?>\s*)+/gi, "$1");
  s = s.replace(/(?:<br\s*\/?>\s*){2,}/gi, "<br/>");
  return s;
}

function detectHeadingLevel(tag: string, text: string): number | null {
  const t = normalizeText(text);
  if (!t) return null;
  if (/^h[1-6]$/.test(tag)) return Number(tag.slice(1));

  const lines = t
    .split("\n")
    .map((x) => x.trim())
    .filter((x) => x.length > 0);
  const firstLine = lines[0] ?? "";
  const secondLine = lines[1] ?? "";
  if (!firstLine) return null;

  const fromLine = (line: string): number | null => {
    if (!line) return null;
    let s = line.trim();
    s = s.replace(/^[【\[(（{｛「『《<]+/g, "");
    s = s.replace(/^[\s>＞•·\-–—]+/g, "").trimStart();
    const mHash = /^(#{1,6})\s+/.exec(s);
    if (mHash) return mHash[1].length;

    const mNum2 = /^(\d+(?:[.．]\d+)+)(?=(?:\s|[.。．:：、\-—\)])|$)/.exec(s);
    if (mNum2) {
      const segs = mNum2[1].split(/[.．]/g).filter(Boolean).length;
      return Math.min(6, Math.max(1, segs));
    }

    const mNum1 = /^(\d+)(?=(?:\s|[.。．:：、\-—\)])|$)/.exec(s);
    if (mNum1) {
      const rest = s.slice(mNum1[1].length).trimStart();
      if (rest.startsWith(")") || rest.startsWith("）")) return null;
      return 3;
    }

    const mCn = /^(第[一二三四五六七八九十百千0-9]+)([章节条部分篇])/.exec(s);
    if (mCn) {
      const unit = mCn[2];
      if (unit === "章") return 1;
      if (unit === "节") return 2;
      if (unit === "条") return 3;
      return 1;
    }

    const mCnParen = /^[（(]([一二三四五六七八九十]+)[)）]/.exec(s);
    if (mCnParen) return 3;

    const mCn2 = /^([一二三四五六七八九十]+)[、.．。]/.exec(s);
    if (mCn2) return 1;

    return null;
  };

  const mInlineSecond = /^(\d+)\s+(\d+(?:\.\d+)+)(?=(?:\s|[.。:：、\-—\)])|$)/.exec(firstLine);
  if (mInlineSecond) {
    const segs = mInlineSecond[2].split(".").filter(Boolean).length;
    return Math.min(6, Math.max(1, segs));
  }

  if (/^\d+(?:\.\d+)*$/.test(firstLine) && secondLine) {
    const lv2 = fromLine(secondLine);
    if (lv2 !== null) return lv2;
  }

  const lv1 = fromLine(firstLine);
  if (lv1 !== null) return lv1;

  if (secondLine) return fromLine(secondLine);

  return null;
}

function isBlockTag(tag: string): boolean {
  return tag === "p" || tag === "li" || tag === "table" || /^h[1-6]$/.test(tag);
}

function tagToKind(tag: string): BlockKind {
  if (tag === "p") return "paragraph";
  if (tag === "li") return "list_item";
  if (tag === "table") return "table";
  if (/^h[1-6]$/.test(tag)) return "heading";
  return "paragraph";
}
