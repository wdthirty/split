import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { currentMemberId } from "@/lib/auth";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await currentMemberId();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  // RETURNING so rows.length reflects the delete (neon counts returned rows).
  const res = await sql`DELETE FROM settlements WHERE id = ${id} RETURNING id`;
  if (res.rowCount === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

// Edit a settlement in place (preserves id + created_at). Same validation as POST.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await currentMemberId();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

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

  const check = await sql`
    SELECT count(*)::int AS n FROM members WHERE id = ANY(${[from, to]})
  `;
  if (Number(check.rows[0].n) !== 2) {
    return NextResponse.json({ error: "Both people must be real" }, { status: 400 });
  }

  const upd = await sql`
    UPDATE settlements
    SET from_member = ${from}, to_member = ${to}, amount = ${amount}
    WHERE id = ${id}
    RETURNING id
  `;
  if (upd.rowCount === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ id });
}
