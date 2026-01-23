"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureArtifacts = ensureArtifacts;
exports.writeJson = writeJson;
exports.readJson = readJson;
exports.fileExists = fileExists;
const promises_1 = __importDefault(require("node:fs/promises"));
const node_path_1 = __importDefault(require("node:path"));
const env_1 = require("./env");
async function ensureArtifacts(compareId) {
    const base = "./artifacts";
    const dir = node_path_1.default.join(base, compareId);
    await promises_1.default.mkdir(dir, { recursive: true });
    return {
        compareId,
        dir,
        jsonPath: node_path_1.default.join(dir, "compare.json"),
        htmlPath: node_path_1.default.join(dir, "compare.html"),
        pdfPath: node_path_1.default.join(dir, "compare.pdf")
    };
}
async function writeJson(filePath, data) {
    const dir = node_path_1.default.dirname(filePath);
    const base = node_path_1.default.basename(filePath);
    const tmpPath = node_path_1.default.join(dir, `.${base}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`);
    await promises_1.default.writeFile(tmpPath, JSON.stringify(data, null, 2), "utf8");
    await promises_1.default.rename(tmpPath, filePath);
}
async function readJson(filePath) {
    let lastErr = null;
    for (let attempt = 0; attempt < 4; attempt++) {
        try {
            const raw = await promises_1.default.readFile(filePath, "utf8");
            return JSON.parse(raw);
        }
        catch (e) {
            lastErr = e;
            if (attempt >= 3)
                throw e;
            await new Promise((r) => setTimeout(r, 30 * (attempt + 1)));
        }
    }
    throw lastErr;
}
async function fileExists(filePath) {
    try {
        await promises_1.default.access(filePath);
        return true;
    }
    catch {
        return false;
    }
}
