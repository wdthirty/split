import crypto from "node:crypto";
import { cookies } from "next/headers";
import { sql, newId } from "./db";
import type { Member } from "./types";

export const AUTH_COOKIE = "sw_token";

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set");
  return s;
}

// Token format: `<memberId>.<hmac>` where hmac = HMAC-SHA256(memberId).
// The member id is opaque (a uuid), and the signature makes it unforgeable,
// so possessing a valid token proves identity. Tokens don't expire — losing
// one just means re-entering group code + name to mint a new one.
export function signToken(memberId: string): string {
  const mac = crypto.createHmac("sha256", secret()).update(memberId).digest("hex");
  return `${memberId}.${mac}`;
}

export function verifyToken(token: string | undefined | null): string | null {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const memberId = token.slice(0, dot);
  const mac = token.slice(dot + 1);
  const expected = crypto.createHmac("sha256", secret()).update(memberId).digest("hex");
  // Constant-time compare to avoid leaking via timing.
  const a = Buffer.from(mac, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return memberId;
}

export function checkGroupCode(code: string | undefined | null): boolean {
  const expected = process.env.GROUP_CODE;
  if (!expected) throw new Error("GROUP_CODE is not set");
  if (!code) return false;
  const a = Buffer.from(code);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Normalize a name for case-insensitive identity matching.
export function nameKey(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Register-or-recover. Given a valid group code + name:
 *  - if a member with that name already exists, log into it (recovery path)
 *  - otherwise create a new member
 * Returns the member, or null if the name is blank.
 */
export async function registerOrRecover(name: string): Promise<Member | null> {
  const clean = name.trim();
  if (!clean) return null;
  const key = nameKey(clean);

  const existing = await sql<{ id: string; name: string }>`
    SELECT id, name FROM members WHERE name_key = ${key} LIMIT 1
  `;
  if (existing.rows.length > 0) {
    return { id: existing.rows[0].id, name: existing.rows[0].name };
  }

  const id = newId("mbr");
  await sql`
    INSERT INTO members (id, name, name_key) VALUES (${id}, ${clean}, ${key})
  `;
  return { id, name: clean };
}

// Read the current member id from the signed auth cookie (server components / routes).
export async function currentMemberId(): Promise<string | null> {
  const store = await cookies();
  return verifyToken(store.get(AUTH_COOKIE)?.value);
}

export async function currentMember(): Promise<Member | null> {
  const id = await currentMemberId();
  if (!id) return null;
  const res = await sql<{ id: string; name: string }>`
    SELECT id, name FROM members WHERE id = ${id} LIMIT 1
  `;
  if (res.rows.length === 0) return null;
  return { id: res.rows[0].id, name: res.rows[0].name };
}
