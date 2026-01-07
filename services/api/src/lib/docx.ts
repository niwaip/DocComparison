import mammoth from "mammoth";
import sanitizeHtml from "sanitize-html";

export async function docxBufferToSafeHtml(buffer: Buffer): Promise<string> {
  const { value } = await mammoth.convertToHtml({ buffer });
  const sanitized = sanitizeHtml(value, {
    allowedTags: [
      "p",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "strong",
      "b",
      "em",
      "i",
      "u",
      "br",
      "ul",
      "ol",
      "li",
      "table",
      "thead",
      "tbody",
      "tr",
      "th",
      "td",
      "blockquote",
      "hr",
      "span"
    ],
    allowedAttributes: {
      span: ["style"],
      p: ["style"],
      table: ["style"],
      td: ["style"],
      th: ["style"],
      "*": []
    },
    allowedStyles: {
      "*": {
        "text-align": [/^left$|^right$|^center$|^justify$/],
        "font-weight": [/^\d+$/],
        "font-style": [/^italic$/],
        "text-decoration": [/^underline$/]
      }
    }
  });
  return sanitized;
}
