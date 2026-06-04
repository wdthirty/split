// One-shot backfill of confirmed Splitwise net balances into the app's ledger.
//
//   npm run backfill:splitwise            (dry run — prints what it would do)
//   npm run backfill:splitwise -- --apply (actually writes to the DB)
//
// The app uses ONE global ledger (no groups) and the Splitwise exports were
// pairwise, so we do NOT import raw line items (they'd double-count shared
// expenses and produce wrong balances). Instead we seed the three net tabs the
// user confirmed, as settlement rows that reproduce exactly those net positions.
//
// Settlement math (see src/lib/balances.ts): a settlement {from, to, amount}
// does net[from] += amount; net[to] -= amount. So to make X owe Y by N, the
// CREDITOR is `from` and the DEBTOR is `to`.
//
// Requires DATABASE_URL (or DATABASE_URL_UNPOOLED / POSTGRES_URL) to be set;
// the npm script passes --env-file=.env like db:init does.
import { neon } from "@neondatabase/serverless";

const APPLY = process.argv.includes("--apply");

const connString =
  process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!connString) {
  console.error("Set DATABASE_URL (or DATABASE_URL_UNPOOLED / POSTGRES_URL) before running.");
  process.exit(1);
}
const sql = neon(connString);

// "You" and the three friends. Names are matched case-insensitively against
// members.name_key, so they must already exist in the app.
const ME = "Ryan";

// The full set of PAIRWISE tabs across the four people — one edge per pair,
// each stated once as "debtor owes creditor $X". The same real debt seen from
// both friends' Splitwise exports is ONE edge here (we don't enter it twice).
//
// Pairs (6 total for 4 people): Ryan-Simon, Ryan-Marco, Ryan-Hyunsu,
// Marco-Hyunsu, Simon-Hyunsu, Marco-Simon.
//
//   From Ryan's numbers:
//     - Simon owes Ryan $942.65 (more than the CSV's 896.65; includes cross-group)
//     - Ryan owes Marco $4.97
//     - Ryan owes Hyunsu $67.57   (same edge as Hyunsu's "Ryan owes me 67.57")
//   From Hyunsu's numbers:
//     - Marco owes Hyunsu $206.79
//     - Simon owes Hyunsu $826.15
//   From Marco's numbers:
//     - Marco owes Simon $41.96
//     (Marco-Hyunsu $206.79 and Ryan-Marco $4.97 re-confirmed his exports.)
// All 6 pairs for the 4 people are now covered — this is the full graph.
const SEEDS: { debtor: string; creditor: string; dollars: number; note: string }[] = [
  { debtor: "Simon", creditor: ME, dollars: 942.65, note: "Simon owes Ryan" },
  { debtor: ME, creditor: "Marco", dollars: 4.97, note: "Ryan owes Marco" },
  { debtor: ME, creditor: "Hyunsu", dollars: 67.57, note: "Ryan owes Hyunsu" },
  { debtor: "Marco", creditor: "Hyunsu", dollars: 206.79, note: "Marco owes Hyunsu" },
  { debtor: "Simon", creditor: "Hyunsu", dollars: 826.15, note: "Simon owes Hyunsu" },
  { debtor: "Marco", creditor: "Simon", dollars: 41.96, note: "Marco owes Simon" },
];

function toCents(dollars: number): number {
  // Round to the nearest cent to avoid float drift (e.g. 942.65 * 100).
  return Math.round(dollars * 100);
}

function newId(prefix: string): string {
  return `${prefix}_${globalThis.crypto.randomUUID()}`;
}

type MemberRow = { id: string; name: string; name_key: string };

