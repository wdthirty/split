import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { currentMemberId } from "@/lib/auth";
import { isGroupMember } from "@/lib/queries";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; expenseId: string }> },
) {
  const me = await currentMemberId();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: groupId, expenseId } = await params;
  if (!(await isGroupMember(groupId, me))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Shares cascade-delete via FK. Scope by group so you can't delete across groups.
  const res = await sql`
    DELETE FROM expenses WHERE id = ${expenseId} AND group_id = ${groupId}
  `;
  if (res.rowCount === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
