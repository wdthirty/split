import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { currentMemberId } from "@/lib/auth";

// All members in the system (used to add people to a group).
export async function GET() {
  const me = await currentMemberId();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const res = await sql<{ id: string; name: string }>`
    SELECT id, name FROM members ORDER BY name ASC
  `;
  return NextResponse.json({ members: res.rows });
}
