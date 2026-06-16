"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { parseDollarsToCents, formatCents, centsToDollarString } from "@/lib/money";
import type { Member, SplitType, Expense } from "@/lib/types";
import { Modal } from "./Modal";
import { Select } from "./Select";
import { Spinner } from "./Spinner";

// Reduce a map of integer values to their smallest whole-number ratio (divide
// by the GCD). Used to prefill parts steppers when editing — e.g. cent shares
// {4000, 2000, 2000} -> {2, 1, 1}. Falls back to the raw values if no clean GCD.
function reduceToRatio(values: Record<string, number>): Record<string, number> {
  const nums = Object.values(values).filter((v) => v > 0);
  if (nums.length === 0) return {};
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const g = nums.reduce((a, b) => gcd(a, b));
  const out: Record<string, number> = {};
  for (const [id, v] of Object.entries(values)) out[id] = g > 0 ? Math.round(v / g) : v;
  return out;
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
  // exact ($) / percent (%) free-text inputs, keyed by member id.
  const [shareInputs, setShareInputs] = useState<Record<string, string>>({});
  // parts mode: integer ratio per member, keyed by member id.
  const [partsInputs, setPartsInputs] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Show the logged-in user as "You" everywhere in the form.
  const displayName = (m: { id: string; name: string }) => (m.id === meId ? "You" : m.name);

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
      const parts: Record<string, number> = {};
      for (const s of expense.shares) {
        if (expense.splitType === "exact") {
          inputs[s.memberId] = centsToDollarString(s.share);
        } else if (expense.splitType === "percent") {
          // Legacy percent expenses: recover the % from the stored cents.
          inputs[s.memberId] =
            expense.amount > 0 ? String(Math.round((s.share / expense.amount) * 100)) : "";
        } else if (expense.splitType === "parts") {
          // We don't store raw parts, but proportions are preserved. Re-derive a
          // small whole-number ratio from the cent shares so steppers prefill.
          parts[s.memberId] = s.share;
        }
      }
      if (expense.splitType === "parts") setPartsInputs(reduceToRatio(parts));
      setShareInputs(inputs);
      return;
    }

    // Creating: blank form. You're selected by default (you're usually in the
    // expense); tap to add the others, or remove yourself for the rare case.
    setDescription("");
    setAmountStr("");
    setPaidBy(meId);
    setSplitType("equal");
    setParticipants(new Set([meId]));
    setShareInputs({});
    setPartsInputs({});
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

  // Exact mode convenience (when CREATING — editing respects existing values):
  // if exactly one person is included, they owe the full amount, so auto-fill it.
  // When the included set changes to anything else, clear the exact inputs.
  // Stable string key so this only runs when the SET changes, not on each keystroke.
  const includedKey = includedMembers.map((m) => m.id).join(",");
  useEffect(() => {
    if (!open || isEdit || splitType !== "exact") return;
    if (includedMembers.length === 1) {
      setShareInputs({ [includedMembers[0].id]: amountStr });
    } else {
      setShareInputs({});
    }
    // amountStr intentionally omitted: don't overwrite manual edits on every
    // amount keystroke when 2+ are selected. The 1-person case re-syncs below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isEdit, splitType, includedKey]);

  // Keep the single-person exact auto-fill in sync as the amount changes.
  useEffect(() => {
    if (!open || isEdit || splitType !== "exact" || includedMembers.length !== 1) return;
    setShareInputs({ [includedMembers[0].id]: amountStr });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amountStr]);

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
    } else if (splitType === "parts") {
      const totalParts = ids.reduce((a, id) => a + (partsInputs[id] || 0), 0);
      if (totalParts > 0 && amountCents > 0) {
        // Same proportional+remainder split the server uses, for an exact preview.
        let allocated = 0;
        for (const id of ids) {
          const n = partsInputs[id] || 0;
          const share = Math.round((amountCents * n) / totalParts);
          if (n > 0) out[id] = share;
          allocated += share;
        }
        // Drop rounding drift on the biggest share so the preview sums exactly.
        const drift = amountCents - allocated;
        if (drift !== 0) {
          const biggest = ids
            .filter((id) => (partsInputs[id] || 0) > 0)
            .sort((a, b) => (out[b] ?? 0) - (out[a] ?? 0))[0];
          if (biggest != null) out[biggest] = (out[biggest] ?? 0) + drift;
        }
      }
    } else {
      // legacy percent
      for (const id of ids) {
        const pct = Number(shareInputs[id] ?? "");
        if (Number.isFinite(pct) && pct > 0) out[id] = Math.round((amountCents * pct) / 100);
      }
    }
    return out;
  }, [splitType, includedMembers, amountCents, shareInputs, partsInputs]);

  const previewTotal = Object.values(preview).reduce((a, b) => a + b, 0);
  const exactTotalMismatch =
    splitType === "exact" && amountCents > 0 && previewTotal !== amountCents;
  const percentTotal = useMemo(() => {
    if (splitType !== "percent") return 0;
    return includedMembers.reduce((a, m) => a + (Number(shareInputs[m.id] ?? "") || 0), 0);
  }, [splitType, shareInputs, includedMembers]);

  // Total parts assigned across included people (parts mode).
  const partsTotal = useMemo(
    () => includedMembers.reduce((a, m) => a + (partsInputs[m.id] || 0), 0),
    [includedMembers, partsInputs],
  );

  function bumpParts(id: string, delta: number) {
    setPartsInputs((prev) => {
      const next = Math.max(0, (prev[id] || 0) + delta);
      return { ...prev, [id]: next };
    });
  }

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
    if (splitType === "parts" && partsTotal <= 0) {
      setError("Give at least one person a share");
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
      } else if (splitType === "parts") {
        payload.shares = includedMembers
          .map((m) => ({ memberId: m.id, value: partsInputs[m.id] || 0 }))
          .filter((s) => s.value > 0);
      } else {
        // legacy percent
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
                label: displayName(m),
              }))}
            />
          </div>
        </div>

        <div>
          <label className="label">Split</label>
          <div className="grid grid-cols-3 gap-2">
            {(["equal", "exact", "parts"] as SplitType[]).map((t) => (
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
                {t === "equal" ? "Equally" : t === "parts" ? "Shares" : t}
              </button>
            ))}
          </div>
          {/* Old expenses saved as % keep a read-only mode label so editing works. */}
          {splitType === "percent" && (
            <p className="mt-1.5 text-xs text-ink-300">
              Split by percentage (legacy). Switch to Shares or Exact to change.
            </p>
          )}
        </div>

        {/* Split detail */}
        <div className="space-y-3">
          {/* Who's involved — drives all three split modes */}
          <div className="space-y-2">
            <p className="text-xs text-ink-300">Tap to include / exclude people.</p>
            <div className="flex flex-wrap gap-2">
              {[...members]
                .sort((a, b) => (a.id === meId ? -1 : b.id === meId ? 1 : 0))
                .map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => toggleParticipant(m.id)}
                  className={`chip ${participants.has(m.id) ? "chip-on" : ""}`}
                >
                  {displayName(m)}
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
                      <span className="flex-1 text-sm">{displayName(m)}</span>

                      {splitType === "parts" ? (
                        // Stepper: tap +/- to set ratio parts; live $ shown beside.
                        <div className="flex items-center gap-2">
                          <span className="w-16 text-right text-xs tabular-nums text-ink-300">
                            {preview[m.id] != null ? formatCents(preview[m.id]) : ""}
                          </span>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => bumpParts(m.id, -1)}
                              disabled={(partsInputs[m.id] || 0) <= 0}
                              className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink-700 text-lg text-ink-100 hover:bg-ink-600 disabled:opacity-40"
                              aria-label={`Decrease ${m.name}'s share`}
                            >
                              –
                            </button>
                            <span className="w-6 text-center text-sm font-semibold tabular-nums">
                              {partsInputs[m.id] || 0}
                            </span>
                            <button
                              type="button"
                              onClick={() => bumpParts(m.id, 1)}
                              className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink-700 text-lg text-ink-100 hover:bg-ink-600"
                              aria-label={`Increase ${m.name}'s share`}
                            >
                              +
                            </button>
                          </div>
                        </div>
                      ) : (
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
                      )}
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
                    ) : splitType === "parts" ? (
                      <>
                        <span className="text-ink-300">Total shares</span>
                        <span className={partsTotal > 0 ? "text-brand-300" : "text-red-300"}>
                          {partsTotal}
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
          disabled={
            busy ||
            !description.trim() ||
            amountCents <= 0 ||
            !hasOtherParticipant ||
            (splitType === "parts" && partsTotal <= 0)
          }
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
