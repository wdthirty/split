import { NextResponse } from "next/server";
import { sql, newId } from "@/lib/db";
import { currentMemberId } from "@/lib/auth";
import { parseExpenseBody, type ExpenseBody } from "@/lib/expensePayload";

export async function POST(req: Request) {
  const me = await currentMemberId();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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

  const expenseId = newId("exp");
  await sql`
    INSERT INTO expenses (id, description, amount, paid_by, split_type, created_by)
    VALUES (${expenseId}, ${description}, ${amount}, ${paidBy}, ${splitType}, ${me})
  `;
  for (const [memberId, share] of shareMap.entries()) {
    await sql`
      INSERT INTO expense_shares (expense_id, member_id, share)
      VALUES (${expenseId}, ${memberId}, ${share})
    `;
  }

  return NextResponse.json({ id: expenseId }, { status: 201 });
}
