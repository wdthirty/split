"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api, saveTokenBackup, clearTokenBackup } from "@/lib/api";
import type { Member } from "@/lib/types";

type AuthState = {
  member: Member | null;
  loading: boolean;
  login: (groupCode: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [member, setMember] = useState<Member | null>(null);
  const [loading, setLoading] = useState(true);

  // On mount, ask the server who we are (the HttpOnly cookie carries identity).
  useEffect(() => {
    let active = true;
    api<{ member: Member | null }>("/api/auth/me")
      .then((res) => {
        if (active) setMember(res.member);
      })
      .catch(() => {
        if (active) setMember(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const login = useCallback(async (groupCode: string, name: string) => {
    const res = await api<{ member: Member; token: string }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ groupCode, name }),
    });
    saveTokenBackup(res.token);
    setMember(res.member);
  }, []);

  const logout = useCallback(async () => {
    await api("/api/auth/logout", { method: "POST" }).catch(() => {});
    clearTokenBackup();
    setMember(null);
  }, []);

  return (
    <AuthContext.Provider value={{ member, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
