"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { LoginScreen } from "@/components/LoginScreen";
import { TopBar } from "@/components/TopBar";
import { AddExpenseModal } from "@/components/AddExpenseModal";
import { SettleUpModal } from "@/components/SettleUpModal";
import { Spinner } from "@/components/Spinner";
import { Skeleton } from "@/components/Skeleton";
import { api } from "@/lib/api";
import { formatCents } from "@/lib/money";
import type {
  Member,
  Expense,
  Settlement,
  MemberBalance,
  Transfer,
} from "@/lib/types";

type Snapshot = {
  members: Member[];
  expenses: Expense[];
  settlements: Settlement[];
  balances: MemberBalance[];
  transfers: Transfer[];
};

// Merge expenses + settlements into one reverse-chronological feed.
type FeedItem =
  | { kind: "expense"; at: string; data: Expense }
  | { kind: "settlement"; at: string; data: Settlement };

export default function HomePage() {
  const { member, loading } = useAuth();
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [loadingSnap, setLoadingSnap] = useState(true);
  const [showExpense, setShowExpense] = useState(false);
  const [showSettle, setShowSettle] = useState(false);
  const [settlePrefill, setSettlePrefill] = useState<Transfer | null>(null);
  const [mineOnly, setMineOnly] = useState(false);

  const load = useCallback(() => {
    setLoadingSnap(true);
    api<Snapshot>("/api/ledger")
      .then((res) => setSnap(res))
      .catch(() => setSnap(null))
      .finally(() => setLoadingSnap(false));
  }, []);

  useEffect(() => {
    if (member) load();
  }, [member, load]);

  async function deleteExpense(expenseId: string) {
    if (!confirm("Delete this expense?")) return;
    await api(`/api/expenses/${expenseId}`, { method: "DELETE" }).catch(() => {});
    load();
  }

  async function deleteSettlement(settlementId: string) {
    if (!confirm("Remove this payment?")) return;
    await api(`/api/settlements/${settlementId}`, { method: "DELETE" }).catch(() => {});
    load();
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-ink-300">
        <Spinner size={28} />
      </div>
    );
  }
  if (!member) return <LoginScreen />;

  if (loadingSnap || !snap) {
    return (
      <>
        <TopBar />
        <main className="mx-auto max-w-3xl px-safe py-6 pb-36">
          {/* Standing card */}
          <div className="card mb-4 space-y-4 p-5">
            <Skeleton className="h-6 w-2/3" />
            <div className="space-y-2.5">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
            </div>
          </div>

          {/* Activity heading + rows */}
          <Skeleton className="mb-3 mt-6 h-4 w-20" />
          <div className="grid gap-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="card flex items-center gap-3 p-3.5">
                <Skeleton className="h-10 w-10 rounded-lg" />
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
                <Skeleton className="h-4 w-12" />
              </div>
            ))}
          </div>
        </main>
      </>
    );
  }

  const myBalance = snap.balances.find((b) => b.memberId === member.id)?.net ?? 0;
  const nameOf = (mid: string) => snap.members.find((m) => m.id === mid)?.name ?? "Someone";

  // An item "pertains to you" if you paid for it, owe a share of it, or are a
  // party to the settlement.
  const involvesMe = (item: FeedItem) =>
    item.kind === "expense"
      ? item.data.paidBy === member.id ||
        item.data.shares.some((s) => s.memberId === member.id)
      : item.data.fromMember === member.id || item.data.toMember === member.id;

  const feed: FeedItem[] = [
    ...snap.expenses.map((e) => ({ kind: "expense" as const, at: e.createdAt, data: e })),
    ...snap.settlements.map((s) => ({ kind: "settlement" as const, at: s.createdAt, data: s })),
  ]
    .filter((item) => !mineOnly || involvesMe(item))
    .sort((a, b) => (a.at < b.at ? 1 : -1));

  const settledUp = snap.transfers.length === 0;

  return (
    <>
      <TopBar />
      <main className="mx-auto max-w-3xl px-safe py-6 pb-36">
        {/* Your standing */}
        {myBalance === 0 ? (
          <p className="mb-4 py-2 text-center text-lg text-ink-200">
            You&apos;re all settled up 🎉
          </p>
        ) : (
          <div className="card mb-4 p-5">
            {myBalance > 0 ? (
              <p className="text-lg">
                Overall, you are owed{" "}
                <span className="font-bold text-brand-400">{formatCents(myBalance)}</span>
              </p>
            ) : (
              <p className="text-lg">
                Overall, you owe{" "}
                <span className="font-bold text-red-400">{formatCents(-myBalance)}</span>
              </p>
            )}

            {/* Per-person balances */}
            <div className="mt-4 grid gap-1.5">
              {snap.balances
                .filter((b) => b.memberId !== member.id && b.net !== 0)
                .sort((a, b) => b.net - a.net)
                .map((b) => (
                  <div key={b.memberId} className="flex items-center justify-between text-sm">
                    <span className="text-ink-200">{b.name}</span>
                    <span className={b.net > 0 ? "text-brand-400" : "text-red-400"}>
                      {b.net > 0 ? "is owed " : "owes "}
                      {formatCents(Math.abs(b.net))}
                    </span>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Suggested settle-up plan */}
        {!settledUp && (
          <div className="card mb-4 p-4">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-200">
              Simplest way to settle up
            </h2>
            <div className="grid gap-2">
              {snap.transfers.map((t, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setSettlePrefill(t);
                    setShowSettle(true);
                  }}
                  className="flex items-center justify-between rounded-xl bg-ink-900/40 px-3 py-2.5 text-left transition-colors hover:bg-ink-700/50"
                >
                  <span className="text-sm">
                    <span className="font-medium text-ink-100">{t.fromName}</span>
                    <span className="text-ink-300"> pays </span>
                    <span className="font-medium text-ink-100">{t.toName}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="font-semibold text-brand-300">{formatCents(t.amount)}</span>
                    <span className="text-lg leading-none text-ink-400">›</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Activity feed */}
        <div className="mb-3 mt-6 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-200">Activity</h2>
          <div className="flex rounded-lg bg-ink-800 p-0.5 text-xs font-medium">
            {([
              { key: false, label: "All" },
              { key: true, label: "Just me" },
            ] as const).map((opt) => (
              <button
                key={opt.label}
                type="button"
                onClick={() => setMineOnly(opt.key)}
                className={`rounded-md px-2.5 py-1 transition-colors ${
                  mineOnly === opt.key
                    ? "bg-brand-500/15 text-brand-200"
                    : "text-ink-300 hover:text-ink-100"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        {feed.length === 0 ? (
          <p className="p-8 text-center text-ink-300">
            {mineOnly ? "Nothing involving you yet." : "No expenses yet. Add the first one!"}
          </p>
        ) : (
          <div className="grid gap-2">
            {feed.map((item) =>
              item.kind === "expense" ? (
                <div key={item.data.id} className="card flex items-center gap-3 p-3.5">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-ink-700 text-lg">
                    🧾
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{item.data.description}</div>
                    <div className="text-xs text-ink-300">
                      {item.data.paidByName} paid {formatCents(item.data.amount)} ·{" "}
                      {splitLabel(item.data, member.id, nameOf)}
                    </div>
                  </div>
                  <button
                    onClick={() => deleteExpense(item.data.id)}
                    className="text-ink-400 hover:text-red-400"
                    aria-label="Delete expense"
                    title="Delete"
                  >
                    🗑
                  </button>
                </div>
              ) : (
                <div
                  key={item.data.id}
                  className="card flex items-center gap-3 p-3.5"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-500/15 text-lg">
                    💵
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">
                      {item.data.fromName} paid {item.data.toName}
                    </div>
                    <div className="text-xs text-ink-300">Settlement</div>
                  </div>
                  <span className="font-semibold text-brand-300">
                    {formatCents(item.data.amount)}
                  </span>
                  <button
                    onClick={() => deleteSettlement(item.data.id)}
                    className="text-ink-400 hover:text-red-400"
                    aria-label="Remove payment"
                    title="Remove"
                  >
                    🗑
                  </button>
                </div>
              ),
            )}
          </div>
        )}
      </main>

      {/* Thumb-reachable action bar, pinned above the home indicator. */}
      <div className="fixed inset-x-0 bottom-0 z-30 px-safe pb-safe pt-3">
        <div className="mx-auto grid max-w-3xl grid-cols-2 gap-3">
          <button onClick={() => setShowExpense(true)} className="btn-primary">
            + Add expense
          </button>
          <button
            onClick={() => {
              setSettlePrefill(null);
              setShowSettle(true);
            }}
            className="btn-ghost"
          >
            Settle up
          </button>
        </div>
      </div>

      <AddExpenseModal
        open={showExpense}
        onClose={() => setShowExpense(false)}
        onSaved={load}
        members={snap.members}
        meId={member.id}
      />
      <SettleUpModal
        open={showSettle}
        onClose={() => setShowSettle(false)}
        onSaved={load}
        members={snap.members}
        meId={member.id}
        prefill={settlePrefill}
      />
    </>
  );
}

// Short "your share" label for an expense row.
function splitLabel(
  e: Expense,
  meId: string,
  _nameOf: (id: string) => string,
): string {
  const mine = e.shares.find((s) => s.memberId === meId);
  if (e.paidBy === meId) {
    const lent = e.amount - (mine?.share ?? 0);
    return lent > 0 ? `you lent ${formatCents(lent)}` : `your expense`;
  }
  if (mine) return `you owe ${formatCents(mine.share)}`;
  return `you're not in this one`;
}
