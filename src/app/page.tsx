"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { LoginScreen } from "@/components/LoginScreen";
import { TopBar } from "@/components/TopBar";
import { AddExpenseModal } from "@/components/AddExpenseModal";
import { SettleUpModal } from "@/components/SettleUpModal";
import { Confetti } from "@/components/Confetti";
import { NameTag } from "@/components/NameTag";
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

// My direct tab with each other person: +ve => they owe me, -ve => I owe them.
// Built only from expenses/settlements that involve me, so it never exposes
// what other people owe each other — these are the true pairwise amounts.
type PairTab = { memberId: string; name: string; net: number };

function pairwiseWithMe(
  meId: string,
  members: Member[],
  expenses: Expense[],
  settlements: Settlement[],
): PairTab[] {
  const net = new Map<string, number>(); // otherId -> cents they owe me
  const bump = (other: string, delta: number) =>
    net.set(other, (net.get(other) ?? 0) + delta);

  for (const e of expenses) {
    if (e.paidBy === meId) {
      // I fronted it; each other person's share is owed to me.
      for (const s of e.shares) {
        if (s.memberId !== meId) bump(s.memberId, s.share);
      }
    } else {
      // Someone else fronted it; if I have a share, I owe the payer that much.
      const myShare = e.shares.find((s) => s.memberId === meId)?.share ?? 0;
      if (myShare > 0) bump(e.paidBy, -myShare);
    }
  }

  for (const s of settlements) {
    // Only settlements I'm a party to affect my tabs.
    if (s.fromMember === meId) bump(s.toMember, s.amount);
    else if (s.toMember === meId) bump(s.fromMember, -s.amount);
  }

  const nameOf = new Map(members.map((m) => [m.id, m.name]));
  return Array.from(net.entries())
    .filter(([, cents]) => cents !== 0)
    .map(([memberId, cents]) => ({
      memberId,
      name: nameOf.get(memberId) ?? "Someone",
      net: cents,
    }))
    .sort((a, b) => b.net - a.net);
}

// The real, signed pairwise debts across the WHOLE group. Returns a map keyed
// "smallerId|largerId" -> net cents flowing from larger→smaller (sign encodes
// direction). Used both to count raw debts and to tell whether a simplified
// transfer matches an actual debt or is being routed on someone's behalf.
function pairwiseDebts(
  expenses: Expense[],
  settlements: Settlement[],
): Map<string, number> {
  const pair = new Map<string, number>();
  const key = (x: string, y: string) => (x < y ? `${x}|${y}` : `${y}|${x}`);
  const bump = (debtor: string, creditor: string, amt: number) => {
    const k = key(debtor, creditor);
    // Positive contribution means flow toward the lexically-smaller id.
    const signed = debtor < creditor ? -amt : amt;
    pair.set(k, (pair.get(k) ?? 0) + signed);
  };

  for (const e of expenses) {
    for (const s of e.shares) {
      if (s.memberId !== e.paidBy && s.share > 0) bump(s.memberId, e.paidBy, s.share);
    }
  }
  // A settlement's `fromMember` PAID `toMember`, which reduces what `from` owes —
  // i.e. `from` is the creditor here, `to` the debtor. (Same convention as
  // computeBalances in balances.ts.) So the debt flows to → from.
  for (const s of settlements) bump(s.toMember, s.fromMember, s.amount);
  return pair;
}

// How much `debtor` actually owes `creditor` directly (cents), 0 if they don't
// owe in that direction. Reads the signed pairwise map above.
function directDebt(pair: Map<string, number>, debtor: string, creditor: string): number {
  const k = debtor < creditor ? `${debtor}|${creditor}` : `${creditor}|${debtor}`;
  const v = pair.get(k) ?? 0;
  // v is flow toward the smaller id. debtor owes creditor when flow points
  // from debtor to creditor: i.e. toward creditor.
  const towardCreditor = creditor < debtor ? v : -v;
  return towardCreditor > 0 ? towardCreditor : 0;
}

