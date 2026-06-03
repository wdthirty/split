"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Member } from "@/lib/types";
import { Modal } from "./Modal";

export function AddPeopleModal({
  open,
  onClose,
  onSaved,
  groupId,
  currentMemberIds,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  groupId: string;
  currentMemberIds: string[];
}) {
  const [available, setAvailable] = useState<Member[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSelected(new Set());
    setError(null);
    api<{ members: Member[] }>("/api/members")
      .then((res) => setAvailable(res.members.filter((m) => !currentMemberIds.includes(m.id))))
      .catch(() => setAvailable([]));
  }, [open, currentMemberIds]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/groups/${groupId}`, {
        method: "POST",
        body: JSON.stringify({ memberIds: [...selected] }),
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add people");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add people">
      <div className="space-y-4">
        {available.length === 0 ? (
          <p className="text-sm text-ink-300">
            Everyone who&apos;s registered is already in this group. New friends just need to log in
            once with the group code, then you can add them here.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {available.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => toggle(m.id)}
                className={`chip ${selected.has(m.id) ? "chip-on" : ""}`}
              >
                {m.name}
              </button>
            ))}
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {error}
          </div>
        )}

        {available.length > 0 && (
          <button
            onClick={submit}
            disabled={busy || selected.size === 0}
            className="btn-primary w-full"
          >
            {busy ? "Adding…" : `Add ${selected.size || ""}`.trim()}
          </button>
        )}
      </div>
    </Modal>
  );
}
