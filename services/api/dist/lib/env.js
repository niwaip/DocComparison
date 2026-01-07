"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = env;
exports.envOptional = envOptional;
function env(name, fallback) {
    const v = (globalThis?.process?.env ?? {})[name];
    if (v === undefined || v === "") {
        if (fallback !== undefined)
            return fallback;
        throw new Error(`Missing env: ${name}`);
    }
    return v;
}
function envOptional(name) {
    const v = (globalThis?.process?.env ?? {})[name];
    if (v === undefined || v === "")
        return undefined;
    return v;
}
