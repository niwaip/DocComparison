export function env(name: string, fallback?: string): string {
  const v = ((globalThis as any)?.process?.env ?? {})[name];
  if (v === undefined || v === "") {
    if (fallback !== undefined) return fallback;
    throw new Error(`Missing env: ${name}`);
  }
  return v;
}

export function envOptional(name: string): string | undefined {
  const v = ((globalThis as any)?.process?.env ?? {})[name];
  if (v === undefined || v === "") return undefined;
  return v;
}
