"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { LoginScreen } from "@/components/LoginScreen";
import { TopBar } from "@/components/TopBar";
import { CreateGroupModal } from "@/components/CreateGroupModal";
import { api } from "@/lib/api";
import type { Group } from "@/lib/types";

export default function HomePage() {
  const { member, loading } = useAuth();
  const [groups, setGroups] = useState<Group[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const loadGroups = useCallback(() => {
    setLoadingGroups(true);
    api<{ groups: Group[] }>("/api/groups")
      .then((res) => setGroups(res.groups))
      .catch(() => setGroups([]))
      .finally(() => setLoadingGroups(false));
  }, []);

  useEffect(() => {
    if (member) loadGroups();
  }, [member, loadGroups]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-ink-300">Loading…</div>
    );
  }
  if (!member) return <LoginScreen />;

  return (
    <>
      <TopBar />
      <main className="mx-auto max-w-3xl px-4 py-6 px-safe pb-safe">
        <div className="mb-5 flex items-center justify-between">
          <h1 className="text-xl font-bold">Your groups</h1>
          <button onClick={() => setShowCreate(true)} className="btn-primary px-3 py-2 text-sm">
            + New group
          </button>
        </div>

        {loadingGroups ? (
          <p className="text-ink-300">Loading groups…</p>
        ) : groups.length === 0 ? (
          <div className="card flex flex-col items-center gap-3 p-10 text-center">
            <span className="text-4xl">🫙</span>
            <p className="text-ink-200">No groups yet.</p>
            <button onClick={() => setShowCreate(true)} className="btn-primary">
              Create your first group
            </button>
          </div>
        ) : (
          <div className="grid gap-3">
            {groups.map((g) => (
              <Link
                key={g.id}
                href={`/groups/${g.id}`}
                className="card flex items-center gap-4 p-4 transition-colors hover:border-brand-500/60"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-ink-700 text-2xl">
                  {g.emoji}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{g.name}</div>
                  <div className="text-sm text-ink-300">
                    {g.memberCount} {g.memberCount === 1 ? "person" : "people"}
                  </div>
                </div>
                <span className="text-ink-400">›</span>
              </Link>
            ))}
          </div>
        )}
      </main>

      <CreateGroupModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={loadGroups}
        meId={member.id}
      />
    </>
  );
}
