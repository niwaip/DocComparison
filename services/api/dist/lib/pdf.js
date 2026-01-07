"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderPdfFromHtmlFile = renderPdfFromHtmlFile;
const promises_1 = __importDefault(require("node:fs/promises"));
const puppeteer_core_1 = __importDefault(require("puppeteer-core"));
async function renderPdfFromHtmlFile(params) {
    const html = await promises_1.default.readFile(params.htmlPath, "utf8");
    const browser = await puppeteer_core_1.default.launch({
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH ?? "/usr/bin/chromium-browser",
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--font-render-hinting=medium"]
    });
    try {
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: "load" });
        await page.pdf({
            path: params.pdfPath,
            format: "A4",
            printBackground: true,
            margin: { top: "12mm", right: "10mm", bottom: "12mm", left: "10mm" }
        });
    }
    finally {
        await browser.close();
    }
}
