import { sql } from "./db";
import { splitEqually, splitByPercent, splitByParts } from "./balances";
import type { SplitType } from "./types";

// value: cents (exact) | percent (percent) | parts count (parts)
export type SharePayload = { memberId: string; value: number };

export type ExpenseBody = {
  description?: string;
  amount?: number; // cents
  paidBy?: string;
  splitType?: SplitType;
  participants?: string[]; // for 'equal'
  shares?: SharePayload[]; // for 'exact' (cents) / 'percent' (%)
};

export type ParsedExpense = {
  description: string;
  amount: number;
  paidBy: string;
  splitType: SplitType;
  shareMap: Map<string, number>; // memberId -> cents
};

// Validate + normalize an expense body into the fields and per-member cent
// shares to persist. Returns either the parsed result or an error message +
// HTTP status. Shared by POST (create) and PATCH (edit) so the rules stay in
// one place.
export async function parseExpenseBody(
  body: ExpenseBody,
): Promise<{ ok: true; value: ParsedExpense } | { ok: false; error: string; status: number }> {
  const description = (body.description ?? "").trim();
  const amount = Math.round(Number(body.amount));
  const paidBy = body.paidBy ?? "";
  const splitType: SplitType = body.splitType ?? "equal";

  if (!description) return { ok: false, error: "Description required", status: 400 };
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "Amount must be greater than 0", status: 400 };
  }
  if (!paidBy) return { ok: false, error: "Select who paid", status: 400 };

  let shareMap = new Map<string, number>();
  if (splitType === "equal") {
    const participants = body.participants ?? [];
    if (participants.length === 0) {
      return { ok: false, error: "Select at least one participant", status: 400 };
    }
    shareMap = splitEqually(amount, participants);
  } else if (splitType === "exact") {
    const shares = body.shares ?? [];
    for (const s of shares) shareMap.set(s.memberId, Math.round(s.value));
    const sum = [...shareMap.values()].reduce((a, b) => a + b, 0);
    if (sum !== amount) {
      return {
        ok: false,
        error: `Exact shares must sum to the total (got ${sum} of ${amount} cents)`,
        status: 400,
      };
    }
  } else if (splitType === "percent") {
    const shares = body.shares ?? [];
    const totalPct = shares.reduce((a, b) => a + b.value, 0);
    if (Math.round(totalPct) !== 100) {
      return { ok: false, error: `Percentages must sum to 100 (got ${totalPct})`, status: 400 };
    }
    shareMap = splitByPercent(
      amount,
      shares.map((s) => ({ memberId: s.memberId, percent: s.value })),
    );
  } else if (splitType === "parts") {
    // value = number of ratio parts per member; app divides the total by them.
    const shares = body.shares ?? [];
    const totalParts = shares.reduce((a, b) => a + Math.max(0, b.value), 0);
    if (totalParts <= 0) {
      return { ok: false, error: "Give at least one person a share", status: 400 };
    }
    shareMap = splitByParts(
      amount,
      shares.map((s) => ({ memberId: s.memberId, parts: s.value })),
    );
  } else {
    return { ok: false, error: "Unknown split type", status: 400 };
  }

  // Verify all participants are real members.
  const memberIds = [...shareMap.keys()];
  const check = await sql`
    SELECT count(*)::int AS n FROM members WHERE id = ANY(${memberIds})
  `;
  if (Number(check.rows[0].n) !== memberIds.length) {
    return { ok: false, error: "All participants must be real people", status: 400 };
  }

  // Must be split with at least one person other than the payer, otherwise it
  // nets to zero and changes no balances (e.g. paying yourself).
  const hasOtherParticipant = [...shareMap.entries()].some(
    ([memberId, share]) => share > 0 && memberId !== paidBy,
  );
  if (!hasOtherParticipant) {
    return { ok: false, error: "Split this with at least one other person", status: 400 };
  }

  return { ok: true, value: { description, amount, paidBy, splitType, shareMap } };
}
