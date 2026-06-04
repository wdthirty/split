"use client";

import Link from "next/link";
import { useAuth } from "./AuthProvider";
import { NameTag } from "./NameTag";

export function TopBar() {
  const { member } = useAuth();
  return (
    <header className="sticky top-0 z-20 bg-ink-900/80 pt-safe backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-safe py-3">
        <Link href="/" className="flex items-center gap-1">
          <span className="text-2xl font-bold tracking-tight">
            <span className="text-brand-400">LiangFlix</span>
            <span className="text-ink-100"> Split</span>
          </span>
          <span className="flex h-10 w-10 items-center justify-center text-xl">
            💸
          </span>
        </Link>
        {member && (
          <span className="text-sm text-ink-200">
            Hey, <NameTag name={member.name} />
          </span>
        )}
      </div>
    </header>
  );
}
