"use client";

import Link from "next/link";
import { useAuth } from "./AuthProvider";

export function TopBar() {
  const { member, logout } = useAuth();
  return (
    <header className="sticky top-0 z-20 border-b border-ink-600/70 bg-ink-900/80 pt-safe backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3 px-safe">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500 text-base">
            💸
          </span>
          <span className="font-bold tracking-tight">Splitwise</span>
        </Link>
        <div className="flex items-center gap-3">
          {member && (
            <span className="hidden text-sm text-ink-200 sm:inline">
              Hey, <span className="text-ink-100">{member.name}</span>
            </span>
          )}
          <button onClick={logout} className="btn-ghost px-3 py-1.5 text-xs">
            Log out
          </button>
        </div>
      </div>
    </header>
  );
}
