import { NextResponse } from "next/server";
import { currentMemberId } from "@/lib/auth";
import { getAllMembers, getExpenses, getSettlements } from "@/lib/queries";
import { computeBalances, simplify } from "@/lib/balances";

// Full snapshot of the shared ledger: members, expenses, settlements,
// balances, transfers. Any logged-in member sees the whole ledger.
export async function GET() {
  const me = await currentMemberId();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [members, expenses, settlements] = await Promise.all([
    getAllMembers(),
    getExpenses(),
    getSettlements(),
  ]);

  const balances = computeBalances(members, expenses, settlements);
  const transfers = simplify(balances);

  return NextResponse.json({ members, expenses, settlements, balances, transfers });
}
