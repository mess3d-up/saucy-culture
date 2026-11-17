import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
export async function GET() {
  const members = await prisma.circleMember.findMany({ orderBy: { joinedAt: "desc" } });
  return NextResponse.json(members);
}
export async function POST(req: Request) {
  const { nickname, whatsappPhone, preferredSize } = await req.json();
  const member = await prisma.circleMember.upsert({
    where: { whatsappPhone },
    update: { nickname, preferredSize },
    create: { nickname, whatsappPhone, preferredSize: preferredSize || "L" }
  });
  return NextResponse.json({ success: true, vipCode: "SAUCYVIP10", member });
}
