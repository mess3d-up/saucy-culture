"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";

interface Product {
  id: number;
  slug: string;
  name: string;
  category: string;
  collection: string;
  price: number;
  compareAt: number;
  badge: string;
  spec: string;
  svgType: string;
}

interface CartItem {
  product: Product;
  size: string;
  qty: number;
}

export default function SaucyCultureStore() {
  const [products, setProducts] = useState<Product[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedSizes, setSelectedSizes] = useState<Record<number, string>>({});
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isSizeModalOpen, setIsSizeModalOpen] = useState(false);
  const [theme, setTheme] = useState<"day" | "night">("day");
  const [secs, setSecs] = useState(29);

  const [custName, setCustName] = useState("");
  const [custPhone, setCustPhone] = useState("");
  const [custAddress, setCustAddress] = useState("");
  const [orderConfirmation, setOrderConfirmation] = useState<string | null>(null);

  const [vipName, setVipName] = useState("");
  const [vipPhone, setVipPhone] = useState("");
  const [vipSize, setVipSize] = useState("L");
  const [vipMsg, setVipMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/products")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setProducts(data);
          if (data.length >= 2) {
            setCart([
              { product: data[0], size: "L", qty: 1 },
              { product: data[1], size: "L", qty: 1 },
            ]);
          }
        }
      });
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setSecs((prev) => (prev > 0 ? prev - 1 : 59));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const toggleTheme = () => {
    const next = theme === "day" ? "night" : "day";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
  };

  const addToCart = (product: Product) => {
    const sz = selectedSizes[product.id] || "L";
    setCart((prev) => {
      const existing = prev.find(
        (item) => item.product.id === product.id && item.size === sz
      );
      if (existing) {
        return prev.map((item) =>
          item.product.id === product.id && item.size === sz
            ? { ...item, qty: item.qty + 1 }
            : item
        );
      }
      return [...prev, { product, size: sz, qty: 1 }];
    });
    setIsCartOpen(true);
  };

  const updateCartQty = (idx: number, delta: number) => {
    setCart((prev) =>
      prev
        .map((item, i) => (i === idx ? { ...item, qty: item.qty + delta } : item))
        .filter((item) => item.qty > 0)
    );
  };

  const totalINR = cart.reduce(
    (sum, item) => sum + item.product.price * item.qty,
    0
  );

  const handleOrderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerName: custName,
        customerPhone: custPhone,
        shippingAddr: custAddress,
        items: cart.map((c) => ({
          productId: c.product.id,
          name: c.product.name,
          size: c.size,
          qty: c.qty,
          price: c.product.price,
        })),
        totalINR,
      }),
    });
    const data = await res.json();
    if (data.success) {
      setOrderConfirmation(
        `✅ ORDER RESERVED (${data.orderNumber})! Locked in for ${custName} (Payment Status: ON HOLD / COD).`
      );
      setCart([]);
    }
  };

  const handleVipSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch("/api/circle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nickname: vipName,
        whatsappPhone: vipPhone,
        preferredSize: vipSize,
      }),
    });
    const data = await res.json();
    if (data.success) {
      setVipMsg(`🏀 Welcome to Our Circle! Use VIP code ${data.vipCode}`);
      setVipName("");
      setVipPhone("");
    }
  };

  const filteredProducts = products.filter((p) => {
    const matchesCat =
      activeCategory === "all" || p.category === activeCategory;
    const matchesSearch =
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.spec.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCat && matchesSearch;
  });

  const renderGarmentSVG = (type: string) => {
    if (type === "jersey-camo" || type === "jersey-black") {
      const fill = type === "jersey-camo" ? "url(#garment-camo)" : "#161817";
      return (
        <svg viewBox="0 0 160 170" className="w-40 h-40 mx-auto drop-shadow-[3px_4px_0_#110A06]">
          <path d="M34,16 L56,16 C62,36 98,36 104,16 L126,16 L136,154 L24,154 Z" fill={fill} stroke="#110A06" strokeWidth="4.5" />
          <path d="M56,16 C62,36 98,36 104,16" fill="none" stroke="#D9531E" strokeWidth="5.5" />
          <text x="80" y="78" textAnchor="middle" fill="#D9381E" stroke="#FFFFFF" strokeWidth="1.5" fontFamily="Permanent Marker" fontSize="24">SAUCY</text>
          <text x="80" y="122" textAnchor="middle" fill="#E8881E" stroke="#110A06" strokeWidth="1.5" fontFamily="Anton" fontSize="34">99</text>
        </svg>
      );
    }
    if (type === "hoodie-green" || type === "hoodie-black") {
      const fill = type === "hoodie-green" ? "#193829" : "#151716";
      return (
        <svg viewBox="0 0 180 170" className="w-44 h-40 mx-auto drop-shadow-[3px_4px_0_#110A06]">
          <path d="M62,30 C62,6 118,6 118,30 Z" fill={fill} stroke="#110A06" strokeWidth="4" />
          <path d="M40,30 L140,30 L166,140 L142,146 L132,74 L132,156 L48,156 L48,74 L38,146 L14,140 Z" fill={fill} stroke="#110A06" strokeWidth="4.5" strokeLinejoin="round" />
          <text x="90" y="86" textAnchor="middle" fill="#D9531E" stroke="#FFFFFF" strokeWidth="1.2" fontFamily="Permanent Marker" fontSize="22">SAUCY</text>
        </svg>
      );
    }
    if (type === "shorts-camo" || type === "shorts-green") {
      const fill = type === "shorts-camo" ? "url(#garment-camo)" : "#193829";
      return (
        <svg viewBox="0 0 170 150" className="w-44 h-36 mx-auto drop-shadow-[3px_4px_0_#110A06]">
          <rect x="34" y="16" width="102" height="16" fill="#132A1E" stroke="#110A06" strokeWidth="4" />
          <path d="M34,32 L136,32 L148,128 L92,128 L85,84 L78,128 L22,128 Z" fill={fill} stroke="#110A06" strokeWidth="4.5" />
          <path d="M22,120 L78,120 M92,120 L148,120" stroke="#D9531E" strokeWidth="6" />
        </svg>
      );
    }
    const teeFill = type === "tee-charcoal" ? "#232726" : "#E8E2D5";
    return (
      <svg viewBox="0 0 180 165" className="w-44 h-40 mx-auto drop-shadow-[3px_4px_0_#110A06]">
        <path d="M48,22 L70,22 C76,34 104,34 110,22 L132,22 L166,68 L142,88 L130,68 L130,154 L50,154 L50,68 L38,88 L14,68 Z" fill={teeFill} stroke="#110A06" strokeWidth="4.5" strokeLinejoin="round" />
        <text x="90" y="82" textAnchor="middle" fill="#D9531E" fontFamily="Permanent Marker" fontSize="22">SAUCY</text>
      </svg>
    );
  };

  return (
    <>
      <svg className="hidden" aria-hidden="true">
        <defs>
          <symbol id="saucy-ape" viewBox="0 0 120 130">
            <circle cx="16" cy="68" r="13" fill="#4E311D" stroke="#110A06" strokeWidth="5" />
            <circle cx="16" cy="68" r="7" fill="#A57551" />
            <circle cx="104" cy="68" r="13" fill="#4E311D" stroke="#110A06" strokeWidth="5" />
            <circle cx="104" cy="68" r="7" fill="#A57551" />
            <path d="M22,42 C22,14 98,14 98,42 C106,68 102,112 60,120 C18,112 14,68 22,42 Z" fill="#4E311D" stroke="#110A06" strokeWidth="6" />
            <path d="M20,40 Q60,26 100,40 L102,52 Q60,38 18,52 Z" fill="#E04F16" stroke="#110A06" strokeWidth="4.5" />
            <path d="M28,62 C28,48 52,48 60,54 C68,48 92,48 92,62 C96,74 96,108 60,114 C24,108 24,74 28,62 Z" fill="#B5835A" stroke="#110A06" strokeWidth="4.5" />
            <path d="M28,56 L55,66 L60,62 L65,66 L92,56" fill="none" stroke="#110A06" strokeWidth="6" strokeLinecap="round" />
            <ellipse cx="44" cy="67" rx="7" ry="5" fill="#FFFFFF" stroke="#110A06" strokeWidth="3" />
            <circle cx="45" cy="67" r="3" fill="#110A06" />
            <ellipse cx="76" cy="67" rx="7" ry="5" fill="#FFFFFF" stroke="#110A06" strokeWidth="3" />
            <circle cx="75" cy="67" r="3" fill="#110A06" />
            <path d="M40,98 Q60,91 80,98" fill="none" stroke="#110A06" strokeWidth="4.5" strokeLinecap="round" />
          </symbol>
          <symbol id="saucy-basketball" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="46" fill="#D9531E" stroke="#110A06" strokeWidth="5" />
            <path d="M4,50 Q50,42 96,50 M50,4 Q44,50 50,96" fill="none" stroke="#110A06" strokeWidth="4" />
          </symbol>
          <pattern id="garment-camo" width="60" height="60" patternUnits="userSpaceOnUse">
            <rect width="60" height="60" fill="#2A442B" />
            <path d="M10,5 C22,2 30,15 24,25 C18,35 5,30 4,18 Z" fill="#5E7143" />
            <path d="M38,8 C50,4 58,20 50,32 C42,44 28,35 32,20 Z" fill="#172819" />
            <circle cx="46" cy="46" r="7" fill="#D9531E" />
          </pattern>
        </defs>
      </svg>

      <div className="bg-[#132A1E] text-[#EFECE4] border-b-2 border-[#110A06] py-2 overflow-hidden">
        <div className="animate-marquee font-bebas text-base tracking-widest flex items-center space-x-10">
          <span>🏀 SAUCY CULTURE INDIA (SAUCYCULTURE.IN) — THE NEW HOOP ERA</span>
          <span>🔥 ALL-STAR CAMO DROP LIVE NOW</span>
          <span>🚚 FREE SHIPPING ACROSS INDIA ABOVE ₹1,999</span>
          <span>🦍 450 GSM FRENCH TERRY HOODIES & PRO-MESH SHORTS</span>
        </div>
      </div>

      <header className="sticky top-0 z-40 border-b-4 border-[#110A06]" style={{ backgroundColor: "var(--bg-nav)" }}>
        <div className="max-w-[1440px] mx-auto px-4 sm:px-8 h-24 flex items-center justify-between gap-4">
          <a href="#top" className="flex items-center gap-3">
            <div className="saucy-logo-text text-3xl sm:text-4xl text-center leading-none -rotate-2">
              SAUCY<br />CULTURE
            </div>
            <svg className="w-14 h-14"><use href="#saucy-ape" /></svg>
          </a>

          <nav className="hidden lg:flex items-center gap-8 font-bebas text-2xl tracking-wider">
            <a href="#shop" className="hover:text-[#D9531E]">SHOP</a>
            <a href="#circle" className="hover:text-[#D9531E]">OUR CIRCLE</a>
            <button onClick={() => setIsSizeModalOpen(true)} className="text-sm font-sans font-bold px-3 py-1 rounded border-2 border-current">
              SIZE CHART
            </button>
            <Link href="/admin" className="text-sm font-sans font-bold px-3 py-1 rounded bg-[#193829] text-white">
              OWNER ADMIN
            </Link>
          </nav>

          <div className="flex items-center gap-3">
            <input
              type="text"
              placeholder="Search drops..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="hidden sm:block w-44 px-3 py-2 rounded border-2 border-[#110A06] bg-black/10 text-sm font-semibold"
            />
            <button
              onClick={toggleTheme}
              className="px-3.5 py-2 rounded border-2 border-[#110A06] bg-[#193829] text-[#EFECE4] font-bebas text-lg tracking-wider shadow-[3px_3px_0_#110A06]"
            >
              {theme === "day" ? "☀️ DAY COURT" : "🌙 NIGHT COURT"}
            </button>
            <button
              onClick={() => setIsCartOpen(true)}
              className="relative px-4 py-2 rounded border-2 border-[#110A06] bg-[#E8881E] text-[#110A06] font-bebas text-xl shadow-[3px_3px_0_#110A06]"
            >
              BAG ({cart.reduce((s, i) => s + i.qty, 0)})
            </button>
          </div>
        </div>
      </header>

      <section id="top" className="relative w-full border-b-4 border-[#110A06] overflow-hidden" style={{ backgroundColor: "var(--court-sky)" }}>
        <div className="hidden md:block absolute left-0 top-0 bottom-0 w-16 lg:w-24 bape-camo-border border-r-4 border-[#110A06] z-10" />
        <div className="hidden md:block absolute right-0 top-0 bottom-0 w-16 lg:w-24 bape-camo-border border-l-4 border-[#110A06] z-10" />

        <div className="relative max-w-[1320px] mx-auto px-6 lg:px-28 py-14 chainlink-bg grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-6 flex flex-col items-center text-center">
            <svg className="w-24 h-24 -mb-2 drop-shadow-[0_5px_0_#110A06]"><use href="#saucy-ape" /></svg>
            <div className="saucy-hero-graffiti text-6xl sm:text-8xl -rotate-3">
              SAUCY<br />CULTURE
            </div>
            <p className="mt-4 font-bebas text-xl tracking-widest px-4 py-1 bg-[#193829] text-white border-2 border-[#110A06]">
              OFFICIAL INDIA FLAGSHIP • SAUCYCULTURE.IN
            </p>
          </div>

          <div className="lg:col-span-6 flex flex-col items-start">
            <h1 className="font-display text-6xl sm:text-7xl uppercase leading-[0.92] mb-3">
              THE NEW<br />HOOP ERA
            </h1>
            <p className="font-bebas text-3xl tracking-wider mb-6 border-l-4 border-[#D9531E] pl-3">
              BASKETBALL x STREETWEAR | ALL-STAR DROP
            </p>
            <div className="flex flex-wrap gap-4 mb-6">
              <a href="#shop" className="px-7 py-3.5 rounded bg-[#B8331A] text-white font-bebas text-2xl tracking-wider border-2 border-[#110A06] shadow-[4px_4px_0_#110A06]">
                SHOP THE DROP
              </a>
              <a href="#circle" className="px-7 py-3.5 rounded bg-[#E8881E] text-[#110A06] font-bebas text-2xl tracking-wider border-2 border-[#110A06] shadow-[4px_4px_0_#110A06]">
                JOIN OUR CIRCLE
              </a>
            </div>
            <div className="p-3 rounded border-2 border-[#110A06] bg-black/10 font-bebas text-xl tracking-wider">
              ⏳ NEXT RESTOCK IN: 04D : 11H : 48M : {String(secs).padStart(2, "0")}S
            </div>
          </div>
        </div>
      </section>

      <section id="shop" className="max-w-[1360px] mx-auto w-full px-4 sm:px-8 py-14">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-8 border-b-2 border-current pb-4">
          <h2 className="font-display text-4xl sm:text-5xl uppercase">ALL-STAR LOCKER ROOM</h2>
          <div className="flex flex-wrap gap-2">
            {["all", "tees", "hoodies", "shorts", "jerseys"].map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-5 py-2 rounded font-bebas text-xl tracking-wider border-2 border-[#110A06] ${
                  activeCategory === cat ? "bg-[#D9531E] text-white" : "bg-black/10"
                }`}
              >
                {cat.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-7">
          {filteredProducts.map((p) => {
            const curSize = selectedSizes[p.id] || "L";
            return (
              <div key={p.id} className="saucy-card rounded-xl p-5 flex flex-col justify-between">
                <div>
                  <span className="px-2.5 py-0.5 rounded bg-[#193829] text-white font-bebas text-xs tracking-widest border border-[#110A06]">
                    {p.badge}
                  </span>
                  <div className="py-4 my-3 rounded bg-black/5 flex justify-center">
                    {renderGarmentSVG(p.svgType)}
                  </div>
                  <h3 className="font-bebas text-3xl">{p.name}</h3>
                  <p className="text-xs opacity-75 mb-3">{p.spec}</p>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-extrabold">SIZE:</span>
                    <div className="flex gap-1">
                      {["S", "M", "L", "XL", "XXL"].map((sz) => (
                        <button
                          key={sz}
                          onClick={() => setSelectedSizes({ ...selectedSizes, [p.id]: sz })}
                          className={`w-7 h-7 rounded text-xs font-extrabold border border-[#110A06] ${
                            curSize === sz ? "bg-[#D9531E] text-white" : "bg-black/10"
                          }`}
                        >
                          {sz}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-current/20">
                    <div>
                      <span className="font-bebas text-3xl text-[#D9531E]">₹{p.price.toLocaleString("en-IN")}</span>
                      <span className="text-xs line-through opacity-55 ml-1">₹{p.compareAt.toLocaleString("en-IN")}</span>
                    </div>
                    <button
                      onClick={() => addToCart(p)}
                      className="px-4 py-2 rounded bg-[#193829] text-white font-bebas text-lg border-2 border-[#110A06] hover:bg-[#D9531E]"
                    >
                      + ADD TO BAG
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section id="circle" className="max-w-[1360px] mx-auto px-4 sm:px-8 pb-20">
        <div className="saucy-card rounded-2xl p-8 bg-[#193829] text-[#EFECE4] grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
          <div>
            <h2 className="font-display text-4xl sm:text-5xl uppercase mb-3">OUR CIRCLE // VIP HOOPERS CLUB</h2>
            <p className="text-sm opacity-90">
              Built for the Indian basketball community. Join Our Circle for early drop passwords, secret discount codes, and 3v3 city tournament invites.
            </p>
          </div>
          <form onSubmit={handleVipSubmit} className="space-y-3 bg-[#11261B] p-6 rounded-xl border-2 border-[#110A06]">
            <input
              value={vipName}
              onChange={(e) => setVipName(e.target.value)}
              required
              placeholder="Your Name / Court Nickname"
              className="w-full px-4 py-2.5 rounded text-[#110A06] font-semibold text-sm"
            />
            <input
              value={vipPhone}
              onChange={(e) => setVipPhone(e.target.value)}
              required
              placeholder="WhatsApp Number (+91)"
              className="w-full px-4 py-2.5 rounded text-[#110A06] font-semibold text-sm"
            />
            <button type="submit" className="w-full py-3 rounded bg-[#D9531E] text-white font-bebas text-2xl tracking-wider border-2 border-[#110A06]">
              JOIN OUR CIRCLE
            </button>
            {vipMsg && <p className="text-xs font-bold text-green-300 text-center">{vipMsg}</p>}
          </form>
        </div>
      </section>

      {isSizeModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="saucy-card max-w-xl w-full rounded-xl p-6 relative">
            <button onClick={() => setIsSizeModalOpen(false)} className="absolute top-4 right-4 px-3 py-1 rounded bg-[#B8331A] text-white font-bold">✕</button>
            <h3 className="font-bebas text-4xl mb-2">OVERSIZED FIT CHART (INCHES)</h3>
            <p className="text-xs mb-4">Drop-shoulder relaxed basketball silhouette. Order your usual size for a boxy fit.</p>
            <table className="w-full text-sm border-2 border-[#110A06]">
              <thead className="bg-[#193829] text-white font-bebas text-lg">
                <tr><th className="p-2">SIZE</th><th className="p-2">CHEST</th><th className="p-2">LENGTH</th><th className="p-2">SHORTS WAIST</th></tr>
              </thead>
              <tbody className="font-bold text-center">
                <tr><td className="p-2 border">S</td><td className="p-2 border">42&quot;</td><td className="p-2 border">27.5&quot;</td><td className="p-2 border">28-30&quot;</td></tr>
                <tr><td className="p-2 border">M</td><td className="p-2 border">44&quot;</td><td className="p-2 border">28.5&quot;</td><td className="p-2 border">30-32&quot;</td></tr>
                <tr><td className="p-2 border">L</td><td className="p-2 border">46&quot;</td><td className="p-2 border">29.5&quot;</td><td className="p-2 border">32-34&quot;</td></tr>
                <tr><td className="p-2 border">XL</td><td className="p-2 border">48&quot;</td><td className="p-2 border">30.5&quot;</td><td className="p-2 border">34-36&quot;</td></tr>
                <tr><td className="p-2 border">XXL</td><td className="p-2 border">50&quot;</td><td className="p-2 border">31.5&quot;</td><td className="p-2 border">36-38&quot;</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {isCartOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 flex justify-end">
          <div className="w-full max-w-md h-full p-6 border-l-4 border-[#110A06] flex flex-col justify-between overflow-y-auto" style={{ backgroundColor: "var(--bg-card)" }}>
            <div>
              <div className="flex justify-between items-center border-b-2 border-[#110A06] pb-3 mb-4">
                <h3 className="font-bebas text-3xl">YOUR LOCKER BAG</h3>
                <button onClick={() => setIsCartOpen(false)} className="px-3 py-1 rounded bg-[#B8331A] text-white font-bold">✕</button>
              </div>
              <div className="space-y-3">
                {cart.map((item, idx) => (
                  <div key={idx} className="p-3 rounded border-2 border-[#110A06] flex justify-between items-center">
                    <div>
                      <div className="font-bebas text-2xl">{item.product.name}</div>
                      <div className="text-xs font-bold">Size: {item.size} • ₹{item.product.price}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => updateCartQty(idx, -1)} className="w-7 h-7 border border-[#110A06] font-bold">-</button>
                      <span className="font-bold">{item.qty}</span>
                      <button onClick={() => updateCartQty(idx, 1)} className="w-7 h-7 border border-[#110A06] font-bold">+</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <form onSubmit={handleOrderSubmit} className="border-t-2 border-[#110A06] pt-4 space-y-2.5">
              <div className="flex justify-between font-bebas text-3xl">
                <span>TOTAL (INR)</span>
                <span className="text-[#D9531E]">₹{totalINR.toLocaleString("en-IN")}</span>
              </div>
              <input value={custName} onChange={(e) => setCustName(e.target.value)} required placeholder="Full Name" className="w-full px-3 py-2 rounded border-2 border-[#110A06] text-black text-sm font-semibold" />
              <input value={custPhone} onChange={(e) => setCustPhone(e.target.value)} required placeholder="Phone / WhatsApp (+91)" className="w-full px-3 py-2 rounded border-2 border-[#110A06] text-black text-sm font-semibold" />
              <input value={custAddress} onChange={(e) => setCustAddress(e.target.value)} required placeholder="Full Delivery Address & PIN" className="w-full px-3 py-2 rounded border-2 border-[#110A06] text-black text-sm font-semibold" />
              <button type="submit" className="w-full py-3 rounded bg-[#D9531E] text-white font-bebas text-2xl tracking-wider border-2 border-[#110A06]">
                LOCK IN ORDER (PAYMENT HOLD / COD)
              </button>
              {orderConfirmation && (
                <div className="p-3 rounded bg-[#193829] text-white text-xs font-bold">{orderConfirmation}</div>
              )}
            </form>
          </div>
        </div>
      )}
    </>
  );
}
