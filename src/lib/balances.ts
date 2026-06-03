import type { Expense, Settlement, MemberBalance, Transfer } from "./types";

/**
 * Compute each member's net position within a group (in cents).
 *
 *   net = (total this member paid out)        // expenses they fronted
 *       - (total this member owed as shares)   // their portion of all expenses
 *       + (settlements they paid to others)    // paying down a debt increases net
 *       - (settlements they received)          // receiving reduces net
 *
 * A positive net means the group owes this member money; negative means they owe.
 * The sum of all nets is always zero.
 */
export function computeBalances(
  members: { id: string; name: string }[],
  expenses: Expense[],
  settlements: Settlement[],
): MemberBalance[] {
  const net = new Map<string, number>();
  const names = new Map<string, string>();
  for (const m of members) {
    net.set(m.id, 0);
    names.set(m.id, m.name);
  }

  const bump = (id: string, delta: number) => {
    net.set(id, (net.get(id) ?? 0) + delta);
  };

  for (const e of expenses) {
    // The payer fronted the full amount.
    bump(e.paidBy, e.amount);
    // Everyone owes their share.
    for (const s of e.shares) {
      bump(s.memberId, -s.share);
    }
  }

  for (const s of settlements) {
    // Paying someone back settles part of what you owe → your net goes up.
    bump(s.fromMember, s.amount);
    bump(s.toMember, -s.amount);
  }

  return Array.from(net.entries()).map(([memberId, value]) => ({
    memberId,
    name: names.get(memberId) ?? "Unknown",
    net: value,
  }));
}

/**
 * Greedy min-cash-flow simplification: produce a small set of transfers that
 * settles everyone. Not provably minimal (that's NP-hard) but near-optimal and
 * what Splitwise effectively does. Operates on integer cents so it's exact.
 */
export function simplify(balances: MemberBalance[]): Transfer[] {
  const nameOf = new Map(balances.map((b) => [b.memberId, b.name]));

  // Creditors (owed money) and debtors (owe money), as mutable heaps-ish arrays.
  const creditors = balances
    .filter((b) => b.net > 0)
    .map((b) => ({ id: b.memberId, amt: b.net }));
  const debtors = balances
    .filter((b) => b.net < 0)
    .map((b) => ({ id: b.memberId, amt: -b.net }));

  // Largest first keeps the transfer count low.
  creditors.sort((a, b) => b.amt - a.amt);
  debtors.sort((a, b) => b.amt - a.amt);

  const transfers: Transfer[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const d = debtors[i];
    const c = creditors[j];
    const pay = Math.min(d.amt, c.amt);
    if (pay > 0) {
      transfers.push({
        from: d.id,
        fromName: nameOf.get(d.id) ?? "Unknown",
        to: c.id,
        toName: nameOf.get(c.id) ?? "Unknown",
        amount: pay,
      });
    }
    d.amt -= pay;
    c.amt -= pay;
    if (d.amt === 0) i++;
    if (c.amt === 0) j++;
  }
  return transfers;
}

/**
 * Split a total (in cents) into N shares as evenly as possible, distributing
 * the leftover cents to the first members so the shares always sum to total.
 */
export function splitEqually(totalCents: number, memberIds: string[]): Map<string, number> {
  const n = memberIds.length;
  const out = new Map<string, number>();
  if (n === 0) return out;
  const base = Math.floor(totalCents / n);
  let remainder = totalCents - base * n;
  for (const id of memberIds) {
    const extra = remainder > 0 ? 1 : 0;
    out.set(id, base + extra);
    if (remainder > 0) remainder--;
  }
  return out;
}

/** Convert a percentage map (must sum to 100) into cent shares summing to total. */
export function splitByPercent(
  totalCents: number,
  percents: { memberId: string; percent: number }[],
): Map<string, number> {
  const out = new Map<string, number>();
  let allocated = 0;
  for (const p of percents) {
    const share = Math.round((totalCents * p.percent) / 100);
    out.set(p.memberId, share);
    allocated += share;
  }
  // Push any rounding drift onto the largest share so the sum is exact.
  const drift = totalCents - allocated;
  if (drift !== 0 && percents.length > 0) {
    let largest = percents[0].memberId;
    for (const p of percents) {
      if ((out.get(p.memberId) ?? 0) > (out.get(largest) ?? 0)) largest = p.memberId;
    }
    out.set(largest, (out.get(largest) ?? 0) + drift);
  }
  return out;
}
