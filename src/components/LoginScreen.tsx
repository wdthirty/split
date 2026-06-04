"use client";

import { useState } from "react";
import { useAuth } from "./AuthProvider";
import { Spinner } from "./Spinner";

export function LoginScreen() {
  const { login } = useAuth();
  const [groupCode, setGroupCode] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(groupCode, name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-500 text-2xl">
            💸
          </div>
          <h1 className="text-2xl font-bold tracking-tight">LiangFlix Split</h1>
          <p className="mt-1 text-sm italic text-ink-200">&ldquo;Show me the money!&rdquo; — Jerry Maguire</p>
        </div>

        <form onSubmit={onSubmit} className="card space-y-4 p-6">
          <div>
            <label className="label" htmlFor="groupCode">
              Group code
            </label>
            <input
              id="groupCode"
              className="input"
              type="password"
              autoComplete="off"
              placeholder="The code you were given"
              value={groupCode}
              onChange={(e) => setGroupCode(e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="name">
              Your name
            </label>
            <input
              id="name"
              className="input"
              type="text"
              autoComplete="off"
              placeholder="e.g. Alex"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <p className="mt-1.5 text-xs text-ink-300">
              New here? This creates your profile. Been here before? Same name + code logs you
              right back in.
            </p>
          </div>

          {error && (
            <div className="rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {error}
            </div>
          )}

          <button type="submit" className="btn-primary w-full" disabled={busy}>
            {busy ? (
              <>
                <Spinner size={18} /> Checking…
              </>
            ) : (
              "Enter"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
