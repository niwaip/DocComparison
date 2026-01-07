"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sha1 = sha1;
const node_crypto_1 = __importDefault(require("node:crypto"));
function sha1(text) {
    return node_crypto_1.default.createHash("sha1").update(text).digest("hex");
}
