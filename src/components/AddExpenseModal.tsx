"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { parseDollarsToCents, formatCents } from "@/lib/money";
import type { Member, SplitType } from "@/lib/types";
import { Modal } from "./Modal";
import { Select } from "./Select";
import { Spinner } from "./Spinner";

export function AddExpenseModal({
  open,
  onClose,
  onSaved,
  members,
  meId,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  members: Member[];
  meId: string;
}) {
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
    setDescription("");
    setAmountStr("");
    setPaidBy(meId);
    setSplitType("equal");
    setParticipants(new Set(members.map((m) => m.id))); // everyone in by default
    setShareInputs({});
    setError(null);
  }, [open, meId, members]);

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
      await api(`/api/expenses`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add expense");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add an expense">
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
        <div className="space-y-3 rounded-xl bg-ink-900/40 p-3">
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
          disabled={busy || !description.trim() || amountCents <= 0}
          className="btn-primary w-full"
        >
          {busy ? (
            <>
              <Spinner size={18} /> Saving…
            </>
          ) : (
            "Add expense"
          )}
        </button>
      </div>
    </Modal>
  );
}
