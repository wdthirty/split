"use client";

import Link from "next/link";
import { useAuth } from "./AuthProvider";

export function TopBar() {
  const { member } = useAuth();
  return (
    <header className="sticky top-0 z-20 bg-ink-900/80 pt-safe backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-safe py-3">
        <Link href="/" className="flex items-center gap-1">
          <span className="text-2xl font-bold tracking-tight">LiangFlix Split</span>
          <span className="flex h-10 w-10 items-center justify-center text-xl">
            💸
          </span>
        </Link>
        {member && (
          <span className="text-sm text-ink-200">
            Hey, <span className="font-medium text-ink-100">{member.name}</span>
          </span>
        )}
      </div>
    </header>
  );
}
