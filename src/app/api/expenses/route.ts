import { NextResponse } from "next/server";
import { sql, newId } from "@/lib/db";
import { currentMemberId } from "@/lib/auth";
import { splitEqually, splitByPercent } from "@/lib/balances";
import type { SplitType } from "@/lib/types";

type SharePayload = { memberId: string; value: number }; // value: cents (exact) or percent

type Body = {
  description?: string;
  amount?: number; // cents
  paidBy?: string;
  splitType?: SplitType;
  // For 'equal': list of participant memberIds.
  // For 'exact': value = cents per member. For 'percent': value = percentage.
  participants?: string[];
  shares?: SharePayload[];
};

export async function POST(req: Request) {
  const me = await currentMemberId();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const description = (body.description ?? "").trim();
  const amount = Math.round(Number(body.amount));
  const paidBy = body.paidBy ?? "";
  const splitType: SplitType = body.splitType ?? "equal";

  if (!description) return NextResponse.json({ error: "Description required" }, { status: 400 });
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "Amount must be greater than 0" }, { status: 400 });
  }
  if (!paidBy) return NextResponse.json({ error: "Select who paid" }, { status: 400 });

  // Resolve the per-member cent shares.
  let shareMap = new Map<string, number>();
  if (splitType === "equal") {
    const participants = body.participants ?? [];
    if (participants.length === 0) {
      return NextResponse.json({ error: "Select at least one participant" }, { status: 400 });
    }
    shareMap = splitEqually(amount, participants);
  } else if (splitType === "exact") {
    const shares = body.shares ?? [];
    for (const s of shares) shareMap.set(s.memberId, Math.round(s.value));
    const sum = [...shareMap.values()].reduce((a, b) => a + b, 0);
    if (sum !== amount) {
      return NextResponse.json(
        { error: `Exact shares must sum to the total (got ${sum} of ${amount} cents)` },
        { status: 400 },
      );
    }
  } else if (splitType === "percent") {
    const shares = body.shares ?? [];
    const totalPct = shares.reduce((a, b) => a + b.value, 0);
    if (Math.round(totalPct) !== 100) {
      return NextResponse.json(
        { error: `Percentages must sum to 100 (got ${totalPct})` },
        { status: 400 },
      );
    }
    shareMap = splitByPercent(
      amount,
      shares.map((s) => ({ memberId: s.memberId, percent: s.value })),
    );
  } else {
    return NextResponse.json({ error: "Unknown split type" }, { status: 400 });
  }

  // Verify all participants are real members.
  const memberIds = [...shareMap.keys()];
  const check = await sql`
    SELECT count(*)::int AS n FROM members WHERE id = ANY(${memberIds})
  `;
  if (Number(check.rows[0].n) !== memberIds.length) {
    return NextResponse.json({ error: "All participants must be real people" }, { status: 400 });
  }

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
