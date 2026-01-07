"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.docxBufferToSafeHtml = docxBufferToSafeHtml;
const mammoth_1 = __importDefault(require("mammoth"));
const sanitize_html_1 = __importDefault(require("sanitize-html"));
async function docxBufferToSafeHtml(buffer) {
    const { value } = await mammoth_1.default.convertToHtml({ buffer });
    const sanitized = (0, sanitize_html_1.default)(value, {
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
