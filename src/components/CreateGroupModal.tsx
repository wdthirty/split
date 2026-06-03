"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Member } from "@/lib/types";
import { Modal } from "./Modal";

const EMOJI_CHOICES = ["👥", "🏠", "✈️", "🏖️", "🍻", "🍕", "🎮", "🚗", "⛰️", "🎉"];

export function CreateGroupModal({
  open,
  onClose,
  onCreated,
  meId,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  meId: string;
}) {
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("👥");
  const [allMembers, setAllMembers] = useState<Member[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    api<{ members: Member[] }>("/api/members")
      .then((res) => setAllMembers(res.members.filter((m) => m.id !== meId)))
      .catch(() => setAllMembers([]));
    // reset form each open
    setName("");
    setEmoji("👥");
    setSelected(new Set());
    setError(null);
  }, [open, meId]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      await api("/api/groups", {
        method: "POST",
        body: JSON.stringify({ name, emoji, memberIds: [...selected] }),
      });
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create group");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="New group">
      <div className="space-y-4">
        <div>
          <label className="label">Group name</label>
          <input
            className="input"
            placeholder="Cabo trip, Apartment 4B…"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div>
          <label className="label">Icon</label>
          <div className="flex flex-wrap gap-2">
            {EMOJI_CHOICES.map((em) => (
              <button
                key={em}
                type="button"
                onClick={() => setEmoji(em)}
                className={`flex h-10 w-10 items-center justify-center rounded-xl border text-lg transition-colors ${
                  emoji === em
                    ? "border-brand-500 bg-brand-500/15"
                    : "border-ink-500 bg-ink-700 hover:bg-ink-600"
                }`}
              >
                {em}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="label">Add people {allMembers.length === 0 && "(no one else yet)"}</label>
          <div className="flex flex-wrap gap-2">
            {allMembers.map((m) => (
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
          <p className="mt-2 text-xs text-ink-300">
            You&apos;re always included. People who join later (with the group code) can be added
            anytime.
          </p>
        </div>

        {error && (
          <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {error}
          </div>
        )}

        <button onClick={submit} disabled={busy || !name.trim()} className="btn-primary w-full">
          {busy ? "Creating…" : "Create group"}
        </button>
      </div>
    </Modal>
  );
}
