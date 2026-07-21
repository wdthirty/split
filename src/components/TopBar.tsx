"use client";

import Link from "next/link";
import { useState } from "react";
import { useAuth } from "./AuthProvider";
import { Modal } from "./Modal";
import { NameTag } from "./NameTag";
import { Spinner } from "./Spinner";

export function TopBar() {
  const { member, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
    } finally {
      setLoggingOut(false);
      setMenuOpen(false);
    }
  };

  return (
    <>
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
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              className="rounded-full px-2 py-1 text-sm text-ink-200 hover:text-ink-100"
            >
              Hey, <NameTag name={member.name} />
            </button>
          )}
        </div>
      </header>

      <Modal open={menuOpen} onClose={() => setMenuOpen(false)} title="Account" center>
        <div className="space-y-3">
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="btn-primary w-full"
          >
            {loggingOut ? (
              <>
                <Spinner size={18} /> Logging out…
              </>
            ) : (
              "Log out"
            )}
          </button>
          <button
            onClick={() => setMenuOpen(false)}
            disabled={loggingOut}
            className="btn-ghost w-full"
          >
            Cancel
          </button>
        </div>
      </Modal>
    </>
  );
}
