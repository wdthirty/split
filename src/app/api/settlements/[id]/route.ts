import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { currentMemberId } from "@/lib/auth";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await currentMemberId();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const res = await sql`DELETE FROM settlements WHERE id = ${id}`;
  if (res.rowCount === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
