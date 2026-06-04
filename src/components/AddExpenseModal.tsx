"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { parseDollarsToCents, formatCents, centsToDollarString } from "@/lib/money";
import type { Member, SplitType, Expense } from "@/lib/types";
import { Modal } from "./Modal";
import { Select } from "./Select";
import { Spinner } from "./Spinner";

// Remembers the last set of people an expense was split among, so the next
// "Add expense" pre-selects the same crowd instead of resetting to everyone.
const LAST_PARTICIPANTS_KEY = "sw_last_participants";

function loadLastParticipants(): string[] | null {
  try {
    const raw = localStorage.getItem(LAST_PARTICIPANTS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.every((x) => typeof x === "string") ? parsed : null;
  } catch {
    return null;
  }
}

function saveLastParticipants(ids: string[]) {
  try {
    localStorage.setItem(LAST_PARTICIPANTS_KEY, JSON.stringify(ids));
  } catch {
    /* localStorage may be unavailable; not critical */
  }
}

export function AddExpenseModal({
  open,
  onClose,
  onSaved,
  members,
  meId,
  expense = null,
  onDeleted,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  members: Member[];
  meId: string;
  // When set, the modal edits this expense instead of creating a new one.
  expense?: Expense | null;
  onDeleted?: () => void;
}) {
  const isEdit = expense != null;
  const [description, setDescription] = useState("");
  const [amountStr, setAmountStr] = useState("");
  const [paidBy, setPaidBy] = useState(meId);
  const [splitType, setSplitType] = useState<SplitType>("equal");
  // Who's involved in this expense (all modes). exact/percent show an input
  // row only for the included people.
  const [participants, setParticipants] = useState<Set<string>>(new Set());
  const [shareInputs, setShareInputs] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);

    if (expense) {
      // Editing: prefill every field from the existing expense.
      setDescription(expense.description);
      setAmountStr(centsToDollarString(expense.amount));
      setPaidBy(expense.paidBy);
      setSplitType(expense.splitType);
      setParticipants(new Set(expense.shares.map((s) => s.memberId)));
      // Seed the per-person inputs for exact ($) / percent (%) modes.
      const inputs: Record<string, string> = {};
      for (const s of expense.shares) {
        if (expense.splitType === "exact") {
          inputs[s.memberId] = centsToDollarString(s.share);
        } else if (expense.splitType === "percent") {
          inputs[s.memberId] =
            expense.amount > 0 ? String(Math.round((s.share / expense.amount) * 100)) : "";
        }
      }
      setShareInputs(inputs);
      return;
    }

    // Creating: blank form, restoring the last picked people (kept if still in
    // the group), falling back to everyone.
    setDescription("");
    setAmountStr("");
    setPaidBy(meId);
    setSplitType("equal");
    const memberIds = new Set(members.map((m) => m.id));
    const saved = loadLastParticipants()?.filter((id) => memberIds.has(id));
    setParticipants(saved && saved.length > 0 ? new Set(saved) : new Set(memberIds));
    setShareInputs({});
  }, [open, meId, members, expense]);

  const amountCents = parseDollarsToCents(amountStr) ?? 0;

  function toggleParticipant(id: string) {
    setParticipants((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // The subset of people this expense is split among.
  const includedMembers = useMemo(
    () => members.filter((m) => participants.has(m.id)),
    [members, participants],
  );

  // An expense is only meaningful if it's split with at least one person who
  // isn't the payer — otherwise it nets to zero (e.g. "Carrie paid for Carrie").
  const hasOtherParticipant = includedMembers.some((m) => m.id !== paidBy);

  // Live preview of what each person owes, for feedback while typing. Only the
  // included people are considered, in every mode.
  const preview = useMemo(() => {
    const out: Record<string, number> = {};
    const ids = includedMembers.map((m) => m.id);
    if (splitType === "equal") {
      if (ids.length > 0 && amountCents > 0) {
        const base = Math.floor(amountCents / ids.length);
        let rem = amountCents - base * ids.length;
        for (const id of ids) {
          out[id] = base + (rem > 0 ? 1 : 0);
          if (rem > 0) rem--;
        }
      }
    } else if (splitType === "exact") {
      for (const id of ids) {
        const c = parseDollarsToCents(shareInputs[id] ?? "");
        if (c && c > 0) out[id] = c;
      }
    } else {
      for (const id of ids) {
        const pct = Number(shareInputs[id] ?? "");
        if (Number.isFinite(pct) && pct > 0) out[id] = Math.round((amountCents * pct) / 100);
      }
    }
    return out;
  }, [splitType, includedMembers, amountCents, shareInputs]);

  const previewTotal = Object.values(preview).reduce((a, b) => a + b, 0);
  const exactTotalMismatch =
    splitType === "exact" && amountCents > 0 && previewTotal !== amountCents;
  const percentTotal = useMemo(() => {
    if (splitType !== "percent") return 0;
    return includedMembers.reduce((a, m) => a + (Number(shareInputs[m.id] ?? "") || 0), 0);
  }, [splitType, shareInputs, includedMembers]);

  async function submit() {
    setError(null);
    if (amountCents <= 0) {
      setError("Enter an amount greater than 0");
      return;
    }
    if (!hasOtherParticipant) {
      setError("Split this with at least one other person");
      return;
    }
    setBusy(true);
    try {
      const payload: Record<string, unknown> = {
        description,
        amount: amountCents,
        paidBy,
        splitType,
      };
      if (splitType === "equal") {
        payload.participants = includedMembers.map((m) => m.id);
      } else if (splitType === "exact") {
        payload.shares = includedMembers
          .map((m) => ({ memberId: m.id, value: parseDollarsToCents(shareInputs[m.id] ?? "") ?? 0 }))
          .filter((s) => s.value > 0);
      } else {
        payload.shares = includedMembers
          .map((m) => ({ memberId: m.id, value: Number(shareInputs[m.id] ?? "") || 0 }))
          .filter((s) => s.value > 0);
      }
      if (isEdit) {
        await api(`/api/expenses/${expense!.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      } else {
        await api(`/api/expenses`, {
          method: "POST",
          body: JSON.stringify(payload),
        });
        // Remember who this expense was split among for next time.
        saveLastParticipants(includedMembers.map((m) => m.id));
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save expense");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!expense) return;
    if (!confirm("Delete this expense?")) return;
    setError(null);
    setBusy(true);
    try {
      await api(`/api/expenses/${expense.id}`, { method: "DELETE" });
      onDeleted?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete expense");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? "Edit expense" : "Add an expense"}>
      <div className="space-y-4">
        <div>
          <label className="label">Description</label>
          <input
            className="input"
            placeholder="Dinner, golf, groceries…"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Amount ($)</label>
            <input
              className="input"
              inputMode="decimal"
              placeholder="0.00"
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Paid by</label>
            <Select
              value={paidBy}
              onChange={setPaidBy}
              options={members.map((m) => ({
                value: m.id,
                label: m.id === meId ? `${m.name} (you)` : m.name,
              }))}
            />
          </div>
        </div>

        <div>
          <label className="label">Split</label>
          <div className="grid grid-cols-3 gap-2">
            {(["equal", "exact", "percent"] as SplitType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setSplitType(t)}
                className={`rounded-xl px-3 py-2 text-sm font-medium capitalize transition-colors ${
                  splitType === t
                    ? "bg-brand-500/15 text-brand-200"
                    : "bg-ink-700 text-ink-100 hover:bg-ink-600"
                }`}
              >
                {t === "equal" ? "Equally" : t}
              </button>
            ))}
          </div>
        </div>

        {/* Split detail */}
        <div className="space-y-3">
          {/* Who's involved — drives all three split modes */}
          <div className="space-y-2">
            <p className="text-xs text-ink-300">Tap to include / exclude people.</p>
            <div className="flex flex-wrap gap-2">
              {members.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => toggleParticipant(m.id)}
                  className={`chip ${participants.has(m.id) ? "chip-on" : ""}`}
                >
                  {m.name}
                  {splitType === "equal" && preview[m.id] != null && participants.has(m.id) && (
                    <span className="text-xs opacity-80">{formatCents(preview[m.id])}</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Per-person amounts — only for the people you've included */}
          {splitType !== "equal" && (
            <div className="space-y-2 pt-1">
              {includedMembers.length === 0 ? (
                <p className="text-xs text-ink-300">Select at least one person above.</p>
              ) : (
                <>
                  {includedMembers.map((m) => (
                    <div key={m.id} className="flex items-center gap-3">
                      <span className="flex-1 text-sm">{m.name}</span>
                      <div className="flex items-center gap-1.5">
                        {splitType === "exact" && <span className="text-ink-300">$</span>}
                        <input
                          className="input w-24 py-1.5 text-right"
                          inputMode="decimal"
                          placeholder={splitType === "percent" ? "0" : "0.00"}
                          value={shareInputs[m.id] ?? ""}
                          onChange={(e) =>
                            setShareInputs((prev) => ({ ...prev, [m.id]: e.target.value }))
                          }
                        />
                        {splitType === "percent" && <span className="text-ink-300">%</span>}
                      </div>
                    </div>
                  ))}
                  <div className="flex justify-between pt-2 text-xs">
                    {splitType === "exact" ? (
                      <>
                        <span className="text-ink-300">Allocated</span>
                        <span className={exactTotalMismatch ? "text-red-300" : "text-brand-300"}>
                          {formatCents(previewTotal)} / {formatCents(amountCents)}
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="text-ink-300">Total</span>
                        <span
                          className={
                            Math.round(percentTotal) === 100 ? "text-brand-300" : "text-red-300"
                          }
                        >
                          {percentTotal}%
                        </span>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {error && (
          <div className="rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {error}
          </div>
        )}

        <button
          onClick={submit}
          disabled={busy || !description.trim() || amountCents <= 0 || !hasOtherParticipant}
          className="btn-primary w-full"
        >
          {busy ? (
            <>
              <Spinner size={18} /> Saving…
            </>
          ) : isEdit ? (
            "Save changes"
          ) : (
            "Add expense"
          )}
        </button>

        {isEdit && (
          <button
            onClick={remove}
            disabled={busy}
            className="w-full py-2 text-sm font-medium text-red-400 hover:text-red-300 disabled:opacity-50"
          >
            Delete expense
          </button>
        )}
      </div>
    </Modal>
  );
}
