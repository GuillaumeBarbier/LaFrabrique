// Key case conversion between the MCP tools (snake_case, ADR-0008) and the services (camelCase).
// Only object keys change; values (ids, texts, view names) are left as they are.

export function toSnake(key: string): string {
  return key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

export function toCamel(key: string): string {
  return key.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && Object.getPrototypeOf(value) === Object.prototype;
}

function convert(value: unknown, key: (k: string) => string, keepKeysOf: ReadonlySet<string>): unknown {
  if (Array.isArray(value)) return value.map((v) => convert(v, key, keepKeysOf));
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(
    Object.entries(value).map(([k, v]) => [key(k), keepKeysOf.has(k) ? v : convert(v, key, keepKeysOf)]),
  );
}

/** camelCase keys → snake_case, deeply. Keys listed in `keepKeysOf` keep their children as they are (maps keyed by data). */
export function snakeKeys<T>(value: T, keepKeysOf: readonly string[] = []): unknown {
  return convert(value, toSnake, new Set(keepKeysOf));
}

export function camelKeys(value: unknown): Record<string, unknown> {
  return convert(value, toCamel, new Set()) as Record<string, unknown>;
}
