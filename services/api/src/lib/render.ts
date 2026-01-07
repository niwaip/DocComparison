import { AlignmentRow, Block } from "./types";

export function renderCompareHtml(params: {
  leftBlocks: Block[];
  rightBlocks: Block[];
  rows: AlignmentRow[];
  title?: string;
}): string {
  const { leftBlocks, rightBlocks, rows } = params;
  const leftMap = new Map(leftBlocks.map((b) => [b.blockId, b]));
  const rightMap = new Map(rightBlocks.map((b) => [b.blockId, b]));

  const body = rows
    .map((row) => {
      const left = row.leftBlockId ? leftMap.get(row.leftBlockId) : undefined;
      const right = row.rightBlockId ? rightMap.get(row.rightBlockId) : undefined;
      const leftHtml = left ? wrapCellHtml("left", left.blockId, left.htmlFragment) : wrapEmpty("left");
      const rightHtml = right ? wrapCellHtml("right", right.blockId, right.htmlFragment) : wrapEmpty("right");

      let leftFinal = leftHtml;
      let rightFinal = rightHtml;

      if (row.kind === "modified" && row.diff?.leftDiffHtmlFragment && row.diff?.rightDiffHtmlFragment && left && right) {
        leftFinal = wrapCellHtml("left", left.blockId, row.diff.leftDiffHtmlFragment);
        rightFinal = wrapCellHtml("right", right.blockId, row.diff.rightDiffHtmlFragment);
      }

      if (row.kind === "inserted" && right) rightFinal = wrapCellHtml("right", right.blockId, right.htmlFragment, true);
      if (row.kind === "deleted" && left) leftFinal = wrapCellHtml("left", left.blockId, left.htmlFragment, true);

      return `<div class="diff-row kind-${row.kind}" data-row-id="${row.rowId}">${leftFinal}${rightFinal}</div>`;
    })
    .join("");

  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeTitle(params.title ?? "合同对比")}</title>
    <style>
      .doc-diff{font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;line-height:1.5;}
      .diff-grid{display:grid;grid-template-columns:1fr 1fr;border:1px solid #eee;border-radius:8px;overflow:hidden;}
      .diff-row{display:contents;}
      .diff-cell{padding:10px 12px;border-bottom:1px solid #f0f0f0;}
      .diff-cell.left{border-right:1px solid #f0f0f0;}
      .diff-cell.empty{background:#fafafa;}
      .diff-row.kind-inserted .diff-cell.right{background:#f0fff4;}
      .diff-row.kind-deleted .diff-cell.left{background:#fff5f5;}
      ins{background:#c6f6d5;text-decoration:none;}
      del{background:#fed7d7;text-decoration:line-through;}
      .diff-cell{overflow-wrap:anywhere;word-break:break-word;min-width:0;}
      .diff-cell p,.diff-cell h1,.diff-cell h2,.diff-cell h3,.diff-cell h4,.diff-cell h5,.diff-cell h6{margin:.25em 0;}
      .diff-cell ul,.diff-cell ol{margin:.25em 0;padding-left:1.1em;list-style-position:inside;}
      .diff-cell li{margin:.1em 0;}
      table{border-collapse:collapse;}
      td,th{border:1px solid #ddd;padding:4px 6px;}
    </style>
  </head>
  <body>
    <article class="doc-diff">
      <div class="diff-grid">
        ${body}
      </div>
    </article>
  </body>
</html>`;
}

function wrapCellHtml(side: "left" | "right", blockId: string, fragment: string, highlight = false): string {
  const extra = highlight ? " highlight" : "";
  if (side === "right") {
    const btn = `<button class="ai-suggest-btn" type="button" aria-label="AI差异解析" title="AI差异解析"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a7 7 0 0 1 7 7v1h1a2 2 0 0 1 2 2v5a5 5 0 0 1-5 5H9a7 7 0 0 1 0-14h3zm0 2h-3a5 5 0 1 0 0 10h8a3 3 0 0 0 3-3v-5h-3V9a5 5 0 0 0-5-5zm-1 12h2v2h-2v-2zm0-8h2v6h-2V8z"/></svg></button>`;
    return `<section class="diff-cell ${side}${extra}" data-block-id="${blockId}"><div class="cell-inner">${btn}<div class="cell-content">${fragment}</div></div></section>`;
  }
  return `<section class="diff-cell ${side}${extra}" data-block-id="${blockId}">${fragment}</section>`;
}

function wrapEmpty(side: "left" | "right"): string {
  return `<section class="diff-cell ${side} empty"></section>`;
}

function escapeTitle(title: string): string {
  return title.replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
