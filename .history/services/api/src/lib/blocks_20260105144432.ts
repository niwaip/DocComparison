import * as cheerio from "cheerio";
import { sha1 } from "./hash";
import { escapeHtml, normalizeText } from "./text";
import { Block, BlockKind } from "./types";

type BlockBuildCtx = {
  nextBlockIndex: number;
};

export function buildBlocksFromHtml(html: string, options?: { maxBlockChars?: number }): Block[] {
  const $ = cheerio.load(`<body>${html}</body>`);
  const body = $("body").first();

  const blocks: Block[] = [];
  const ctx: BlockBuildCtx = { nextBlockIndex: 1 };
  const maxBlockChars = Number.isFinite(options?.maxBlockChars) ? Number(options?.maxBlockChars) : 0;

  body.children().each((idx, el) => {
    const tag = (el as any).tagName?.toLowerCase?.() ?? "";
    if (!tag) return;
    if (isBlockTag(tag)) {
      const kind = tagToKind(tag);
      pushBlock($, blocks, kind, `body.${tag}[${idx}]`, $(el).toString(), elementText($, el), ctx, maxBlockChars);
      return;
    }
    $(el)
      .find("h1,h2,h3,h4,h5,h6,p,li,table")
      .each((innerIdx, innerEl) => {
        const itag = (innerEl as any).tagName?.toLowerCase?.() ?? "";
        if (!itag || !isBlockTag(itag)) return;
        const kind = tagToKind(itag);
        pushBlock(
          $,
          blocks,
          kind,
          `body.${tag}[${idx}].${itag}[${innerIdx}]`,
          $(innerEl).toString(),
          elementText($, innerEl),
          ctx,
          maxBlockChars
        );
      });
  });

  return blocks.filter((b) => normalizeText(b.text).length > 0 || b.kind === "table");
}

function pushBlock(
  $: cheerio.CheerioAPI,
  blocks: Block[],
  kind: BlockKind,
  structurePath: string,
  htmlFragment: string,
  text: string,
  ctx: BlockBuildCtx,
  maxBlockChars: number
): void {
  const norm = normalizeText(text);
  if (!maxBlockChars || maxBlockChars <= 0 || norm.length <= maxBlockChars || kind === "table" || kind === "heading") {
    blocks.push(makeBlock($, kind, structurePath, htmlFragment, text, ctx));
    return;
  }

  const chunks = splitTextIntoChunks(norm, maxBlockChars);
  const tag = kind === "list_item" ? "li" : "p";
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const frag = `<${tag}>${escapeHtml(chunk).replace(/\n/g, "<br/>")}</${tag}>`;
    blocks.push(makeBlock($, kind, `${structurePath}#s${i + 1}`, frag, chunk, ctx));
  }
}

function makeBlock($: cheerio.CheerioAPI, kind: BlockKind, structurePath: string, htmlFragment: string, text: string, ctx: BlockBuildCtx): Block {
  const norm = normalizeText(text);
  const stableKey = sha1(`${kind}:${norm}`);
  const blockId = `b_${String(ctx.nextBlockIndex++).padStart(4, "0")}`;
  const meta: Block["meta"] = {};
  if (kind === "heading") {
    const m = /<h([1-6])\b/i.exec(htmlFragment);
    if (m) meta.headingLevel = Number(m[1]);
  }
  return {
    blockId,
    kind,
    structurePath,
    stableKey,
    text: norm,
    htmlFragment,
    meta
  };
}

function elementText($: cheerio.CheerioAPI, el: any): string {
  const node = $(el).clone();
  node.find("br").replaceWith("\n");
  return node.text();
}

function splitTextIntoChunks(text: string, maxChars: number): string[] {
  const out: string[] = [];
  let rest = text;

  const hardMin = Math.max(40, Math.floor(maxChars * 0.55));
  const boundaryRe = /[\n。！？.!?；;：:]/g;

  while (rest.length > maxChars) {
    const slice = rest.slice(0, maxChars + 1);
    let cut = -1;
    let m: RegExpExecArray | null;
    boundaryRe.lastIndex = 0;
    while ((m = boundaryRe.exec(slice))) cut = m.index + 1;
    if (cut < hardMin) cut = maxChars;
    const part = rest.slice(0, cut).trim();
    if (part) out.push(part);
    rest = rest.slice(cut).trim();
  }
  if (rest.trim()) out.push(rest.trim());
  return out.length ? out : [text];
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
