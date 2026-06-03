import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

// Neon's serverless driver. It reads the connection string from the env var.
// Vercel's native Neon integration exposes DATABASE_URL; locally you can set
// either DATABASE_URL or POSTGRES_URL (we accept both).
function connectionString(): string {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) {
    throw new Error("DATABASE_URL (or POSTGRES_URL) is not set");
  }
  return url;
}

// `@neondatabase/serverless`'s tagged template returns an array of rows.
// We wrap it to return `{ rows }` so call sites read clearly and match the
// shape most pg tooling uses. Lazily created so importing this module without
// a configured DB (e.g. during `next build` static analysis) doesn't throw.
let _raw: NeonQueryFunction<false, false> | null = null;
function raw(): NeonQueryFunction<false, false> {
  if (!_raw) _raw = neon(connectionString());
  return _raw;
}

type Row = Record<string, unknown>;

export interface SqlClient {
  // Tagged-template form: sql`SELECT ...`
  <T extends Row = Row>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<{ rows: T[]; rowCount: number }>;
  // Plain-string form for the init script: sql.query("CREATE TABLE ...")
  query<T extends Row = Row>(
    text: string,
    params?: unknown[],
  ): Promise<{ rows: T[]; rowCount: number }>;
}

export const sql: SqlClient = Object.assign(
  async <T extends Row = Row>(strings: TemplateStringsArray, ...values: unknown[]) => {
    const rows = (await raw()(strings, ...values)) as T[];
    return { rows, rowCount: rows.length };
  },
  {
    query: async <T extends Row = Row>(text: string, params: unknown[] = []) => {
      const rows = (await raw().query(text, params)) as T[];
      return { rows, rowCount: rows.length };
    },
  },
) as SqlClient;

// Generate ids without a uuid dependency. Web Crypto is available in Node 18+
// and the edge runtime.
export function newId(prefix = ""): string {
  const uuid = globalThis.crypto.randomUUID();
  return prefix ? `${prefix}_${uuid}` : uuid;
}
