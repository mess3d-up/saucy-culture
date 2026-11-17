import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
async function main() {
  const products = [
    { slug: "99-camo-jersey", name: "‘99 CAMO JERSEY’", category: "jerseys", collection: "camo", price: 1899, compareAt: 2499, badge: "ALL-STAR DROP", spec: "280 GSM Pro-Court Mesh • Tackle Twill #99", svgType: "jersey-camo", stock: 45 },
    { slug: "saucy-hoop-hoodie", name: "‘SAUCY HOOP HOODIE’", category: "hoodies", collection: "heavyweight", price: 2499, compareAt: 3299, badge: "450 GSM FLEECE", spec: "Pine Court Green • Puff Print Drip Logo", svgType: "hoodie-green", stock: 38 },
    { slug: "bape-court-camo-shorts", name: "‘BAPE-COURT CAMO SHORTS’", category: "shorts", collection: "camo", price: 1599, compareAt: 2199, badge: "DOUBLE MESH", spec: "Above-Knee 6\" Cut • Zippered Pocket", svgType: "shorts-camo", stock: 60 },
    { slug: "drip-ape-pump-cover-tee", name: "‘DRIP APE PUMP-COVER TEE’", category: "tees", collection: "heavyweight", price: 1399, compareAt: 1799, badge: "260 GSM BOXY", spec: "Drop-Shoulder Oversized • Acid Charcoal", svgType: "tee-charcoal", stock: 50 },
    { slug: "pine-court-mesh-shorts", name: "‘PINE COURT MESH SHORTS’", category: "shorts", collection: "heavyweight", price: 1499, compareAt: 1999, badge: "COURT STAPLE", spec: "Forest Green + Burnt Orange Ribbed Trim", svgType: "shorts-green", stock: 42 },
    { slug: "blackout-ape-hoodie", name: "‘BLACKOUT APE HOODIE’", category: "hoodies", collection: "heavyweight", price: 2599, compareAt: 3499, badge: "NIGHT COURT EDITION", spec: "450 GSM Pitch Black • Giant Back Ape Graphic", svgType: "hoodie-black", stock: 30 },
    { slug: "concrete-king-oversized-tee", name: "‘CONCRETE KING OVERSIZED TEE’", category: "tees", collection: "camo", price: 1299, compareAt: 1699, badge: "CREAM VINTAGE", spec: "250 GSM Combed Cotton • Camo Box Logo", svgType: "tee-cream", stock: 55 },
    { slug: "reversible-tourney-jersey", name: "‘REVERSIBLE TOURNEY JERSEY’", category: "jerseys", collection: "camo", price: 2199, compareAt: 2899, badge: "2-IN-1 REVERSIBLE", spec: "Side A: Saucy Camo / Side B: Blackout #99", svgType: "jersey-black", stock: 25 }
  ];
  for (const item of products) {
    await prisma.product.upsert({ where: { slug: item.slug }, update: item, create: item });
  }
  console.log("✅ Saucy Culture database seeded!");
}
main().finally(() => prisma.$disconnect());
