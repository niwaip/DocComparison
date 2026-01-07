import crypto from "node:crypto";

export function sha1(text: string): string {
  return crypto.createHash("sha1").update(text).digest("hex");
}
