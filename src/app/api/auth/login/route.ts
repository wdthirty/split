import { NextResponse } from "next/server";
import { checkGroupCode, registerOrRecover, signToken, AUTH_COOKIE } from "@/lib/auth";

export async function POST(req: Request) {
  let body: { groupCode?: string; name?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (!checkGroupCode(body.groupCode)) {
    return NextResponse.json({ error: "Wrong group code" }, { status: 401 });
  }

  const member = await registerOrRecover(body.name ?? "");
  if (!member) {
    return NextResponse.json({ error: "Please enter your name" }, { status: 400 });
  }

  const token = signToken(member.id);
  const res = NextResponse.json({ member, token });
  // HttpOnly cookie is the primary auth; the token is also returned so the
  // client can stash a copy in localStorage as a backup / for clarity.
  res.cookies.set(AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365, // 1 year
  });
  return res;
}
