import { NextResponse } from "next/server";
import { sql, newId } from "@/lib/db";
import { currentMemberId } from "@/lib/auth";

// List the groups the current member belongs to.
export async function GET() {
  const me = await currentMemberId();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const res = await sql<{
    id: string;
    name: string;
    emoji: string;
    created_by: string | null;
    member_count: string;
  }>`
    SELECT g.id, g.name, g.emoji, g.created_by,
           (SELECT count(*) FROM group_members gm2 WHERE gm2.group_id = g.id) AS member_count
    FROM groups g
    JOIN group_members gm ON gm.group_id = g.id
    WHERE gm.member_id = ${me}
    ORDER BY g.created_at DESC
  `;

  return NextResponse.json({
    groups: res.rows.map((r) => ({
      id: r.id,
      name: r.name,
      emoji: r.emoji,
      createdBy: r.created_by,
      memberCount: Number(r.member_count),
    })),
  });
}

// Create a group. The creator is automatically a member.
export async function POST(req: Request) {
  const me = await currentMemberId();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { name?: string; emoji?: string; memberIds?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const name = (body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "Group name required" }, { status: 400 });
  const emoji = (body.emoji ?? "👥").trim() || "👥";

  const id = newId("grp");
  await sql`
    INSERT INTO groups (id, name, emoji, created_by) VALUES (${id}, ${name}, ${emoji}, ${me})
  `;

  // Always include the creator, plus any selected members (deduped).
  const memberIds = new Set<string>([me, ...(body.memberIds ?? [])]);
  for (const mid of memberIds) {
    await sql`
      INSERT INTO group_members (group_id, member_id) VALUES (${id}, ${mid})
      ON CONFLICT DO NOTHING
    `;
  }

  return NextResponse.json({ group: { id, name, emoji } }, { status: 201 });
}
