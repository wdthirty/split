"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { parseDollarsToCents, centsToDollarString, formatCents } from "@/lib/money";
import type { Member, Transfer, Settlement } from "@/lib/types";
import { Modal } from "./Modal";
import { Select } from "./Select";
import { Spinner } from "./Spinner";

// My pairwise tab with another person: +ve => they owe me, -ve => I owe them.
export type SettleTab = { memberId: string; name: string; net: number };

export function SettleUpModal({
  open,
  onClose,
  onSaved,
  members,
  meId,
  prefill,
  tabs,
  editing = null,
  onDeleted,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  members: Member[];
  meId: string;
  prefill: Transfer | null;
  // My pairwise tabs, used to auto-fill the amount and flag people I owe.
  tabs: SettleTab[];
  // When set, the modal edits this existing settlement instead of recording new.
  editing?: Settlement | null;
  onDeleted?: () => void;
}) {
  const isEdit = editing != null;
  const [from, setFrom] = useState(meId);
  const [to, setTo] = useState("");
  const [amountStr, setAmountStr] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // The form is complete when payer and receiver are both chosen and distinct,
  // and the amount parses to a positive value.
  const amountCents = parseDollarsToCents(amountStr) ?? 0;
  const canSubmit = Boolean(from) && Boolean(to) && from !== to && amountCents > 0;

  const tabByMember = new Map(tabs.map((t) => [t.memberId, t.net]));

  // The amount the payer owes the receiver, in cents (0 if not a debt this way).
  // Only meaningful when one party is me, since `tabs` are MY pairwise tabs.
  function owedBetween(payer: string, receiver: string): number {
    if (payer === meId) {
      const net = tabByMember.get(receiver) ?? 0; // -ve => I owe receiver
      return net < 0 ? -net : 0;
    }
    if (receiver === meId) {
      const net = tabByMember.get(payer) ?? 0; // +ve => payer owes me
      return net > 0 ? net : 0;
    }
    return 0;
  }

  // The debt that the current from→to picks out (drives the helper text).
  const suggested = from && to && from !== to ? owedBetween(from, to) : 0;

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (editing) {
      setFrom(editing.fromMember);
      setTo(editing.toMember);
      setAmountStr(centsToDollarString(editing.amount));
    } else if (prefill) {
      setFrom(prefill.from);
      setTo(prefill.to);
      setAmountStr(centsToDollarString(prefill.amount));
    } else {
      setFrom(meId);
      // Default the receiver to the first person I owe (tabs are sorted with
      // people I owe last — net ascending picks the biggest debt I owe).
      const iOwe = tabs.filter((t) => t.net < 0).sort((a, b) => a.net - b.net);
      const defaultTo = iOwe[0]?.memberId ?? members.find((m) => m.id !== meId)?.id ?? "";
      setTo(defaultTo);
      // Auto-fill what I owe that person, if anything.
      const amt = defaultTo ? owedBetween(meId, defaultTo) : 0;
      setAmountStr(amt > 0 ? centsToDollarString(amt) : "");
    }
    // owedBetween/tabs are derived from props that are already in deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, prefill, editing, meId, members]);

  // When the payer/receiver pair changes, auto-fill the amount with what's owed
  // between them — but not for a prefilled plan or while editing an existing one.
  useEffect(() => {
    if (!open || prefill || editing) return;
    const amt = owedBetween(from, to);
    setAmountStr(amt > 0 ? centsToDollarString(amt) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  async function submit() {
    setError(null);
    // Belt-and-braces: the button is disabled unless these hold, but guard
    // anyway in case submit is reached some other way (e.g. keyboard).
    if (amountCents <= 0) {
      setError("Enter an amount greater than 0");
      return;
    }
    if (from === to) {
      setError("Pick two different people");
      return;
    }
    setBusy(true);
    try {
      if (isEdit) {
        await api(`/api/settlements/${editing!.id}`, {
          method: "PATCH",
          body: JSON.stringify({ from, to, amount: amountCents }),
        });
      } else {
        await api(`/api/settlements`, {
          method: "POST",
          body: JSON.stringify({ from, to, amount: amountCents }),
        });
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record payment");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!editing) return;
    if (!confirm("Remove this payment?")) return;
    setError(null);
    setBusy(true);
    try {
      await api(`/api/settlements/${editing.id}`, { method: "DELETE" });
      onDeleted?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove payment");
    } finally {
      setBusy(false);
    }
  }

  const nameOf = (id: string) => members.find((m) => m.id === id)?.name ?? "";

  // Build receiver options: people I owe float to the top (with a red dot),
  // then everyone else, alphabetical within each group.
  const receiverOptions = members
    .map((m) => ({
      value: m.id,
      label: m.id === meId ? `${m.name} (you)` : m.name,
      // Flag (and float) people I owe money to.
      dot: (tabByMember.get(m.id) ?? 0) < 0,
      iOwe: -(tabByMember.get(m.id) ?? 0), // +ve amount I owe them, else <=0
      name: m.name,
    }))
    .sort((a, b) => {
      if (a.iOwe > 0 !== b.iOwe > 0) return a.iOwe > 0 ? -1 : 1; // owed first
      if (a.iOwe > 0 && b.iOwe > 0) return b.iOwe - a.iOwe; // larger debt first
      return a.name.localeCompare(b.name);
    })
    .map(({ value, label, dot }) => ({ value, label, dot }));

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? "Edit payment" : "Settle up"}>
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
          <span className="mt-9 text-ink-300">›</span>
          <div className="flex-1">
            <label className="label">Receiver</label>
            <Select value={to} onChange={setTo} placeholder="Select…" options={receiverOptions} />
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
          {/* What's owed between the two picked people, so you can just confirm. */}
          {suggested > 0 && (
            <p className="mt-1.5 text-sm text-ink-300">
              {from === meId ? (
                <>
                  You owe{" "}
                  <span className="font-medium text-ink-100">{nameOf(to)}</span>{" "}
                  <span className="font-semibold text-brand-300">{formatCents(suggested)}</span>.
                </>
              ) : (
                <>
                  <span className="font-medium text-ink-100">{nameOf(from)}</span> owes you{" "}
                  <span className="font-semibold text-brand-300">{formatCents(suggested)}</span>.
                </>
              )}
            </p>
          )}
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

        <button onClick={submit} disabled={busy || !canSubmit} className="btn-primary w-full">
          {busy ? (
            <>
              <Spinner size={18} /> Saving…
            </>
          ) : isEdit ? (
            "Save changes"
          ) : (
            "Record payment"
          )}
        </button>

        {isEdit && (
          <button
            onClick={remove}
            disabled={busy}
            className="w-full py-2 text-sm font-medium text-red-400 hover:text-red-300 disabled:opacity-50"
          >
            Delete payment
          </button>
        )}
      </div>
    </Modal>
  );
}
