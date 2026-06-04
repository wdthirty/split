import { NextResponse } from "next/server";
import { sql, newId } from "@/lib/db";
import { currentMemberId } from "@/lib/auth";

// Record a repayment: `from` pays `to` `amount` cents.
export async function POST(req: Request) {
  const me = await currentMemberId();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { from?: string; to?: string; amount?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const from = body.from ?? "";
  const to = body.to ?? "";
  const amount = Math.round(Number(body.amount));

  if (!from || !to) return NextResponse.json({ error: "Pick both people" }, { status: 400 });
  if (from === to) return NextResponse.json({ error: "Can't pay yourself" }, { status: 400 });
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "Amount must be greater than 0" }, { status: 400 });
  }

  // Both parties must be real members.
  const check = await sql`
    SELECT count(*)::int AS n FROM members WHERE id = ANY(${[from, to]})
  `;
  if (Number(check.rows[0].n) !== 2) {
    return NextResponse.json({ error: "Both people must be real" }, { status: 400 });
  }

  const id = newId("stl");
  await sql`
    INSERT INTO settlements (id, from_member, to_member, amount)
    VALUES (${id}, ${from}, ${to}, ${amount})
  `;
  return NextResponse.json({ id }, { status: 201 });
}
