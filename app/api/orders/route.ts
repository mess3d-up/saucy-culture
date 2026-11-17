import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
export async function GET() {
  const orders = await prisma.order.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json(orders);
}
export async function POST(req: Request) {
  const { customerName, customerPhone, shippingAddr, items, totalINR } = await req.json();
  const orderNumber = `SC-IN-${Math.floor(100000 + Math.random() * 900000)}`;
  const order = await prisma.order.create({
    data: { orderNumber, customerName, customerPhone, shippingAddr, itemsJson: JSON.stringify(items), totalINR, paymentStatus: "PAYMENT_ON_HOLD" }
  });
  return NextResponse.json({ success: true, orderNumber: order.orderNumber, order });
}
export async function PATCH(req: Request) {
  const { id, paymentStatus } = await req.json();
  const updated = await prisma.order.update({ where: { id }, data: { paymentStatus } });
  return NextResponse.json(updated);
}
