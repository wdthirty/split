"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { parseDollarsToCents, centsToDollarString } from "@/lib/money";
import type { Member, Transfer } from "@/lib/types";
import { Modal } from "./Modal";
import { Select } from "./Select";
import { Spinner } from "./Spinner";

export function SettleUpModal({
  open,
  onClose,
  onSaved,
  members,
  meId,
  prefill,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  members: Member[];
  meId: string;
  prefill: Transfer | null;
}) {
  const [from, setFrom] = useState(meId);
  const [to, setTo] = useState("");
  const [amountStr, setAmountStr] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (prefill) {
      setFrom(prefill.from);
      setTo(prefill.to);
      setAmountStr(centsToDollarString(prefill.amount));
    } else {
      setFrom(meId);
      setTo(members.find((m) => m.id !== meId)?.id ?? "");
      setAmountStr("");
    }
  }, [open, prefill, meId, members]);

  async function submit() {
    setError(null);
    const amount = parseDollarsToCents(amountStr) ?? 0;
    if (amount <= 0) {
      setError("Enter an amount greater than 0");
      return;
    }
    if (from === to) {
      setError("Pick two different people");
      return;
    }
    setBusy(true);
    try {
      await api(`/api/settlements`, {
        method: "POST",
        body: JSON.stringify({ from, to, amount }),
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record payment");
    } finally {
      setBusy(false);
    }
  }

  const nameOf = (id: string) => members.find((m) => m.id === id)?.name ?? "";

  return (
    <Modal open={open} onClose={onClose} title="Settle up">
      <div className="space-y-4">
        <div className="flex items-start gap-2">
          <div className="flex-1">
            <label className="label">Payer</label>
            <Select
              value={from}
              onChange={setFrom}
              options={members.map((m) => ({
                value: m.id,
                label: m.id === meId ? `${m.name} (you)` : m.name,
              }))}
            />
          </div>
          <span className="mt-9 text-ink-300">→</span>
          <div className="flex-1">
            <label className="label">Receiver</label>
            <Select
              value={to}
              onChange={setTo}
              placeholder="Select…"
              options={members.map((m) => ({
                value: m.id,
                label: m.id === meId ? `${m.name} (you)` : m.name,
              }))}
            />
          </div>
        </div>

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

        {from && to && from !== to && (
          <p className="text-sm text-ink-300">
            <span className="text-ink-100">{nameOf(from)}</span> pays{" "}
            <span className="text-ink-100">{nameOf(to)}</span>
            {amountStr && ` $${amountStr}`}.
          </p>
        )}

        {error && (
          <div className="rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {error}
          </div>
        )}

        <button onClick={submit} disabled={busy} className="btn-primary w-full">
          {busy ? (
            <>
              <Spinner size={18} /> Saving…
            </>
          ) : (
            "Record payment"
          )}
        </button>
      </div>
    </Modal>
  );
}
