import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { currentMemberId } from "@/lib/auth";
import { parseExpenseBody, type ExpenseBody } from "@/lib/expensePayload";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ expenseId: string }> },
) {
  const me = await currentMemberId();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { expenseId } = await params;

  // Shares cascade-delete via FK. RETURNING so rows.length reflects the delete
  // (the neon driver only counts returned rows, not affected rows).
  const res = await sql`DELETE FROM expenses WHERE id = ${expenseId} RETURNING id`;
  if (res.rowCount === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

// Edit an existing expense in place: update its fields and fully replace its
// shares. Keeps the original id and created_at so it stays put in the feed.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ expenseId: string }> },
) {
  const me = await currentMemberId();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { expenseId } = await params;

  let body: ExpenseBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const parsed = await parseExpenseBody(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  }
  const { description, amount, paidBy, splitType, shareMap } = parsed.value;

  const upd = await sql`
    UPDATE expenses
    SET description = ${description}, amount = ${amount},
        paid_by = ${paidBy}, split_type = ${splitType}
    WHERE id = ${expenseId}
    RETURNING id
  `;
  if (upd.rowCount === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Replace the share rows wholesale (simpler and correct vs. diffing).
  await sql`DELETE FROM expense_shares WHERE expense_id = ${expenseId}`;
  for (const [memberId, share] of shareMap.entries()) {
    await sql`
      INSERT INTO expense_shares (expense_id, member_id, share)
      VALUES (${expenseId}, ${memberId}, ${share})
    `;
  }

  return NextResponse.json({ id: expenseId });
}
