"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildBlocksFromHtml = buildBlocksFromHtml;
const cheerio = __importStar(require("cheerio"));
const hash_1 = require("./hash");
const text_1 = require("./text");
function buildBlocksFromHtml(html, chunkLevel) {
    const splitLevel = Number.isFinite(chunkLevel) ? Math.max(1, Math.min(6, Math.floor(Number(chunkLevel)))) : 2;
    const $ = cheerio.load(`<body>${html}</body>`);
    const body = $("body").first();
    const blocks = [];
    const ctx = { nextBlockIndex: 1, currentHeadingText: "" };
    let nodes = [];
    body.children().each((idx, el) => {
        const tag = el.tagName?.toLowerCase?.() ?? "";
        if (!tag)
            return;
        if (isBlockTag(tag)) {
            nodes.push(nodeFromElement($, tag, `body.${tag}[${idx}]`, el));
            return;
        }
        $(el)
            .find("h1,h2,h3,h4,h5,h6,p,li,table")
            .each((innerIdx, innerEl) => {
            const itag = innerEl.tagName?.toLowerCase?.() ?? "";
            if (!itag || !isBlockTag(itag))
                return;
            nodes.push(nodeFromElement($, itag, `body.${tag}[${idx}].${itag}[${innerIdx}]`, innerEl));
        });
    });
    const boilerplateSignature = (text) => {
        const norm = (0, text_1.normalizeText)(text);
        if (!norm)
            return "";
        const lines = norm
            .split("\n")
            .map((x) => x.trim())
            .filter((x) => x.length > 0);
        const firstLine = lines[0] ?? "";
        if (/^\d{1,4}[.。]?$/.test(firstLine) && lines.length >= 2)
            return (0, text_1.normalizeText)(lines.slice(1).join("\n"));
        const stripped = firstLine.replace(/^\d{1,4}[.。]\s*/g, "");
        if (stripped && stripped !== firstLine)
            return (0, text_1.normalizeText)([stripped, ...lines.slice(1)].join("\n"));
        return norm;
    };
    const rawNorms = nodes.map((n) => (0, text_1.normalizeText)(n.text));
    const signatures = nodes.map((n) => boilerplateSignature(n.text));
    const sigCounts = new Map();
    for (const s of signatures) {
        if (!s)
            continue;
        sigCounts.set(s, (sigCounts.get(s) ?? 0) + 1);
    }
    nodes = nodes.filter((n, i) => {
        const raw = rawNorms[i] ?? "";
        if (raw && /^\d{1,4}[.。]?$/.test(raw))
            return false;
        const s = signatures[i];
        if (!s)
            return false;
        if (n.kind === "table")
            return true;
        const c = sigCounts.get(s) ?? 0;
        if (c < 3)
            return true;
        if (s.length > 140)
            return true;
        if (s.length <= 6 && /^[0-9]{1,4}$/.test(s))
            return false;
        let ascii = 0;
        for (let k = 0; k < s.length; k++) {
            if (s.charCodeAt(k) < 128)
                ascii += 1;
        }
        if (ascii / s.length > 0.7)
            return false;
        if (s.length <= 30 && c >= 4 && ascii / s.length > 0.4)
            return false;
        return true;
    });
    const hasAnyHeading = nodes.some((n) => n.kind === "heading" || n.headingLevel !== null);
    if (!hasAnyHeading) {
        for (const n of nodes) {
            blocks.push(makeBlock(n.kind, n.structurePath, n.html, n.text, ctx, ""));
        }
        return blocks.filter((b) => (0, text_1.normalizeText)(b.text).length > 0 || b.kind === "table");
    }
    let secIndex = 1;
    let bufHtml = [];
    let bufText = [];
    let bufHasContent = false;
    const headingKey = (text) => {
        const lines = (0, text_1.normalizeText)(text)
            .split("\n")
            .map((x) => x.trim())
            .filter((x) => x.length > 0);
        return lines[0] ?? "";
    };
    const flush = () => {
        const text = (0, text_1.normalizeText)(bufText.join("\n\n"));
        const htmlFrag = bufHtml.join("");
        if ((0, text_1.normalizeText)(text).length > 0) {
            blocks.push(makeBlock("paragraph", `sec[${secIndex++}]`, htmlFrag, text, ctx, ctx.currentHeadingText));
        }
        bufHtml = [];
        bufText = [];
        bufHasContent = false;
    };
    for (const n of nodes) {
        const isHeading = n.kind === "heading" || n.headingLevel !== null;
        if (isHeading) {
            const shouldSplit = (n.headingLevel ?? 99) <= splitLevel;
            if (shouldSplit && bufHasContent)
                flush();
            if (shouldSplit)
                ctx.currentHeadingText = headingKey(n.text);
            bufHasContent = true;
            bufHtml.push(n.html);
            bufText.push(n.text);
            continue;
        }
        bufHasContent = true;
        bufHtml.push(n.html);
        bufText.push(n.text);
    }
    if (bufHasContent)
        flush();
    return blocks.filter((b) => (0, text_1.normalizeText)(b.text).length > 0 || b.kind === "table");
}
function makeBlock(kind, structurePath, htmlFragment, text, ctx, contextHeadingText) {
    const norm = (0, text_1.normalizeText)(text);
    const ctxHeading = (0, text_1.normalizeText)(contextHeadingText);
    const stableKey = ctxHeading && norm.length <= 160 ? (0, hash_1.sha1)(`${kind}:${ctxHeading}:${norm}`) : (0, hash_1.sha1)(`${kind}:${norm}`);
    const blockId = `b_${String(ctx.nextBlockIndex++).padStart(4, "0")}`;
    const meta = {};
    if (kind === "heading") {
        const m = /<h([1-6])\b/i.exec(htmlFragment);
        if (m)
            meta.headingLevel = Number(m[1]);
    }
    return {
        blockId,
        kind,
        structurePath,
        stableKey,
        text: norm,
        htmlFragment: normalizeBlockHtml(htmlFragment),
        meta
    };
}
function elementText($, el) {
    const node = $(el).clone();
    node.find("br").replaceWith("\n");
    return node.text();
}
function nodeFromElement($, tag, structurePath, el) {
    const kind = tagToKind(tag);
    const html = $(el).toString();
    const text = elementText($, el);
    const headingLevel = detectHeadingLevel(tag, text);
    return { kind, headingLevel, structurePath, html, text };
}
function normalizeBlockHtml(fragment) {
    if (!fragment)
        return fragment;
    let s = fragment;
    s = s.replace(/^\s*(?:<br\s*\/?>\s*)+/gi, "");
    s = s.replace(/(<p[^>]*>)\s*(?:<br\s*\/?>\s*)+/gi, "$1");
    s = s.replace(/(?:<br\s*\/?>\s*){2,}/gi, "<br/>");
    return s;
}
function detectHeadingLevel(tag, text) {
    const t = (0, text_1.normalizeText)(text);
    if (!t)
        return null;
    if (/^h[1-6]$/.test(tag))
        return Number(tag.slice(1));
    const lines = t
        .split("\n")
        .map((x) => x.trim())
        .filter((x) => x.length > 0);
    const firstLine = lines[0] ?? "";
    const secondLine = lines[1] ?? "";
    if (!firstLine)
        return null;
    const fromLine = (line) => {
        if (!line)
            return null;
        const mHash = /^(#{1,6})\s+/.exec(line);
        if (mHash)
            return mHash[1].length;
        const mNum2 = /^(\d+(?:\.\d+)+)(?=(?:\s|[.。:：、\-—\)])|$)/.exec(line);
        if (mNum2) {
            const segs = mNum2[1].split(".").filter(Boolean).length;
            return Math.min(6, Math.max(1, segs));
        }
        const mNum1 = /^(\d+)(?=(?:\s|[.。:：、\-—\)])|$)/.exec(line);
        if (mNum1) {
            const rest = line.slice(mNum1[1].length).trimStart();
            if (rest.startsWith(")") || rest.startsWith("）"))
                return null;
            return 1;
        }
        const mCn = /^(第[一二三四五六七八九十百千0-9]+)([章节条部分篇])/.exec(line);
        if (mCn) {
            const unit = mCn[2];
            if (unit === "章")
                return 1;
            if (unit === "节")
                return 2;
            if (unit === "条")
                return 3;
            return 1;
        }
        const mCn2 = /^([一二三四五六七八九十]+)[、.]/.exec(line);
        if (mCn2)
            return 1;
        return null;
    };
    const mInlineSecond = /^(\d+)\s+(\d+(?:\.\d+)+)(?=(?:\s|[.。:：、\-—\)])|$)/.exec(firstLine);
    if (mInlineSecond) {
        const segs = mInlineSecond[2].split(".").filter(Boolean).length;
        return Math.min(6, Math.max(1, segs));
    }
    if (/^\d+(?:\.\d+)*$/.test(firstLine) && secondLine) {
        const lv2 = fromLine(secondLine);
        if (lv2 !== null)
            return lv2;
    }
    const lv1 = fromLine(firstLine);
    if (lv1 !== null)
        return lv1;
    if (secondLine)
        return fromLine(secondLine);
    return null;
}
function isBlockTag(tag) {
    return tag === "p" || tag === "li" || tag === "table" || /^h[1-6]$/.test(tag);
}
function tagToKind(tag) {
    if (tag === "p")
        return "paragraph";
    if (tag === "li")
        return "list_item";
    if (tag === "table")
        return "table";
    if (/^h[1-6]$/.test(tag))
        return "heading";
    return "paragraph";
}
