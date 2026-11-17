"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";

interface Order {
  id: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  shippingAddr: string;
  itemsJson: string;
  totalINR: number;
  paymentStatus: string;
  createdAt: string;
}

interface CircleMember {
  id: string;
  nickname: string;
  whatsappPhone: string;
  preferredSize: string;
  joinedAt: string;
}

export default function AdminDashboard() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [members, setMembers] = useState<CircleMember[]>([]);

  const loadData = async () => {
    const [ordRes, memRes] = await Promise.all([
      fetch("/api/orders"),
      fetch("/api/circle"),
    ]);
    const ordData = await ordRes.json();
    const memData = await memRes.json();
    if (Array.isArray(ordData)) setOrders(ordData);
    if (Array.isArray(memData)) setMembers(memData);
  };

  useEffect(() => {
    loadData();
  }, []);

  const updateStatus = async (id: string, paymentStatus: string) => {
    await fetch("/api/orders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, paymentStatus }),
    });
    loadData();
  };

  return (
    <div className="min-h-screen p-6 sm:p-10 max-w-6xl mx-auto">
      <div className="flex items-center justify-between border-b-4 border-[#110A06] pb-4 mb-8">
        <div>
          <span className="text-xs font-extrabold uppercase text-[#D9531E]">
            SAUCYCULTURE.IN BACKOFFICE
          </span>
          <h1 className="font-display text-5xl uppercase">
            FOUNDER LOCKER ROOM DASHBOARD
          </h1>
        </div>
        <Link
          href="/"
          className="px-5 py-2.5 rounded bg-[#193829] text-white font-bebas text-xl border-2 border-[#110A06]"
        >
          ← BACK TO STOREFRONT
        </Link>
      </div>

      <h2 className="font-bebas text-3xl mb-4">
        📦 INCOMING ORDERS ({orders.length})
      </h2>
      <div className="space-y-4 mb-12">
        {orders.length === 0 ? (
          <p className="text-sm opacity-75">
            No orders placed yet. Place a test order from the storefront!
          </p>
        ) : (
          orders.map((o) => {
            const items = JSON.parse(o.itemsJson || "[]");
            return (
              <div
                key={o.id}
                className="saucy-card rounded-xl p-5 flex flex-col md:flex-row justify-between gap-4"
              >
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <span className="font-bebas text-2xl text-[#D9531E]">
                      {o.orderNumber}
                    </span>
                    <span className="px-2.5 py-0.5 rounded bg-[#193829] text-white text-xs font-extrabold">
                      {o.paymentStatus}
                    </span>
                  </div>
                  <p className="text-sm font-bold">
                    {o.customerName} • 📞 {o.customerPhone}
                  </p>
                  <p className="text-xs opacity-80 mb-2">📍 {o.shippingAddr}</p>
                  <div className="text-xs font-semibold bg-black/5 p-2 rounded">
                    {items.map((it: any, idx: number) => (
                      <div key={idx}>
                        • {it.qty}x {it.name} (Size {it.size}) — ₹{it.price}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col justify-between items-end">
                  <div className="font-bebas text-4xl text-[#D9531E]">
                    ₹{o.totalINR.toLocaleString("en-IN")}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => updateStatus(o.id, "COD_CONFIRMED")}
                      className="px-3 py-1.5 rounded bg-[#193829] text-white text-xs font-extrabold border border-[#110A06]"
                    >
                      CONFIRM COD
                    </button>
                    <button
                      onClick={() => updateStatus(o.id, "DISPATCHED")}
                      className="px-3 py-1.5 rounded bg-[#D9531E] text-white text-xs font-extrabold border border-[#110A06]"
                    >
                      MARK DISPATCHED
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <h2 className="font-bebas text-3xl mb-4">
        🦍 ‘OUR CIRCLE’ VIP MEMBERS ({members.length})
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {members.map((m) => (
          <div key={m.id} className="saucy-card rounded-lg p-4">
            <div className="font-bebas text-2xl">{m.nickname}</div>
            <div className="text-xs font-bold">WhatsApp: {m.whatsappPhone}</div>
            <div className="text-xs opacity-75">
              Preferred Fit Size: {m.preferredSize}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
