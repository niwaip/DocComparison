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
    const base = (0, env_1.env)("ARTIFACTS_DIR", "/data/artifacts");
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
    await promises_1.default.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
}
async function readJson(filePath) {
    const raw = await promises_1.default.readFile(filePath, "utf8");
    return JSON.parse(raw);
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
