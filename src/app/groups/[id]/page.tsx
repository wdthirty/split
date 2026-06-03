"use client";

import { useCallback, useEffect, useState, use } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { LoginScreen } from "@/components/LoginScreen";
import { TopBar } from "@/components/TopBar";
import { AddExpenseModal } from "@/components/AddExpenseModal";
import { SettleUpModal } from "@/components/SettleUpModal";
import { AddPeopleModal } from "@/components/AddPeopleModal";
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
  group: { id: string; name: string; emoji: string };
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

export default function GroupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { member, loading } = useAuth();
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [loadingSnap, setLoadingSnap] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [showExpense, setShowExpense] = useState(false);
  const [showSettle, setShowSettle] = useState(false);
  const [showAddPeople, setShowAddPeople] = useState(false);
  const [settlePrefill, setSettlePrefill] = useState<Transfer | null>(null);

  const load = useCallback(() => {
    setLoadingSnap(true);
    api<Snapshot>(`/api/groups/${id}`)
      .then((res) => {
        setSnap(res);
        setNotFound(false);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoadingSnap(false));
  }, [id]);

  useEffect(() => {
    if (member) load();
  }, [member, load]);

  async function deleteExpense(expenseId: string) {
    if (!confirm("Delete this expense?")) return;
    await api(`/api/groups/${id}/expenses/${expenseId}`, { method: "DELETE" }).catch(() => {});
    load();
  }

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-ink-300">Loading…</div>;
  }
  if (!member) return <LoginScreen />;

  if (notFound) {
    return (
      <>
        <TopBar />
        <main className="mx-auto max-w-3xl px-4 py-10 text-center">
          <p className="mb-4 text-ink-200">This group doesn&apos;t exist or you&apos;re not in it.</p>
          <Link href="/" className="btn-primary">
            Back to groups
          </Link>
        </main>
      </>
    );
  }

  if (loadingSnap || !snap) {
    return (
      <>
        <TopBar />
        <main className="mx-auto max-w-3xl px-4 py-10 text-ink-300">Loading group…</main>
      </>
    );
  }

  const myBalance = snap.balances.find((b) => b.memberId === member.id)?.net ?? 0;
  const nameOf = (mid: string) => snap.members.find((m) => m.id === mid)?.name ?? "Someone";

  const feed: FeedItem[] = [
    ...snap.expenses.map((e) => ({ kind: "expense" as const, at: e.createdAt, data: e })),
    ...snap.settlements.map((s) => ({ kind: "settlement" as const, at: s.createdAt, data: s })),
  ].sort((a, b) => (a.at < b.at ? 1 : -1));

  const settledUp = snap.transfers.length === 0;

  return (
    <>
      <TopBar />
      <main className="mx-auto max-w-3xl px-4 py-6 px-safe pb-36">
        {/* Header */}
        <div className="mb-5 flex items-center gap-3">
          <Link href="/" className="text-ink-300 hover:text-ink-100">
            ‹
          </Link>
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-ink-700 text-2xl">
            {snap.group.emoji}
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-bold">{snap.group.name}</h1>
            <button
              onClick={() => setShowAddPeople(true)}
              className="text-sm text-ink-300 hover:text-brand-300"
            >
              {snap.members.map((m) => m.name).join(", ")} · + add
            </button>
          </div>
        </div>

        {/* Your standing */}
        <div className="card mb-4 p-5">
          {myBalance > 0 ? (
            <p className="text-lg">
              Overall, you are owed{" "}
              <span className="font-bold text-brand-400">{formatCents(myBalance)}</span>
            </p>
          ) : myBalance < 0 ? (
            <p className="text-lg">
              Overall, you owe{" "}
              <span className="font-bold text-red-400">{formatCents(-myBalance)}</span>
            </p>
          ) : (
            <p className="text-lg text-ink-200">You&apos;re all settled up 🎉</p>
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
                  className="flex items-center justify-between rounded-xl border border-ink-500/60 bg-ink-900/40 px-3 py-2.5 text-left transition-colors hover:border-brand-500/60"
                >
                  <span className="text-sm">
                    <span className="font-medium text-ink-100">{t.fromName}</span>
                    <span className="text-ink-300"> pays </span>
                    <span className="font-medium text-ink-100">{t.toName}</span>
                  </span>
                  <span className="font-semibold text-brand-300">{formatCents(t.amount)}</span>
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-ink-300">Tap a row to record that payment.</p>
          </div>
        )}

        {/* Activity feed */}
        <h2 className="mb-3 mt-6 text-sm font-semibold uppercase tracking-wide text-ink-200">
          Activity
        </h2>
        {feed.length === 0 ? (
          <div className="card p-8 text-center text-ink-300">
            No expenses yet. Add the first one!
          </div>
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
                </div>
              ),
            )}
          </div>
        )}
      </main>

      {/* Thumb-reachable action bar, pinned above the home indicator. */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-ink-600/70 bg-ink-900/90 pb-safe px-safe backdrop-blur">
        <div className="mx-auto grid max-w-3xl grid-cols-2 gap-3 px-4 py-3">
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
        groupId={id}
        members={snap.members}
        meId={member.id}
      />
      <SettleUpModal
        open={showSettle}
        onClose={() => setShowSettle(false)}
        onSaved={load}
        groupId={id}
        members={snap.members}
        meId={member.id}
        prefill={settlePrefill}
      />
      <AddPeopleModal
        open={showAddPeople}
        onClose={() => setShowAddPeople(false)}
        onSaved={load}
        groupId={id}
        currentMemberIds={snap.members.map((m) => m.id)}
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
