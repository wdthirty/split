import { sql } from "./db";
import type { Expense, Settlement, Member, SplitType } from "./types";

// Whether a member belongs to a group (authorization gate for group data).
export async function isGroupMember(groupId: string, memberId: string): Promise<boolean> {
  const res = await sql`
    SELECT 1 FROM group_members WHERE group_id = ${groupId} AND member_id = ${memberId} LIMIT 1
  `;
  return res.rows.length > 0;
}

export async function getGroupMembers(groupId: string): Promise<Member[]> {
  const res = await sql<{ id: string; name: string }>`
    SELECT m.id, m.name
    FROM group_members gm
    JOIN members m ON m.id = gm.member_id
    WHERE gm.group_id = ${groupId}
    ORDER BY m.name ASC
  `;
  return res.rows.map((r) => ({ id: r.id, name: r.name }));
}

export async function getExpenses(groupId: string): Promise<Expense[]> {
  const expRes = await sql<{
    id: string;
    group_id: string;
    description: string;
    amount: string;
    paid_by: string;
    paid_by_name: string;
    split_type: string;
    created_at: string;
  }>`
    SELECT e.id, e.group_id, e.description, e.amount, e.paid_by,
           m.name AS paid_by_name, e.split_type, e.created_at
    FROM expenses e
    JOIN members m ON m.id = e.paid_by
    WHERE e.group_id = ${groupId}
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
    groupId: r.group_id,
    description: r.description,
    amount: Number(r.amount),
    paidBy: r.paid_by,
    paidByName: r.paid_by_name,
    splitType: r.split_type as SplitType,
    createdAt: r.created_at,
    shares: sharesByExpense.get(r.id) ?? [],
  }));
}

export async function getSettlements(groupId: string): Promise<Settlement[]> {
  const res = await sql<{
    id: string;
    group_id: string;
    from_member: string;
    from_name: string;
    to_member: string;
    to_name: string;
    amount: string;
    created_at: string;
  }>`
    SELECT s.id, s.group_id, s.from_member, fm.name AS from_name,
           s.to_member, tm.name AS to_name, s.amount, s.created_at
    FROM settlements s
    JOIN members fm ON fm.id = s.from_member
    JOIN members tm ON tm.id = s.to_member
    WHERE s.group_id = ${groupId}
    ORDER BY s.created_at DESC
  `;
  return res.rows.map((r) => ({
    id: r.id,
    groupId: r.group_id,
    fromMember: r.from_member,
    fromName: r.from_name,
    toMember: r.to_member,
    toName: r.to_name,
    amount: Number(r.amount),
    createdAt: r.created_at,
  }));
}