async function main() {
  console.log(APPLY ? "APPLY mode — will write to the DB.\n" : "DRY RUN — no writes. Pass --apply to commit.\n");

  // 0) Guard against listing the same unordered pair twice (a contradiction or
  //    accidental double-entry of one debt). Each pair must appear once.
  const seenPairs = new Set<string>();
  for (const s of SEEDS) {
    const pair = [s.debtor.trim().toLowerCase(), s.creditor.trim().toLowerCase()].sort().join("|");
    if (seenPairs.has(pair)) {
      console.error(`Duplicate pair in SEEDS: ${s.debtor} / ${s.creditor}. Each pair must appear once.`);
      process.exit(1);
    }
    seenPairs.add(pair);
  }

  // 1) Resolve every name we reference to a member id (case-insensitive).
  const names = Array.from(new Set(SEEDS.flatMap((s) => [s.debtor, s.creditor])));
  const keys = names.map((n) => n.trim().toLowerCase());
  const members = (await sql`
    SELECT id, name, name_key FROM members WHERE name_key = ANY(${keys})
  `) as MemberRow[];
  const byKey = new Map(members.map((m) => [m.name_key, m]));

  const missing = names.filter((n) => !byKey.has(n.trim().toLowerCase()));
  if (missing.length) {
    console.error("These members don't exist in the app (create them first):");
    for (const n of missing) console.error("  - " + n);
    process.exit(1);
  }
  const idOf = (name: string) => byKey.get(name.trim().toLowerCase())!.id;

  // 2) Build the settlement rows. Creditor = from, Debtor = to.
  const settlements = SEEDS.map((s) => ({
    id: newId("st"),
    from_member: idOf(s.creditor),
    to_member: idOf(s.debtor),
    amount: toCents(s.dollars),
    label: `${s.note} ($${s.dollars.toFixed(2)})`,
  }));

  // 3) Show the plan and the resulting net positions.
  console.log("Planned settlements (from = creditor, to = debtor):");
  for (const s of settlements) {
    const from = members.find((m) => m.id === s.from_member)!.name;
    const to = members.find((m) => m.id === s.to_member)!.name;
    console.log(`  ${from}  →  ${to}   ${(s.amount / 100).toFixed(2)}   [${s.label}]`);
  }

  const net = new Map<string, number>();
  for (const s of settlements) {
    net.set(s.from_member, (net.get(s.from_member) ?? 0) + s.amount);
    net.set(s.to_member, (net.get(s.to_member) ?? 0) - s.amount);
  }
  console.log("\nResulting net positions (+ = is owed, - = owes):");
  for (const [id, cents] of net) {
    const name = members.find((m) => m.id === id)!.name;
    console.log(`  ${name.padEnd(12)} ${(cents < 0 ? "-" : "+")}$${(Math.abs(cents) / 100).toFixed(2)}`);
  }
  const sum = Array.from(net.values()).reduce((a, b) => a + b, 0);
  console.log(`  (sum, must be 0): ${sum}`);

  if (!APPLY) {
    console.log("\nDry run complete. Re-run with --apply to write these settlements.");
    process.exit(0);
  }

  // 4) Idempotency guard: refuse to double-seed. We can't tag rows (no column
  //    for it), so we bail if an identical (from,to,amount) settlement already
  //    exists, which is the signature of a prior run of this script.
  for (const s of settlements) {
    const dupes = (await sql`
      SELECT id FROM settlements
      WHERE from_member = ${s.from_member} AND to_member = ${s.to_member} AND amount = ${s.amount}
    `) as { id: string }[];
    if (dupes.length) {
      console.error(
        `\nRefusing to write: a settlement ${s.from_member}→${s.to_member} for ${s.amount} cents ` +
          `already exists (${dupes[0].id}). Looks like this was already backfilled. Aborting.`,
      );
      process.exit(1);
    }
  }

  // 5) Insert. neon's HTTP driver autocommits per statement; these three are
  //    independent rows so partial failure is recoverable (the dup-guard above
  //    makes a re-run safe).
  for (const s of settlements) {
    await sql`
      INSERT INTO settlements (id, from_member, to_member, amount)
      VALUES (${s.id}, ${s.from_member}, ${s.to_member}, ${s.amount})
    `;
    console.log(`inserted ${s.id}  [${s.label}]`);
  }

  console.log("\n✓ Backfill complete.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
