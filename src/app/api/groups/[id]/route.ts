import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { currentMemberId } from "@/lib/auth";
import { isGroupMember, getGroupMembers, getExpenses, getSettlements } from "@/lib/queries";
import { computeBalances, simplify } from "@/lib/balances";

// Full snapshot of a group: members, expenses, settlements, balances, transfers.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await currentMemberId();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!(await isGroupMember(id, me))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const groupRes = await sql<{ id: string; name: string; emoji: string; created_by: string | null }>`
    SELECT id, name, emoji, created_by FROM groups WHERE id = ${id} LIMIT 1
  `;
  if (groupRes.rows.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [members, expenses, settlements] = await Promise.all([
    getGroupMembers(id),
    getExpenses(id),
    getSettlements(id),
  ]);

  const balances = computeBalances(members, expenses, settlements);
  const transfers = simplify(balances);

  return NextResponse.json({
    group: groupRes.rows[0],
    members,
    expenses,
    settlements,
    balances,
    transfers,
  });
}

// Add members to an existing group.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await currentMemberId();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!(await isGroupMember(id, me))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let body: { memberIds?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  for (const mid of body.memberIds ?? []) {
    await sql`
      INSERT INTO group_members (group_id, member_id) VALUES (${id}, ${mid})
      ON CONFLICT DO NOTHING
    `;
  }

  const members = await getGroupMembers(id);
  return NextResponse.json({ members });
}