export default function HomePage() {
  const { member, loading } = useAuth();
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [loadingSnap, setLoadingSnap] = useState(true);
  const [showExpense, setShowExpense] = useState(false);
  const [showSettle, setShowSettle] = useState(false);
  const [settlePrefill, setSettlePrefill] = useState<Transfer | null>(null);
  // When set, the corresponding modal is open in edit mode for this item.
  const [editExpense, setEditExpense] = useState<Expense | null>(null);
  const [editSettlement, setEditSettlement] = useState<Settlement | null>(null);
  // null = no confetti; "normal" = a payment was recorded; "big" = that payment
  // cleared your last debt (you're fully settled up).
  const [confetti, setConfetti] = useState<null | "normal" | "big">(null);

  const load = useCallback(async (): Promise<Snapshot | null> => {
    setLoadingSnap(true);
    try {
      const res = await api<Snapshot>("/api/ledger");
      setSnap(res);
      return res;
    } catch {
      setSnap(null);
      return null;
    } finally {
      setLoadingSnap(false);
    }
  }, []);

  useEffect(() => {
    if (member) load();
  }, [member, load]);

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

  // An item "pertains to you" if you paid for it, owe a share of it, or are a
  // party to the settlement.
  const involvesMe = (item: FeedItem) =>
    item.kind === "expense"
      ? item.data.paidBy === member.id ||
        item.data.shares.some((s) => s.memberId === member.id)
      : item.data.fromMember === member.id || item.data.toMember === member.id;

  // Activity only ever shows what involves you (privacy — no group-wide feed).
  const feed: FeedItem[] = [
    ...snap.expenses.map((e) => ({ kind: "expense" as const, at: e.createdAt, data: e })),
    ...snap.settlements.map((s) => ({ kind: "settlement" as const, at: s.createdAt, data: s })),
  ]
    .filter((item) => involvesMe(item))
    .sort((a, b) => (a.at < b.at ? 1 : -1));

  // My true pairwise tabs (who owes me / I owe, exact amounts, nothing leaked).
  const myTabs = pairwiseWithMe(member.id, snap.members, snap.expenses, snap.settlements);
  // How many distinct people I still owe — drives the settle-up badge.
  const iOweCount = myTabs.filter((t) => t.net < 0).length;

  // The fewest-payments plan, but only the transfers I'm actually part of, so I
  // don't see settle-up steps between other people.
  const myTransfers = snap.transfers.filter(
    (t) => t.from === member.id || t.to === member.id,
  );
  const settledUp = myTransfers.length === 0;

  // For the "how is this simplest?" explainer: pay-each-tab count vs. the
  // optimized plan count, plus per-transfer "on behalf of" detection.
  const pairDebts = pairwiseDebts(snap.expenses, snap.settlements);
  const rawDebtCount = Array.from(pairDebts.values()).filter((v) => v !== 0).length;
  const planCount = snap.transfers.length;
  const paymentsSaved = Math.max(0, rawDebtCount - planCount);

  // Annotate each simplified transfer from MY perspective. The optimizer reroutes
  // debts, so a payment often isn't a plain payer-owes-receiver. What matters to
  // me is two things: does the payer owe ME, and do I owe the receiver?
  //   - payer owes me + I owe receiver  -> they're paying MY debt (via my credit)
  //   - payer owes me + receiver is me  -> they're just paying me
  //   - receiver is me + payer doesn't owe me -> paying on my behalf (routed to me)
  const planRows = snap.transfers.map((t) => {
    const payerOwesMe = directDebt(pairDebts, t.from, member.id);
    const iOweReceiver = directDebt(pairDebts, member.id, t.to);
    const payerOwesReceiver = directDebt(pairDebts, t.from, t.to); // payer's OWN debt
    let note: string | null = null;
    if (t.to === member.id) {
      // Money coming to me: a real debt they owe me, or routed on my behalf.
      note =
        payerOwesMe > 1
          ? `${t.fromName} is paying you directly`
          : `${t.fromName} is paying on your behalf`;
    } else if (payerOwesMe > 1 && iOweReceiver > 1) {
      // My debtor (payer owes me) is paying someone I also owe, so my portion is
      // folded in. Be explicit about whose debt this mostly is:
      if (payerOwesReceiver > 1) {
        // Payer owes the receiver too -> it's mostly THEIR debt, plus mine.
        note = `${t.fromName} is paying their own debt to ${t.toName}, including your ${formatCents(iOweReceiver)}`;
      } else {
        // Payer doesn't owe the receiver -> it's purely my debt, routed through.
        note = `${t.fromName} is paying your ${formatCents(iOweReceiver)} debt to ${t.toName}`;
      }
    } else if (t.from === member.id && iOweReceiver <= 1) {
      // I'm fronting a payment to someone I don't directly owe.
      note = `you're covering what others owe ${t.toName}`;
    }
    return { ...t, note };
  });

  return (
    <>
      <TopBar />
      <main className="mx-auto max-w-3xl px-safe py-6 pb-36">
        {/* Your standing */}
        {myBalance === 0 ? (
          <p className="card mb-4 p-5 text-center text-lg text-ink-200">
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

            {/* Your tabs — true pairwise amounts with each person. */}
            <div className="mt-4 grid gap-1.5">
              {myTabs.map((b) => (
                <div key={b.memberId} className="flex items-center justify-between text-sm">
                  <NameTag name={b.name} variant="underline" />
                  <span className={b.net > 0 ? "text-brand-400" : "text-red-400"}>
                    {b.net > 0 ? "owes you " : "you owe "}
                    {formatCents(Math.abs(b.net))}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Suggested settle-up plan — collapsed by default. It's a global
            fewest-payments shortcut, so its amounts can differ from the exact
            tabs above; tuck it behind a toggle so the true tabs lead. */}
        {!settledUp && (
          <details className="card group mb-4 p-4">
            <summary className="flex cursor-pointer list-none items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-200">
                Simplest way to settle up
              </h2>
              <span className="text-lg leading-none text-ink-400 transition-transform group-open:rotate-90">
                ›
              </span>
            </summary>
            <p className="mt-2 text-xs text-ink-300">
              A shortcut to clear everything in the fewest payments — amounts may
              differ from your exact tabs above.
            </p>

            {/* Nested "how does this work?" explainer. Shows the FULL group plan
                (all parties, real names + amounts) so it's a concrete breakdown
                of who pays whom for the fewest total payments. */}
            {paymentsSaved > 0 && (
              <details className="group/explain mt-3 rounded-xl bg-ink-900/40 p-3">
                <summary className="flex cursor-pointer list-none items-center justify-between text-xs font-medium text-ink-200">
                  How is this the simplest way?
                  <span className="text-lg leading-none text-ink-400 transition-transform group-open/explain:rotate-90">
                    ›
                  </span>
                </summary>

                <p className="mt-2 text-xs leading-relaxed text-ink-300">
                  <span className="font-semibold text-brand-300">{planCount}</span> payments
                  instead of <span className="font-semibold text-ink-100">{rawDebtCount}</span>.
                </p>

                {/* Concrete breakdown: every transfer in the simplified plan.
                    Fixed grid columns keep arrows + amounts aligned down the
                    list; rows where the payer is covering someone else's debt
                    are flagged "on behalf". */}
                <p className="mb-1.5 mt-3 text-[11px] font-medium uppercase tracking-wide text-ink-400">
                  The {planCount} payments
                </p>
                <div className="grid gap-1.5">
                  {planRows.map((t, i) => (
                    <div key={i}>
                      <div className="grid grid-cols-[auto_auto_auto_1fr] items-center gap-2 text-sm">
                        <span className="truncate">
                          <NameTag name={t.fromName} variant="underline" isMe={t.from === member.id} />
                        </span>
                        <svg viewBox="0 0 24 12" className="h-2.5 w-6 text-brand-300" aria-hidden="true">
                          <path
                            d="M0 6h21M16 1l5 5-5 5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                        <span className="truncate">
                          <NameTag name={t.toName} variant="underline" isMe={t.to === member.id} />
                        </span>
                        <span className="text-right font-semibold tabular-nums text-brand-300">
                          {formatCents(t.amount)}
                        </span>
                      </div>
                      {t.note && (
                        <p className="mt-1 text-[11px] italic text-ink-400">{t.note}</p>
                      )}
                    </div>
                  ))}
                </div>
              </details>
            )}

            <div className="mt-3 grid gap-2">
              {myTransfers.map((t, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setSettlePrefill(t);
                    setShowSettle(true);
                  }}
                  className="flex items-center justify-between rounded-xl bg-ink-900/40 px-3 py-2.5 text-left transition-colors hover:bg-ink-700/50"
                >
                  <span className="text-sm">
                    <NameTag name={t.fromName} variant="underline" isMe={t.from === member.id} />
                    <span className="text-ink-300"> pays </span>
                    <NameTag name={t.toName} variant="underline" isMe={t.to === member.id} />
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="font-semibold text-brand-300">{formatCents(t.amount)}</span>
                    <span className="text-lg leading-none text-ink-400">›</span>
                  </span>
                </button>
              ))}
            </div>
          </details>
        )}

        {/* Activity feed — always scoped to you. */}
        <div className="mb-3 mt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-200">Activity</h2>
        </div>
        {feed.length === 0 ? (
          <p className="card p-8 text-center text-ink-300">Nothing involving you yet.</p>
        ) : (
          <div className="grid gap-2">
            {feed.map((item) => {
              const { mon, day } = dateParts(item.at);
              // Left date stack + icon are shared by both row types.
              const dateStack = (
                <div className="w-9 shrink-0 text-center leading-tight">
                  <div className="text-[11px] uppercase text-ink-400">{mon}</div>
                  <div className="text-base font-semibold text-ink-200">{day}</div>
                </div>
              );
              // Every visible row involves you (feed is pre-filtered), so all are
              // clickable to edit.
              const rowClass =
                "card flex w-full items-center gap-3 p-3.5 text-left transition-colors hover:bg-ink-700/40";

              if (item.kind === "expense") {
                const expense = item.data;
                const stake = myStake(expense, member.id);
                const stakeColor =
                  stake.kind === "owed"
                    ? "text-brand-300"
                    : stake.kind === "borrowed"
                      ? "text-orange-400"
                      : "text-ink-200";
                return (
                  <button
                    key={expense.id}
                    type="button"
                    onClick={() => setEditExpense(expense)}
                    className={rowClass}
                  >
                    {dateStack}
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-ink-700 text-lg">
                      🧾
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-white">{expense.description}</div>
                      <div className="truncate text-xs text-ink-100">
                        <NameTag
                          name={expense.paidByName}
                          variant="underline"
                          isMe={expense.paidBy === member.id}
                        />{" "}
                        paid {formatCents(expense.amount)}
                      </div>
                    </div>
                    {/* Right status + amount stack (fixed two lines => even height). */}
                    <div className="shrink-0 text-right leading-tight">
                      <div className={`text-[11px] ${stakeColor}`}>{stake.label}</div>
                      {stake.kind !== "none" && (
                        <div className={`text-sm font-semibold ${stakeColor}`}>
                          {formatCents(stake.amount)}
                        </div>
                      )}
                    </div>
                  </button>
                );
              }

              const settlement = item.data;
              return (
                <button
                  key={settlement.id}
                  type="button"
                  onClick={() => setEditSettlement(settlement)}
                  className={rowClass}
                >
                  {dateStack}
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-500/15 text-lg text-brand-300">
                    💸
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">
                      <NameTag
                        name={settlement.fromName}
                        variant="underline"
                        isMe={settlement.fromMember === member.id}
                      />
                      <span className="text-ink-100"> paid </span>
                      <NameTag
                        name={settlement.toName}
                        variant="underline"
                        isMe={settlement.toMember === member.id}
                      />
                    </div>
                  </div>
                  <div className="shrink-0 text-right leading-tight">
                    <div className="text-[11px] text-ink-200">paid</div>
                    <div className="text-sm font-semibold text-brand-300">
                      {formatCents(settlement.amount)}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </main>

      {/* Thumb-reachable action bar, pinned above the home indicator. */}
      <div className="fixed inset-x-0 bottom-0 z-30 bg-ink-900/80 px-safe pb-safe pt-3 backdrop-blur">
        <div className="mx-auto grid max-w-3xl grid-cols-2 gap-3">
          <button onClick={() => setShowExpense(true)} className="btn-primary">
            + Add expense
          </button>
          <button
            onClick={() => {
              setSettlePrefill(null);
              setShowSettle(true);
            }}
            className="btn-ghost relative"
          >
            Settle up
            {iOweCount > 0 && (
              <span
                className="absolute -right-1.5 -top-1.5 flex h-5 min-w-[1.25rem] items-center justify-center
                           rounded-full bg-red-500 px-1 text-xs font-bold text-white"
                aria-label={`${iOweCount} ${iOweCount === 1 ? "person" : "people"} to pay`}
              >
                {iOweCount}
              </span>
            )}
          </button>
        </div>
      </div>

      <AddExpenseModal
        open={showExpense || editExpense !== null}
        onClose={() => {
          setShowExpense(false);
          setEditExpense(null);
        }}
        onSaved={load}
        onDeleted={load}
        members={snap.members}
        meId={member.id}
        expense={editExpense}
      />
      <SettleUpModal
        open={showSettle || editSettlement !== null}
        onClose={() => {
          setShowSettle(false);
          setEditSettlement(null);
        }}
        onSaved={async () => {
          // Reload, then check the FRESH balance: a bigger celebration if this
          // payment cleared your last debt (only for NEW payments, not edits).
          const wasEditing = editSettlement !== null;
          const fresh = await load();
          if (!wasEditing) {
            const myNet = fresh?.balances.find((b) => b.memberId === member.id)?.net ?? 0;
            setConfetti(myNet === 0 ? "big" : "normal");
          }
        }}
        onDeleted={load}
        members={snap.members}
        meId={member.id}
        prefill={settlePrefill}
        tabs={myTabs}
        editing={editSettlement}
      />

      {confetti && (
        <Confetti big={confetti === "big"} onDone={() => setConfetti(null)} />
      )}
      {confetti === "big" && (
        <div className="pointer-events-none fixed inset-0 z-[61] flex items-start justify-center pt-32">
          <div className="animate-bounce rounded-2xl bg-brand-500 px-5 py-3 text-lg font-bold text-ink-900 shadow-xl shadow-black/30">
            🎉 All settled up!
          </div>
        </div>
      )}
    </>
  );
}

// My stake in an expense, for the right-hand status column:
//   kind "owed"     -> green, "you lent $X"     (I'm owed money on this)
//   kind "borrowed" -> orange, "you borrowed $X" (I owe money on this)
//   kind "none"     -> grey, "no balance"        (doesn't change my balance)
type Stake = { kind: "owed" | "borrowed" | "none"; label: string; amount: number };

function myStake(e: Expense, meId: string): Stake {
  const mine = e.shares.find((s) => s.memberId === meId);
  if (e.paidBy === meId) {
    // I fronted it; I'm owed everyone else's share.
    const lent = e.amount - (mine?.share ?? 0);
    return lent > 0
      ? { kind: "owed", label: "you lent", amount: lent }
      : { kind: "none", label: "no balance", amount: 0 };
  }
  if (mine && mine.share > 0) {
    return { kind: "borrowed", label: "you borrowed", amount: mine.share };
  }
  return { kind: "none", label: "no balance", amount: 0 };
}

// Compact date for the left stack: { mon: "Jun", day: "3" }. Year is omitted —
// it's grouped/obvious from context and keeps the stack to two tidy lines.
function dateParts(iso: string): { mon: string; day: string } {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { mon: "", day: "" };
  return {
    mon: d.toLocaleDateString(undefined, { month: "short" }),
    day: String(d.getDate()),
  };
}
