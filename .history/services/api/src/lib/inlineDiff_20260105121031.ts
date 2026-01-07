import DiffMatchPatch from "diff-match-patch";
import { escapeHtml } from "./text";

export function inlineDiffHtml(beforeText: string, afterText: string): { html: string; insIds: string[]; delIds: string[] } {
  const dmp = new DiffMatchPatch();
  const diffs = dmp.diff_main(beforeText, afterText);
  dmp.diff_cleanupSemantic(diffs);

  const insIds: string[] = [];
  const delIds: string[] = [];
  let insN = 1;
  let delN = 1;

  const html = diffs
    .map(([op, data]) => {
      const escaped = escapeHtml(data);
      if (op === DiffMatchPatch.DIFF_INSERT) {
        const id = `i_${insN++}`;
        insIds.push(id);
        return `<ins data-ins-id="${id}">${escaped}</ins>`;
      }
      if (op === DiffMatchPatch.DIFF_DELETE) {
        const id = `d_${delN++}`;
        delIds.push(id);
        return `<del data-del-id="${id}">${escaped}</del>`;
      }
      return escaped;
    })
    .join("");

  return { html, insIds, delIds };
}
