import { sql } from "./db";
import type { Expense, Settlement, Member, SplitType } from "./types";

// Everyone in the system. With no groups, this is the global pool you split with.
export async function getAllMembers(): Promise<Member[]> {
  const res = await sql<{ id: string; name: string }>`
    SELECT id, name FROM members ORDER BY name ASC
  `;
  return res.rows.map((r) => ({ id: r.id, name: r.name }));
}

export async function getExpenses(): Promise<Expense[]> {
  const expRes = await sql<{
    id: string;
    description: string;
    amount: string;
    paid_by: string;
    paid_by_name: string;
    split_type: string;
    created_at: string;
  }>`
    SELECT e.id, e.description, e.amount, e.paid_by,
           m.name AS paid_by_name, e.split_type, e.created_at
    FROM expenses e
    JOIN members m ON m.id = e.paid_by
    ORDER BY e.created_at DESC
  `;
  if (expRes.rows.length === 0) return [];

  const ids = expRes.rows.map((r) => r.id);
  const shareRes = await sql<{
    expense_id: string;
    member_id: string;
    name: string;
    share: string;
  }>`
    SELECT es.expense_id, es.member_id, m.name, es.share
    FROM expense_shares es
    JOIN members m ON m.id = es.member_id
    WHERE es.expense_id = ANY(${ids})
  `;

  const sharesByExpense = new Map<string, Expense["shares"]>();
  for (const s of shareRes.rows) {
    const arr = sharesByExpense.get(s.expense_id) ?? [];
    arr.push({ memberId: s.member_id, name: s.name, share: Number(s.share) });
    sharesByExpense.set(s.expense_id, arr);
  }

  return expRes.rows.map((r) => ({
    id: r.id,
    description: r.description,
    amount: Number(r.amount),
    paidBy: r.paid_by,
    paidByName: r.paid_by_name,
    splitType: r.split_type as SplitType,
    createdAt: r.created_at,
    shares: sharesByExpense.get(r.id) ?? [],
  }));
}

export async function getSettlements(): Promise<Settlement[]> {
  const res = await sql<{
    id: string;
    from_member: string;
    from_name: string;
    to_member: string;
    to_name: string;
    amount: string;
    created_at: string;
  }>`
    SELECT s.id, s.from_member, fm.name AS from_name,
           s.to_member, tm.name AS to_name, s.amount, s.created_at
    FROM settlements s
    JOIN members fm ON fm.id = s.from_member
    JOIN members tm ON tm.id = s.to_member
    ORDER BY s.created_at DESC
  `;
  return res.rows.map((r) => ({
    id: r.id,
    fromMember: r.from_member,
    fromName: r.from_name,
    toMember: r.to_member,
    toName: r.to_name,
    amount: Number(r.amount),
    createdAt: r.created_at,
  }));
}
