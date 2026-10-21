/**
 * Reads the :root custom properties of src/styles/tokens.css. Shared by the
 * build (src/lib/tokens.ts) and tests/unit/tokens.spec.ts, so both resolve the
 * palette the same way. Pure: callers pass the stylesheet text in.
 */
export type TokenMap = Map<string, string>;

export function parseRootTokens(css: string): TokenMap {
  const root = css.replace(/\/\*[\s\S]*?\*\//g, '').match(/:root\s*{([\s\S]*?)\n}/)?.[1];
  if (root === undefined) throw new Error('tokens.css has no :root block');
  return new Map([...root.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
}

/** A token's literal value, following plain var() references. */
export function resolveToken(tokens: TokenMap, name: string, seen = new Set<string>()): string {
  const value = tokens.get(name);
  if (value === undefined) throw new Error(`Unknown token ${name}`);
  const ref = value.match(/^var\((--[\w-]+)\)$/);
  if (!ref) return value;
  if (seen.has(ref[1])) throw new Error(`Cycle at ${ref[1]}`);
  return resolveToken(tokens, ref[1], new Set([...seen, name]));
}
