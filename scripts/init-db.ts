// One-shot schema bootstrap. Run with:  npm run db:init
// Requires POSTGRES_URL (or the Vercel/Neon env vars) to be set.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { neon } from "@neondatabase/serverless";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Prefer the unpooled (direct) connection for DDL; fall back to the pooled one.
const connString =
  process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!connString) {
  console.error("Set DATABASE_URL (or DATABASE_URL_UNPOOLED / POSTGRES_URL) before running.");
  process.exit(1);
}
const sql = neon(connString);

async function main() {
  const schemaPath = join(__dirname, "..", "src", "lib", "schema.sql");
  const schema = readFileSync(schemaPath, "utf8");

  // Strip full-line `--` comments first (so a comment glued to the following
  // statement doesn't cause the statement to be dropped), then split on the
  // semicolons that terminate each statement. The schema avoids semicolons
  // inside statements (no functions/dollar-quoting), so a naive split is safe.
  const withoutComments = schema
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");

  const statements = withoutComments
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  console.log(`Applying ${statements.length} statements...`);
  for (const stmt of statements) {
    await sql.query(stmt);
  }
  // (neon()'s `.query(text)` runs a single non-parameterized statement.)
  console.log("✓ Schema applied.");
  process.exit(0);
}

main().catch((err) => {
  console.error("DB init failed:", err);
  process.exit(1);
});
