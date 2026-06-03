import { NextResponse } from "next/server";
import { currentMember } from "@/lib/auth";

export async function GET() {
  const member = await currentMember();
  if (!member) {
    return NextResponse.json({ member: null }, { status: 200 });
  }
  return NextResponse.json({ member });
}
