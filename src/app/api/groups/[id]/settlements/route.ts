import { NextResponse } from "next/server";
import { sql, newId } from "@/lib/db";
import { currentMemberId } from "@/lib/auth";
import { isGroupMember } from "@/lib/queries";

// Record a repayment: `from` pays `to` `amount` cents.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await currentMemberId();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: groupId } = await params;
  if (!(await isGroupMember(groupId, me))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

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

  // Both parties must be in the group.
  const check = await sql`
    SELECT count(*)::int AS n FROM group_members
    WHERE group_id = ${groupId} AND member_id = ANY(${[from, to]})
  `;
  if (Number(check.rows[0].n) !== 2) {
    return NextResponse.json({ error: "Both people must be in the group" }, { status: 400 });
  }

  const id = newId("stl");
  await sql`
    INSERT INTO settlements (id, group_id, from_member, to_member, amount)
    VALUES (${id}, ${groupId}, ${from}, ${to}, ${amount})
  `;
  return NextResponse.json({ id }, { status: 201 });
}
