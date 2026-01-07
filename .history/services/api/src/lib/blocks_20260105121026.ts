import * as cheerio from "cheerio";
import { sha1 } from "./hash";
import { normalizeText } from "./text";
import { Block, BlockKind } from "./types";

type BlockBuildCtx = {
  nextBlockIndex: number;
};

export function buildBlocksFromHtml(html: string): Block[] {
  const $ = cheerio.load(`<body>${html}</body>`);
  const body = $("body").first();

  const blocks: Block[] = [];
  const ctx: BlockBuildCtx = { nextBlockIndex: 1 };

  body.children().each((idx, el) => {
    const tag = (el as any).tagName?.toLowerCase?.() ?? "";
    if (!tag) return;
    if (isBlockTag(tag)) {
      const kind = tagToKind(tag);
      blocks.push(makeBlock($, kind, `body.${tag}[${idx}]`, $(el).toString(), $(el).text(), ctx));
      return;
    }
    $(el)
      .find("h1,h2,h3,h4,h5,h6,p,li,table")
      .each((innerIdx, innerEl) => {
        const itag = (innerEl as any).tagName?.toLowerCase?.() ?? "";
        if (!itag || !isBlockTag(itag)) return;
        const kind = tagToKind(itag);
        blocks.push(
          makeBlock(
            $,
            kind,
            `body.${tag}[${idx}].${itag}[${innerIdx}]`,
            $(innerEl).toString(),
            $(innerEl).text(),
            ctx
          )
        );
      });
  });

  return blocks.filter((b) => normalizeText(b.text).length > 0 || b.kind === "table");
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
