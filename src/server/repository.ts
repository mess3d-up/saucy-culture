import { and, asc, desc, eq, inArray, isNotNull, lt, sql } from 'drizzle-orm';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_STORE_SETTINGS, INITIAL_PRODUCTS } from '../data/catalog';
import {
  assertProductionDatabaseConfigured,
  getDb,
  hasDatabaseUrl,
} from '../db/index';
import {
  adminAuditLogsTable,
  adminsTable,
  cartLeadsTable,
  circleMembersTable,
  ordersTable,
  orderTrackingTable,
  productsTable,
  pushSubscriptionsTable,
  restockAlertsTable,
  storeSettingsTable,
} from '../db/schema';
import {
  APPAREL_SIZES,
  type AdminAccess,
  type ApparelCategory,
  type ApparelSize,
  type AuditLogEntry,
  type AuditVerificationResult,
  type CartLead,
  type CircleMember,
  type LeadChannel,
  type Order,
  type OrderItemRecord,
  type OrderStatus,
  type OrderTracking,
  type PaymentMethod,
  type Product,
  type PushSubscriptionInput,
  type RestockAlert,
  type StockBySize,
  type StoreSettings,
} from '../types/store';
import {
  canManageAuditLogs,
  createChainedAuditEntry,
  OWNER_EMAIL,
  verifyAuditChain,
} from '../utils/audit';
import {
  calculateAuthoritativeTotals,
  normalizeTrackingToken,
  slugifyProductName,
  validateCheckoutInput,
  validateLeadContact,
  validatePushEndpointUrl,
} from '../utils/commerce';
import type { StoredPushSub } from './push';

interface LocalOrderTrackingRecord extends OrderTracking {
  trackingToken: string;
}

interface LocalStoreData {
  products: Product[];
  orders: Order[];
  orderTracking: LocalOrderTrackingRecord[];
  circleMembers: CircleMember[];
  cartLeads: CartLead[];
  restockAlerts: RestockAlert[];
  pushSubscriptions: (StoredPushSub & {
    contact: string;
    topic: 'CART_ABANDON' | 'RESTOCK' | 'ALL';
    productId?: string;
    size?: ApparelSize;
    createdAt: string;
    updatedAt: string;
  })[];
  settings: StoreSettings;
  admins: AdminAccess[];
  auditLogs: AuditLogEntry[];
}

const DATA_DIR = path.resolve(process.cwd(), '.data');
const DATA_FILE = path.join(DATA_DIR, 'saucy-store.json');

let pgInitialized = false;
let pgInitPromise: Promise<void> | null = null;

function buildDefaultLocalStore(): LocalStoreData {
  const now = new Date().toISOString();
  return {
    products: INITIAL_PRODUCTS.map((p) => ({ ...p, createdAt: now, updatedAt: now })),
    orders: [],
    orderTracking: [],
    circleMembers: [],
    cartLeads: [],
    restockAlerts: [],
    pushSubscriptions: [],
    settings: { ...DEFAULT_STORE_SETTINGS, updatedAt: now },
    admins: [
      {
        email: OWNER_EMAIL,
        role: 'SUPER_ADMIN',
        addedBy: 'system',
        createdAt: now,
      },
    ],
    auditLogs: [],
  };
}

function readLocalStore(): LocalStoreData {
  assertProductionDatabaseConfigured();
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DATA_FILE)) {
    const initial = buildDefaultLocalStore();
    fs.writeFileSync(DATA_FILE, JSON.stringify(initial, null, 2), 'utf-8');
    return initial;
  }
  const raw = fs.readFileSync(DATA_FILE, 'utf-8');
  const parsed = JSON.parse(raw) as Partial<LocalStoreData>;
  const defaults = buildDefaultLocalStore();
  return {
    products: parsed.products ?? defaults.products,
    orders: parsed.orders ?? [],
    orderTracking: (parsed.orderTracking ?? []) as LocalOrderTrackingRecord[],
    circleMembers: parsed.circleMembers ?? [],
    cartLeads: parsed.cartLeads ?? [],
    restockAlerts: parsed.restockAlerts ?? [],
    pushSubscriptions: parsed.pushSubscriptions ?? [],
    settings: { ...DEFAULT_STORE_SETTINGS, ...(parsed.settings ?? {}) },
    admins:
      parsed.admins && parsed.admins.length > 0
        ? parsed.admins
        : defaults.admins,
    auditLogs: parsed.auditLogs ?? [],
  };
}

function writeLocalStore(data: LocalStoreData): void {
  assertProductionDatabaseConfigured();
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

async function ensurePgReady(): Promise<void> {
  const db = getDb();
  if (!db) return;
  if (pgInitialized) return;
  if (pgInitPromise) return pgInitPromise;

  pgInitPromise = (async () => {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        slug TEXT NOT NULL,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        collection TEXT NOT NULL,
        price_inr INTEGER NOT NULL,
        compare_at_inr INTEGER,
        badge TEXT,
        spec TEXT NOT NULL,
        description TEXT NOT NULL,
        image TEXT NOT NULL,
        gallery JSONB NOT NULL DEFAULT '[]'::jsonb,
        stock_by_size JSONB NOT NULL,
        featured BOOLEAN NOT NULL DEFAULT FALSE,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        order_number TEXT NOT NULL UNIQUE,
        tracking_token TEXT NOT NULL DEFAULT '',
        customer_name TEXT NOT NULL,
        customer_phone TEXT NOT NULL,
        shipping_addr TEXT NOT NULL,
        city TEXT NOT NULL,
        pincode TEXT NOT NULL,
        items JSONB NOT NULL,
        subtotal_inr INTEGER NOT NULL,
        shipping_inr INTEGER NOT NULL,
        discount_inr INTEGER NOT NULL DEFAULT 0,
        promo_code TEXT NOT NULL DEFAULT '',
        total_inr INTEGER NOT NULL,
        payment_method TEXT NOT NULL,
        upi_ref TEXT NOT NULL DEFAULT '',
        payment_status TEXT NOT NULL,
        stock_deducted BOOLEAN NOT NULL DEFAULT TRUE,
        reserved_until TIMESTAMPTZ,
        courier_name TEXT NOT NULL DEFAULT '',
        tracking_id TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS order_tracking (
        order_number TEXT PRIMARY KEY,
        order_id TEXT NOT NULL,
        tracking_token TEXT NOT NULL DEFAULT '',
        phone_last_4 TEXT NOT NULL DEFAULT '',
        customer_first_name TEXT NOT NULL,
        city TEXT NOT NULL,
        items_summary JSONB NOT NULL,
        total_inr INTEGER NOT NULL,
        payment_method TEXT NOT NULL,
        payment_status TEXT NOT NULL,
        courier_name TEXT NOT NULL DEFAULT '',
        tracking_id TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS rate_limits (
        bucket_key TEXT PRIMARY KEY,
        count INTEGER NOT NULL DEFAULT 0,
        reset_at TIMESTAMPTZ NOT NULL
      )
    `);
    // Idempotent column migrations for existing live databases
    await db.execute(
      sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_token TEXT NOT NULL DEFAULT ''`
    );
    await db.execute(sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS reserved_until TIMESTAMPTZ`);
    await db.execute(
      sql`ALTER TABLE order_tracking ADD COLUMN IF NOT EXISTS tracking_token TEXT NOT NULL DEFAULT ''`
    );
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS circle_members (
        id TEXT PRIMARY KEY,
        nickname TEXT NOT NULL,
        whatsapp_phone TEXT NOT NULL UNIQUE,
        preferred_size TEXT NOT NULL,
        vip_code TEXT NOT NULL,
        joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS cart_leads (
        id TEXT PRIMARY KEY,
        contact TEXT NOT NULL,
        channel TEXT NOT NULL,
        items_summary JSONB NOT NULL,
        cart_total_inr INTEGER NOT NULL,
        promo_offered TEXT NOT NULL,
        push_enabled BOOLEAN NOT NULL DEFAULT FALSE,
        status TEXT NOT NULL DEFAULT 'NEW',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS restock_alerts (
        id TEXT PRIMARY KEY,
        product_id TEXT NOT NULL,
        product_name TEXT NOT NULL,
        size TEXT NOT NULL,
        contact TEXT NOT NULL,
        push_enabled BOOLEAN NOT NULL DEFAULT FALSE,
        status TEXT NOT NULL DEFAULT 'WAITING',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS push_subscriptions (
        id TEXT PRIMARY KEY,
        endpoint TEXT NOT NULL UNIQUE,
        p256dh TEXT NOT NULL,
        auth TEXT NOT NULL,
        contact TEXT NOT NULL DEFAULT '',
        topic TEXT NOT NULL DEFAULT 'ALL',
        product_id TEXT,
        size TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS store_settings (
        id TEXT PRIMARY KEY,
        upi_id TEXT NOT NULL,
        upi_merchant_name TEXT NOT NULL,
        free_shipping_threshold_inr INTEGER NOT NULL,
        shipping_fee_inr INTEGER NOT NULL,
        vip_promo_code TEXT NOT NULL,
        vip_discount_percent INTEGER NOT NULL,
        announcement_text TEXT NOT NULL,
        hero_title TEXT NOT NULL DEFAULT 'THE NEW HOOP ERA',
        hero_subtitle TEXT NOT NULL DEFAULT 'BASKETBALL × STREETWEAR · ALL-STAR DROP',
        maintenance_mode BOOLEAN NOT NULL DEFAULT FALSE,
        support_whatsapp TEXT NOT NULL,
        support_email TEXT NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS admins (
        email TEXT PRIMARY KEY,
        role TEXT NOT NULL DEFAULT 'ADMIN',
        added_by TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS admin_audit_logs (
        id TEXT PRIMARY KEY,
        seq SERIAL NOT NULL,
        actor_email TEXT NOT NULL,
        actor_role TEXT NOT NULL,
        action TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        details_json TEXT NOT NULL,
        ip_address TEXT NOT NULL,
        prev_hash TEXT NOT NULL,
        entry_hash TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `);

    const existingSettings = await db.select().from(storeSettingsTable).limit(1);
    if (existingSettings.length === 0) {
      await db
        .insert(storeSettingsTable)
        .values({
          id: 'main',
          upiId: DEFAULT_STORE_SETTINGS.upiId,
          upiMerchantName: DEFAULT_STORE_SETTINGS.upiMerchantName,
          freeShippingThresholdINR: DEFAULT_STORE_SETTINGS.freeShippingThresholdINR,
          shippingFeeINR: DEFAULT_STORE_SETTINGS.shippingFeeINR,
          vipPromoCode: DEFAULT_STORE_SETTINGS.vipPromoCode,
          vipDiscountPercent: DEFAULT_STORE_SETTINGS.vipDiscountPercent,
          announcementText: DEFAULT_STORE_SETTINGS.announcementText,
          heroTitle: DEFAULT_STORE_SETTINGS.heroTitle,
          heroSubtitle: DEFAULT_STORE_SETTINGS.heroSubtitle,
          maintenanceMode: DEFAULT_STORE_SETTINGS.maintenanceMode,
          supportWhatsapp: DEFAULT_STORE_SETTINGS.supportWhatsapp,
          supportEmail: DEFAULT_STORE_SETTINGS.supportEmail,
        })
        .onConflictDoNothing();
    }

    const existingOwner = await db
      .select()
      .from(adminsTable)
      .where(eq(adminsTable.email, OWNER_EMAIL));
    if (existingOwner.length === 0) {
      await db
        .insert(adminsTable)
        .values({
          email: OWNER_EMAIL,
          role: 'SUPER_ADMIN',
          addedBy: 'system',
        })
        .onConflictDoNothing();
    }

    const existingProducts = await db.select({ id: productsTable.id }).from(productsTable).limit(1);
    if (existingProducts.length === 0) {
      for (const p of INITIAL_PRODUCTS) {
        await db
          .insert(productsTable)
          .values({
            id: p.id,
            slug: p.slug,
            name: p.name,
            category: p.category,
            collection: p.collection,
            priceINR: p.priceINR,
            compareAtINR: p.compareAtINR ?? null,
            badge: p.badge ?? null,
            spec: p.spec,
            description: p.description,
            image: p.image,
            gallery: p.gallery,
            stockBySize: p.stockBySize,
            featured: p.featured,
            active: p.active,
          })
          .onConflictDoNothing();
      }
    }

    pgInitialized = true;
  })();

  await pgInitPromise;
}

function mapPgProduct(row: typeof productsTable.$inferSelect): Product {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    category: row.category,
    collection: row.collection,
    priceINR: row.priceINR,
    compareAtINR: row.compareAtINR ?? undefined,
    badge: row.badge ?? undefined,
    spec: row.spec,
    description: row.description,
    image: row.image,
    gallery: Array.isArray(row.gallery) ? row.gallery : [],
    stockBySize: row.stockBySize,
    featured: row.featured,
    active: row.active,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapPgSettings(row: typeof storeSettingsTable.$inferSelect): StoreSettings {
  return {
    upiId: row.upiId,
    upiMerchantName: row.upiMerchantName,
    freeShippingThresholdINR: row.freeShippingThresholdINR,
    shippingFeeINR: row.shippingFeeINR,
    vipPromoCode: row.vipPromoCode,
    vipDiscountPercent: row.vipDiscountPercent,
    announcementText: row.announcementText,
    heroTitle: row.heroTitle,
    heroSubtitle: row.heroSubtitle,
    maintenanceMode: row.maintenanceMode,
    supportWhatsapp: row.supportWhatsapp,
    supportEmail: row.supportEmail,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export interface ActorContext {
  email: string;
  role: 'OWNER' | 'ADMIN';
  ipAddress: string;
}

async function appendAuditLocal(
  store: LocalStoreData,
  actor: ActorContext,
  action: string,
  entityType: string,
  entityId: string,
  details: unknown
): Promise<AuditLogEntry> {
  const prev =
    store.auditLogs.length > 0
      ? store.auditLogs[store.auditLogs.length - 1]
      : null;
  const entry = createChainedAuditEntry({
    id: `aud_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    prevEntry: prev,
    actorEmail: actor.email,
    actorRole: actor.role,
    action,
    entityType,
    entityId,
    details,
    ipAddress: actor.ipAddress,
  });
  store.auditLogs.push(entry);
  return entry;
}

async function appendAuditPg(
  tx: Parameters<Parameters<NonNullable<ReturnType<typeof getDb>>['transaction']>[0]>[0],
  actor: ActorContext,
  action: string,
  entityType: string,
  entityId: string,
  details: unknown
): Promise<AuditLogEntry> {
  const [prev] = await tx
    .select({
      seq: adminAuditLogsTable.seq,
      entryHash: adminAuditLogsTable.entryHash,
    })
    .from(adminAuditLogsTable)
    .orderBy(desc(adminAuditLogsTable.seq))
    .limit(1);

  const entry = createChainedAuditEntry({
    id: `aud_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    prevEntry: prev ?? null,
    actorEmail: actor.email,
    actorRole: actor.role,
    action,
    entityType,
    entityId,
    details,
    ipAddress: actor.ipAddress,
  });

  await tx.insert(adminAuditLogsTable).values({
    id: entry.id,
    seq: entry.seq,
    actorEmail: entry.actorEmail,
    actorRole: entry.actorRole,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    detailsJson: entry.detailsJson,
    ipAddress: entry.ipAddress,
    prevHash: entry.prevHash,
    entryHash: entry.entryHash,
    createdAt: entry.createdAt,
  });

  return entry;
}

export async function getStorageInfo(): Promise<{ mode: 'postgres' | 'local-json' }> {
  assertProductionDatabaseConfigured();
  return { mode: hasDatabaseUrl() ? 'postgres' : 'local-json' };
}

export async function verifyDatabaseConnectionAndSchema(): Promise<{
  mode: 'postgres' | 'local-json';
  connected: boolean;
}> {
  assertProductionDatabaseConfigured();
  if (hasDatabaseUrl()) {
    await ensurePgReady();
    const db = getDb()!;
    await db.execute(sql`SELECT 1`);
    return { mode: 'postgres', connected: true };
  }
  readLocalStore();
  return { mode: 'local-json', connected: true };
}

export async function getAdminRole(email: string): Promise<'OWNER' | 'ADMIN' | null> {
  const clean = email.trim().toLowerCase();
  if (clean === OWNER_EMAIL) return 'OWNER';

  if (hasDatabaseUrl()) {
    await ensurePgReady();
    const db = getDb()!;
    const rows = await db
      .select()
      .from(adminsTable)
      .where(eq(adminsTable.email, clean))
      .limit(1);
    return rows.length > 0 ? 'ADMIN' : null;
  }

  const store = readLocalStore();
  return store.admins.some((a) => a.email.toLowerCase() === clean) ? 'ADMIN' : null;
}

export async function listProducts(includeInactive = false): Promise<Product[]> {
  let products: Product[];
  if (hasDatabaseUrl()) {
    await ensurePgReady();
    const db = getDb()!;
    const rows = await db.select().from(productsTable);
    products = rows.map(mapPgProduct);
  } else {
    products = readLocalStore().products;
  }

  const filtered = includeInactive ? products : products.filter((p) => p.active);
  return filtered.sort(
    (a, b) => Number(b.featured) - Number(a.featured) || a.name.localeCompare(b.name)
  );
}

export async function getStoreSettings(): Promise<StoreSettings> {
  if (hasDatabaseUrl()) {
    await ensurePgReady();
    const db = getDb()!;
    const rows = await db
      .select()
      .from(storeSettingsTable)
      .where(eq(storeSettingsTable.id, 'main'))
      .limit(1);
    return rows[0] ? mapPgSettings(rows[0]) : DEFAULT_STORE_SETTINGS;
  }

  return readLocalStore().settings;
}

export async function seedDefaultCatalog(actor: ActorContext): Promise<{ seededProducts: number }> {
  if (hasDatabaseUrl()) {
    await ensurePgReady();
    const db = getDb()!;
    return db.transaction(async (tx) => {
      const existing = await tx.select({ id: productsTable.id }).from(productsTable);
      const existingIds = new Set(existing.map((r) => r.id));
      let seededProducts = 0;

      for (const p of INITIAL_PRODUCTS) {
        if (!existingIds.has(p.id)) {
          await tx.insert(productsTable).values({
            id: p.id,
            slug: p.slug,
            name: p.name,
            category: p.category,
            collection: p.collection,
            priceINR: p.priceINR,
            compareAtINR: p.compareAtINR ?? null,
            badge: p.badge ?? null,
            spec: p.spec,
            description: p.description,
            image: p.image,
            gallery: p.gallery,
            stockBySize: p.stockBySize,
            featured: p.featured,
            active: p.active,
          });
          seededProducts++;
        }
      }

      if (seededProducts > 0) {
        await appendAuditPg(tx, actor, 'CATALOG_SYNC', 'product', 'default-drop', {
          seededProducts,
        });
      }
      return { seededProducts };
    });
  }

  const store = readLocalStore();
  const existingIds = new Set(store.products.map((p) => p.id));
  const now = new Date().toISOString();
  let seededProducts = 0;
  for (const p of INITIAL_PRODUCTS) {
    if (!existingIds.has(p.id)) {
      store.products.push({ ...p, createdAt: now, updatedAt: now });
      seededProducts++;
    }
  }
  if (seededProducts > 0) {
    await appendAuditLocal(store, actor, 'CATALOG_SYNC', 'product', 'default-drop', {
      seededProducts,
    });
    writeLocalStore(store);
  }
  return { seededProducts };
}

const RESERVATION_HOLD_MS = 72 * 60 * 60 * 1000;
const CRYPTO_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function cryptoRandomTokenString(length: number): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += CRYPTO_ALPHABET[bytes[i] & 31];
  }
  return out;
}

function generateServerOrderNumber(): string {
  return `SC-IN-${cryptoRandomTokenString(10)}`;
}

function generateServerTrackingToken(): string {
  const raw = cryptoRandomTokenString(12);
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
}

type PgTx = Parameters<Parameters<NonNullable<ReturnType<typeof getDb>>['transaction']>[0]>[0];

async function releaseExpiredReservationsPg(tx: PgTx, now: Date): Promise<number> {
  const expiredOrders = await tx
    .select()
    .from(ordersTable)
    .where(
      and(
        eq(ordersTable.stockDeducted, true),
        inArray(ordersTable.paymentStatus, ['PAYMENT_ON_HOLD', 'UPI_PENDING_VERIFY']),
        isNotNull(ordersTable.reservedUntil),
        lt(ordersTable.reservedUntil, now)
      )
    )
    .for('update', { skipLocked: true });

  if (expiredOrders.length === 0) return 0;

  const productIds = Array.from(
    new Set(expiredOrders.flatMap((o) => o.items.map((item) => item.productId)))
  ).sort();

  const stockByProd = new Map<string, StockBySize>();
  if (productIds.length > 0) {
    const lockedProducts = await tx
      .select()
      .from(productsTable)
      .where(inArray(productsTable.id, productIds))
      .orderBy(asc(productsTable.id))
      .for('update');
    for (const prod of lockedProducts) {
      stockByProd.set(prod.id, { ...prod.stockBySize });
    }
  }

  for (const order of expiredOrders) {
    for (const item of order.items) {
      const stock = stockByProd.get(item.productId);
      if (stock) {
        stock[item.size] = Math.max(0, (stock[item.size] ?? 0) + item.qty);
      }
    }
    await tx
      .update(ordersTable)
      .set({
        paymentStatus: 'CANCELLED',
        stockDeducted: false,
        reservedUntil: null,
        updatedAt: now,
      })
      .where(eq(ordersTable.id, order.id));

    await tx
      .update(orderTrackingTable)
      .set({
        paymentStatus: 'CANCELLED',
        updatedAt: now,
      })
      .where(eq(orderTrackingTable.orderNumber, order.orderNumber));
  }

  for (const [pid, stock] of stockByProd.entries()) {
    await tx
      .update(productsTable)
      .set({ stockBySize: stock, updatedAt: now })
      .where(eq(productsTable.id, pid));
  }

  return expiredOrders.length;
}

function releaseExpiredReservationsLocal(store: LocalStoreData, now: Date): number {
  const nowMs = now.getTime();
  const nowIso = now.toISOString();
  let released = 0;

  for (const order of store.orders) {
    if (
      order.stockDeducted &&
      (order.paymentStatus === 'PAYMENT_ON_HOLD' || order.paymentStatus === 'UPI_PENDING_VERIFY') &&
      order.reservedUntil &&
      new Date(order.reservedUntil).getTime() < nowMs
    ) {
      for (const item of order.items) {
        const prod = store.products.find((p) => p.id === item.productId);
        if (prod) {
          prod.stockBySize[item.size] = Math.max(0, (prod.stockBySize[item.size] ?? 0) + item.qty);
          prod.updatedAt = nowIso;
        }
      }
      order.paymentStatus = 'CANCELLED';
      order.stockDeducted = false;
      order.reservedUntil = null;
      order.updatedAt = nowIso;

      const tracking = store.orderTracking.find((t) => t.orderNumber === order.orderNumber);
      if (tracking) {
        tracking.paymentStatus = 'CANCELLED';
        tracking.updatedAt = nowIso;
      }
      released += 1;
    }
  }

  return released;
}

export async function releaseExpiredReservations(
  actor?: ActorContext
): Promise<{ releasedCount: number }> {
  assertProductionDatabaseConfigured();
  const now = new Date();

  if (hasDatabaseUrl()) {
    await ensurePgReady();
    const db = getDb()!;
    const releasedCount = await db.transaction(async (tx) => {
      const count = await releaseExpiredReservationsPg(tx, now);
      if (actor && count > 0) {
        await appendAuditPg(tx, actor, 'ORDERS_RELEASE_EXPIRED', 'order', 'batch', {
          releasedCount: count,
        });
      }
      return count;
    });
    return { releasedCount };
  }

  const store = readLocalStore();
  const releasedCount = releaseExpiredReservationsLocal(store, now);
  if (releasedCount > 0) {
    if (actor) {
      await appendAuditLocal(store, actor, 'ORDERS_RELEASE_EXPIRED', 'order', 'batch', {
        releasedCount,
      });
    }
    writeLocalStore(store);
  }
  return { releasedCount };
}

export async function placeCustomerOrder(params: {
  customerName: string;
  customerPhone: string;
  shippingAddr: string;
  city: string;
  pincode: string;
  items: { productId: string; size: ApparelSize; qty: number }[];
  promoCode?: string;
  paymentMethod: PaymentMethod;
  upiRef?: string;
}): Promise<{ orderId: string; orderNumber: string; trackingToken: string; totalINR: number }> {
  assertProductionDatabaseConfigured();

  if (!Array.isArray(params?.items) || params.items.length === 0) {
    throw new Error('Your bag is empty.');
  }
  if (params.items.length > 30) {
    throw new Error('Too many cart lines in one order.');
  }
  if (params.paymentMethod !== 'COD' && params.paymentMethod !== 'UPI_DIRECT') {
    throw new Error('Select Cash on Delivery or Direct UPI.');
  }
  const inputErr = validateCheckoutInput({
    customerName: String(params.customerName ?? ''),
    customerPhone: String(params.customerPhone ?? ''),
    shippingAddr: String(params.shippingAddr ?? ''),
    city: String(params.city ?? ''),
    pincode: String(params.pincode ?? ''),
    paymentMethod: params.paymentMethod,
    upiRef: String(params.upiRef ?? ''),
  });
  if (inputErr) throw new Error(inputErr);

  const uniqueProductIds = Array.from(
    new Set(
      params.items
        .map((i) => (typeof i?.productId === 'string' ? i.productId.trim() : ''))
        .filter((id) => id.length > 0 && id.length <= 128)
    )
  ).sort();
  if (uniqueProductIds.length === 0) {
    throw new Error('Invalid item in bag.');
  }

  const orderNumber = generateServerOrderNumber();
  const trackingToken = generateServerTrackingToken();
  const orderId = `ord_${orderNumber.toLowerCase()}_${randomBytes(4).toString('hex')}`;
  const initialStatus: OrderStatus =
    params.paymentMethod === 'UPI_DIRECT' ? 'UPI_PENDING_VERIFY' : 'PAYMENT_ON_HOLD';
  const firstName = params.customerName.trim().split(/\s+/)[0] || 'Customer';
  const now = new Date();
  const nowIso = now.toISOString();
  const reservedUntilDate = new Date(now.getTime() + RESERVATION_HOLD_MS);
  const reservedUntilIso = reservedUntilDate.toISOString();

  if (hasDatabaseUrl()) {
    await ensurePgReady();
    const db = getDb()!;
    return db.transaction(async (tx) => {
      // Opportunistically release any expired unpaid reservations before checking stock
      await releaseExpiredReservationsPg(tx, now);

      // Lock all referenced product rows in deterministic ID order to eliminate overselling races
      const productRows = await tx
        .select()
        .from(productsTable)
        .where(inArray(productsTable.id, uniqueProductIds))
        .orderBy(asc(productsTable.id))
        .for('update');

      const [settingsRow] = await tx
        .select()
        .from(storeSettingsTable)
        .where(eq(storeSettingsTable.id, 'main'))
        .limit(1);

      const catalog = productRows.map(mapPgProduct);
      const settings = settingsRow ? mapPgSettings(settingsRow) : DEFAULT_STORE_SETTINGS;

      const authoritative = calculateAuthoritativeTotals(
        params.items.map((i) => ({
          productId: String(i.productId ?? '').trim(),
          name: String(i.productId ?? ''),
          image: '',
          size: i.size,
          qty: i.qty,
          priceINR: 0,
        })),
        catalog,
        settings,
        String(params.promoCode ?? '')
      );

      // Atomically deduct reserved stock from locked product rows
      const updatedStocks = new Map<string, StockBySize>();
      for (const prod of productRows) {
        updatedStocks.set(prod.id, { ...prod.stockBySize });
      }
      for (const item of authoritative.items) {
        const stock = updatedStocks.get(item.productId);
        if (!stock) {
          throw new Error(`Product "${item.name}" is no longer available.`);
        }
        const currentQty = Math.max(0, stock[item.size] ?? 0);
        const nextQty = currentQty - item.qty;
        if (nextQty < 0) {
          throw new Error(`Only ${currentQty} unit(s) left for ${item.name} (${item.size}).`);
        }
        stock[item.size] = nextQty;
      }

      for (const item of authoritative.items) {
        const nextStock = updatedStocks.get(item.productId);
        if (nextStock) {
          await tx
            .update(productsTable)
            .set({ stockBySize: nextStock, updatedAt: now })
            .where(eq(productsTable.id, item.productId));
          updatedStocks.delete(item.productId);
        }
      }

      await tx.insert(ordersTable).values({
        id: orderId,
        orderNumber,
        trackingToken,
        customerName: params.customerName.trim(),
        customerPhone: params.customerPhone.trim(),
        shippingAddr: params.shippingAddr.trim(),
        city: params.city.trim(),
        pincode: params.pincode.trim(),
        items: authoritative.items,
        subtotalINR: authoritative.subtotalINR,
        shippingINR: authoritative.shippingINR,
        discountINR: authoritative.discountINR,
        promoCode: authoritative.appliedPromoCode,
        totalINR: authoritative.totalINR,
        paymentMethod: params.paymentMethod,
        upiRef: params.paymentMethod === 'UPI_DIRECT' ? (params.upiRef ?? '').trim() : '',
        paymentStatus: initialStatus,
        stockDeducted: true,
        reservedUntil: reservedUntilDate,
        courierName: '',
        trackingId: '',
      });

      await tx.insert(orderTrackingTable).values({
        orderNumber,
        orderId,
        trackingToken,
        phoneLast4: '',
        customerFirstName: firstName.slice(0, 40),
        city: params.city.trim(),
        itemsSummary: authoritative.items,
        totalINR: authoritative.totalINR,
        paymentMethod: params.paymentMethod,
        paymentStatus: initialStatus,
        courierName: '',
        trackingId: '',
      });

      return { orderId, orderNumber, trackingToken, totalINR: authoritative.totalINR };
    });
  }

  const store = readLocalStore();
  releaseExpiredReservationsLocal(store, now);

  const authoritative = calculateAuthoritativeTotals(
    params.items.map((i) => ({
      productId: String(i.productId ?? '').trim(),
      name: String(i.productId ?? ''),
      image: '',
      size: i.size,
      qty: i.qty,
      priceINR: 0,
    })),
    store.products,
    store.settings,
    String(params.promoCode ?? '')
  );

  for (const item of authoritative.items) {
    const prod = store.products.find((p) => p.id === item.productId);
    if (!prod) {
      throw new Error(`Product "${item.name}" is no longer available.`);
    }
    const currentQty = Math.max(0, prod.stockBySize[item.size] ?? 0);
    const nextQty = currentQty - item.qty;
    if (nextQty < 0) {
      throw new Error(`Only ${currentQty} unit(s) left for ${item.name} (${item.size}).`);
    }
    prod.stockBySize[item.size] = nextQty;
    prod.updatedAt = nowIso;
  }

  const newOrder: Order = {
    id: orderId,
    orderNumber,
    trackingToken,
    customerName: params.customerName.trim(),
    customerPhone: params.customerPhone.trim(),
    shippingAddr: params.shippingAddr.trim(),
    city: params.city.trim(),
    pincode: params.pincode.trim(),
    items: authoritative.items,
    subtotalINR: authoritative.subtotalINR,
    shippingINR: authoritative.shippingINR,
    discountINR: authoritative.discountINR,
    promoCode: authoritative.appliedPromoCode,
    totalINR: authoritative.totalINR,
    paymentMethod: params.paymentMethod,
    upiRef: params.paymentMethod === 'UPI_DIRECT' ? (params.upiRef ?? '').trim() : '',
    paymentStatus: initialStatus,
    stockDeducted: true,
    reservedUntil: reservedUntilIso,
    courierName: '',
    trackingId: '',
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  const newTracking: LocalOrderTrackingRecord = {
    orderId,
    orderNumber,
    trackingToken,
    customerFirstName: firstName.slice(0, 40),
    city: params.city.trim(),
    itemsSummary: authoritative.items,
    totalINR: authoritative.totalINR,
    paymentMethod: params.paymentMethod,
    paymentStatus: initialStatus,
    courierName: '',
    trackingId: '',
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  store.orders.unshift(newOrder);
  store.orderTracking.unshift(newTracking);
  writeLocalStore(store);

  return { orderId, orderNumber, trackingToken, totalINR: authoritative.totalINR };
}

export async function lookupOrderTracking(
  orderNumber: string,
  trackingToken: string
): Promise<OrderTracking | null> {
  assertProductionDatabaseConfigured();

  const cleanOrder = orderNumber.trim().toUpperCase();
  const cleanToken = normalizeTrackingToken(trackingToken);

  if (!/^SC-IN-[A-Z0-9]{6,12}$/.test(cleanOrder)) {
    return null;
  }
  if (cleanToken.length < 8 || cleanToken.length > 24) {
    return null;
  }

  let storedToken = '';
  let row: OrderTracking | null = null;

  if (hasDatabaseUrl()) {
    await ensurePgReady();
    const db = getDb()!;
    const [found] = await db
      .select()
      .from(orderTrackingTable)
      .where(eq(orderTrackingTable.orderNumber, cleanOrder))
      .limit(1);
    if (found) {
      storedToken = normalizeTrackingToken(found.trackingToken ?? '');
      row = {
        orderId: found.orderId,
        orderNumber: found.orderNumber,
        customerFirstName: found.customerFirstName,
        city: found.city,
        itemsSummary: found.itemsSummary,
        totalINR: found.totalINR,
        paymentMethod: found.paymentMethod,
        paymentStatus: found.paymentStatus,
        courierName: found.courierName,
        trackingId: found.trackingId,
        createdAt: found.createdAt.toISOString(),
        updatedAt: found.updatedAt.toISOString(),
      };
    }
  } else {
    const found = readLocalStore().orderTracking.find(
      (t) => t.orderNumber.toUpperCase() === cleanOrder
    );
    if (found) {
      storedToken = normalizeTrackingToken(found.trackingToken ?? '');
      row = {
        orderId: found.orderId,
        orderNumber: found.orderNumber,
        customerFirstName: found.customerFirstName,
        city: found.city,
        itemsSummary: found.itemsSummary,
        totalINR: found.totalINR,
        paymentMethod: found.paymentMethod,
        paymentStatus: found.paymentStatus,
        courierName: found.courierName,
        trackingId: found.trackingId,
        createdAt: found.createdAt,
        updatedAt: found.updatedAt,
      };
    }
  }

  if (!row || !storedToken) return null;

  const expectedBuf = Buffer.from(storedToken, 'utf8');
  const providedBuf = Buffer.from(cleanToken, 'utf8');
  if (expectedBuf.length !== providedBuf.length || !timingSafeEqual(expectedBuf, providedBuf)) {
    return null;
  }

  return row;
}

export async function joinOurCircle(params: {
  nickname: string;
  whatsappPhone: string;
  preferredSize: ApparelSize;
  vipCode: string;
}): Promise<{ alreadyJoined: boolean; vipCode: string }> {
  const cleanName = String(params?.nickname ?? '').trim();
  const cleanPhone = String(params?.whatsappPhone ?? '').trim();
  if (cleanName.length < 2) {
    throw new Error('Enter your court nickname (at least 2 characters).');
  }
  if (!/^[6-9][0-9]{9}$/.test(cleanPhone)) {
    throw new Error('Enter a valid 10-digit Indian WhatsApp number.');
  }
  const memberId = `wa_${cleanPhone}`;

  if (hasDatabaseUrl()) {
    await ensurePgReady();
    const db = getDb()!;
    const existing = await db
      .select()
      .from(circleMembersTable)
      .where(eq(circleMembersTable.id, memberId))
      .limit(1);
    if (existing.length > 0) {
      return { alreadyJoined: true, vipCode: existing[0].vipCode };
    }
    await db.insert(circleMembersTable).values({
      id: memberId,
      nickname: params.nickname.trim().slice(0, 50),
      whatsappPhone: cleanPhone,
      preferredSize: params.preferredSize,
      vipCode: params.vipCode.trim().toUpperCase(),
    });
    return { alreadyJoined: false, vipCode: params.vipCode };
  }

  const store = readLocalStore();
  const existing = store.circleMembers.find((m) => m.id === memberId);
  if (existing) {
    return { alreadyJoined: true, vipCode: existing.vipCode };
  }
  store.circleMembers.unshift({
    id: memberId,
    nickname: params.nickname.trim().slice(0, 50),
    whatsappPhone: cleanPhone,
    preferredSize: params.preferredSize,
    vipCode: params.vipCode.trim().toUpperCase(),
    joinedAt: new Date().toISOString(),
  });
  writeLocalStore(store);
  return { alreadyJoined: false, vipCode: params.vipCode };
}

export async function saveCartLead(params: {
  contact: string;
  channel: LeadChannel;
  itemsSummary: OrderItemRecord[];
  cartTotalINR: number;
  promoOffered: string;
  pushEnabled: boolean;
}): Promise<string> {
  const validated = validateLeadContact(String(params?.contact ?? ''));
  if (!validated.valid) {
    throw new Error(validated.error);
  }
  if (!Array.isArray(params.itemsSummary) || params.itemsSummary.length === 0) {
    throw new Error('Cart summary cannot be empty.');
  }
  const leadId = `lead_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

  if (hasDatabaseUrl()) {
    await ensurePgReady();
    const db = getDb()!;
    await db.insert(cartLeadsTable).values({
      id: leadId,
      contact: validated.normalized,
      channel: validated.channel,
      itemsSummary: params.itemsSummary.slice(0, 20),
      cartTotalINR: Math.max(1, Math.round(params.cartTotalINR)),
      promoOffered: String(params.promoOffered ?? 'SAUCYVIP10').trim().slice(0, 30),
      pushEnabled: Boolean(params.pushEnabled),
      status: 'NEW',
    });
    return leadId;
  }

  const store = readLocalStore();
  store.cartLeads.unshift({
    id: leadId,
    contact: validated.normalized,
    channel: validated.channel,
    itemsSummary: params.itemsSummary.slice(0, 20),
    cartTotalINR: Math.max(1, Math.round(params.cartTotalINR)),
    promoOffered: String(params.promoOffered ?? 'SAUCYVIP10').trim().slice(0, 30),
    pushEnabled: Boolean(params.pushEnabled),
    status: 'NEW',
    createdAt: new Date().toISOString(),
  });
  writeLocalStore(store);
  return leadId;
}

export async function saveRestockAlert(params: {
  productId: string;
  productName: string;
  size: ApparelSize;
  contact: string;
  pushEnabled: boolean;
}): Promise<string> {
  const validated = validateLeadContact(String(params?.contact ?? ''));
  if (!validated.valid) {
    throw new Error(validated.error);
  }
  const alertId = `restock_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

  if (hasDatabaseUrl()) {
    await ensurePgReady();
    const db = getDb()!;
    await db.insert(restockAlertsTable).values({
      id: alertId,
      productId: params.productId,
      productName: params.productName.trim().slice(0, 100),
      size: params.size,
      contact: validated.normalized,
      pushEnabled: Boolean(params.pushEnabled),
      status: 'WAITING',
    });
    return alertId;
  }

  const store = readLocalStore();
  store.restockAlerts.unshift({
    id: alertId,
    productId: params.productId,
    productName: params.productName.trim().slice(0, 100),
    size: params.size,
    contact: validated.normalized,
    pushEnabled: Boolean(params.pushEnabled),
    status: 'WAITING',
    createdAt: new Date().toISOString(),
  });
  writeLocalStore(store);
  return alertId;
}

export async function savePushSubscription(input: PushSubscriptionInput): Promise<void> {
  assertProductionDatabaseConfigured();
  const rawEndpoint = String(input?.endpoint ?? '').trim();
  const parsedUrl = validatePushEndpointUrl(rawEndpoint);
  const endpoint = parsedUrl.toString();
  const p256dh = String(input?.keys?.p256dh ?? '').trim();
  const auth = String(input?.keys?.auth ?? '').trim();
  if (!/^[A-Za-z0-9\-_=]{20,200}$/.test(p256dh) || !/^[A-Za-z0-9\-_=]{10,100}$/.test(auth)) {
    throw new Error('Invalid push subscription encryption keys.');
  }
  const subId = `psub_${Buffer.from(endpoint).toString('base64url').slice(-18)}`;
  const nowIso = new Date().toISOString();

  if (hasDatabaseUrl()) {
    await ensurePgReady();
    const db = getDb()!;
    await db
      .insert(pushSubscriptionsTable)
      .values({
        id: subId,
        endpoint,
        p256dh,
        auth,
        contact: (input.contact ?? '').trim().slice(0, 120),
        topic: input.topic ?? 'ALL',
        productId: input.productId ?? null,
        size: input.size ?? null,
      })
      .onConflictDoUpdate({
        target: pushSubscriptionsTable.endpoint,
        set: {
          p256dh,
          auth,
          contact: (input.contact ?? '').trim().slice(0, 120),
          topic: input.topic ?? 'ALL',
          productId: input.productId ?? null,
          size: input.size ?? null,
          updatedAt: new Date(),
        },
      });
    return;
  }

  const store = readLocalStore();
  const idx = store.pushSubscriptions.findIndex((s) => s.endpoint === endpoint);
  const record = {
    id: subId,
    endpoint,
    p256dh,
    auth,
    contact: (input.contact ?? '').trim().slice(0, 120),
    topic: input.topic ?? ('ALL' as const),
    productId: input.productId,
    size: input.size,
    createdAt: idx >= 0 ? store.pushSubscriptions[idx].createdAt : nowIso,
    updatedAt: nowIso,
  };
  if (idx >= 0) {
    store.pushSubscriptions[idx] = record;
  } else {
    store.pushSubscriptions.unshift(record);
  }
  writeLocalStore(store);
}

export async function listPushSubscriptions(filter?: {
  topic?: 'CART_ABANDON' | 'RESTOCK' | 'ALL';
  productId?: string;
}): Promise<StoredPushSub[]> {
  assertProductionDatabaseConfigured();
  if (hasDatabaseUrl()) {
    await ensurePgReady();
    const db = getDb()!;
    const rows = await db.select().from(pushSubscriptionsTable);
    return rows
      .filter((r) => {
        if (filter?.productId && r.productId && r.productId !== filter.productId) return false;
        if (filter?.topic && filter.topic !== 'ALL' && r.topic !== 'ALL' && r.topic !== filter.topic) {
          return false;
        }
        return true;
      })
      .map((r) => ({ id: r.id, endpoint: r.endpoint, p256dh: r.p256dh, auth: r.auth }));
  }

  return readLocalStore().pushSubscriptions.filter((r) => {
    if (filter?.productId && r.productId && r.productId !== filter.productId) return false;
    if (filter?.topic && filter.topic !== 'ALL' && r.topic !== 'ALL' && r.topic !== filter.topic) {
      return false;
    }
    return true;
  });
}

export async function deleteExpiredPushEndpoints(endpoints: string[]): Promise<void> {
  assertProductionDatabaseConfigured();
  if (endpoints.length === 0) return;
  if (hasDatabaseUrl()) {
    await ensurePgReady();
    const db = getDb()!;
    for (const ep of endpoints) {
      await db.delete(pushSubscriptionsTable).where(eq(pushSubscriptionsTable.endpoint, ep));
    }
    return;
  }
  const set = new Set(endpoints);
  const store = readLocalStore();
  store.pushSubscriptions = store.pushSubscriptions.filter((s) => !set.has(s.endpoint));
  writeLocalStore(store);
}

export async function listAdminDashboardData() {
  assertProductionDatabaseConfigured();
  if (hasDatabaseUrl()) {
    await ensurePgReady();
    const db = getDb()!;
    const [orders, circleMembers, cartLeads, restockAlerts, admins, pushSubs] = await Promise.all([
      db.select().from(ordersTable).orderBy(desc(ordersTable.createdAt)),
      db.select().from(circleMembersTable).orderBy(desc(circleMembersTable.joinedAt)),
      db.select().from(cartLeadsTable).orderBy(desc(cartLeadsTable.createdAt)),
      db.select().from(restockAlertsTable).orderBy(desc(restockAlertsTable.createdAt)),
      db.select().from(adminsTable).orderBy(asc(adminsTable.email)),
      db.select({ id: pushSubscriptionsTable.id }).from(pushSubscriptionsTable),
    ]);

    return {
      orders: orders.map((o) => ({
        ...o,
        reservedUntil: o.reservedUntil ? o.reservedUntil.toISOString() : null,
        createdAt: o.createdAt.toISOString(),
        updatedAt: o.updatedAt.toISOString(),
      })) as Order[],
      circleMembers: circleMembers.map((m) => ({
        ...m,
        joinedAt: m.joinedAt.toISOString(),
      })) as CircleMember[],
      cartLeads: cartLeads.map((l) => ({
        ...l,
        createdAt: l.createdAt.toISOString(),
      })) as CartLead[],
      restockAlerts: restockAlerts.map((a) => ({
        ...a,
        createdAt: a.createdAt.toISOString(),
      })) as RestockAlert[],
      admins: admins.map((a) => ({
        ...a,
        createdAt: a.createdAt.toISOString(),
      })) as AdminAccess[],
      pushSubscriberCount: pushSubs.length,
    };
  }

  const store = readLocalStore();
  return {
    orders: store.orders,
    circleMembers: store.circleMembers,
    cartLeads: store.cartLeads,
    restockAlerts: store.restockAlerts,
    admins: store.admins,
    pushSubscriberCount: store.pushSubscriptions.length,
  };
}

export async function saveProductAdmin(
  input: {
    id?: string;
    name: string;
    category: ApparelCategory;
    collection: string;
    priceINR: number;
    compareAtINR?: number;
    badge?: string;
    spec: string;
    description: string;
    image: string;
    gallery: string[];
    stockBySize: StockBySize;
    featured: boolean;
    active: boolean;
  },
  isNew: boolean,
  actor: ActorContext
): Promise<{ product: Product; restockedSizes: ApparelSize[] }> {
  const cleanName = input.name.trim().slice(0, 100);
  if (cleanName.length < 2) throw new Error('Product name must be at least 2 characters.');

  const safePrice = Math.min(500000, Math.max(1, Math.round(input.priceINR)));
  const slugBase = slugifyProductName(cleanName).slice(0, 70);
  const safeSlug = slugBase.length >= 2 ? slugBase : `${slugBase || 'sc'}-drop`;
  const productId =
    !isNew && input.id
      ? input.id.trim()
      : input.id && input.id.trim().length > 2
      ? input.id.trim()
      : `${safeSlug.slice(0, 60)}-${Date.now().toString(36).slice(-4)}`;

  const cleanStock: StockBySize = {
    S: Math.min(100000, Math.max(0, Math.round(input.stockBySize?.S ?? 0))),
    M: Math.min(100000, Math.max(0, Math.round(input.stockBySize?.M ?? 0))),
    L: Math.min(100000, Math.max(0, Math.round(input.stockBySize?.L ?? 0))),
    XL: Math.min(100000, Math.max(0, Math.round(input.stockBySize?.XL ?? 0))),
    XXL: Math.min(100000, Math.max(0, Math.round(input.stockBySize?.XXL ?? 0))),
  };

  const compareAtINR =
    input.compareAtINR && input.compareAtINR >= safePrice
      ? Math.min(500000, Math.round(input.compareAtINR))
      : undefined;

  const badge = input.badge?.trim() ? input.badge.trim().slice(0, 30) : undefined;
  const gallery = (input.gallery ?? [])
    .map((g) => g.trim())
    .filter((g) => g.length > 0 && g.length <= 2000 && !g.startsWith('data:'))
    .slice(0, 8);

  const cleanImage = input.image.trim().slice(0, 2000);
  if (!cleanImage || cleanImage.startsWith('data:')) {
    throw new Error('Provide a valid Cloudinary URL, image URL, or library asset path.');
  }

  const nowIso = new Date().toISOString();

  if (hasDatabaseUrl()) {
    await ensurePgReady();
    const db = getDb()!;
    return db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(productsTable)
        .where(eq(productsTable.id, productId))
        .limit(1);

      const restockedSizes: ApparelSize[] = [];
      if (existing) {
        for (const sz of APPAREL_SIZES) {
          if ((existing.stockBySize[sz] ?? 0) <= 0 && cleanStock[sz] > 0) {
            restockedSizes.push(sz);
          }
        }
      }

      if (existing) {
        await tx
          .update(productsTable)
          .set({
            slug: safeSlug,
            name: cleanName,
            category: input.category,
            collection: (input.collection.trim() || 'All-Star Drop').slice(0, 60),
            priceINR: safePrice,
            compareAtINR: compareAtINR ?? null,
            badge: badge ?? null,
            spec: (input.spec.trim() || '280 GSM heavyweight cotton · Relaxed fit').slice(0, 220),
            description: (input.description.trim() || 'Saucy Culture limited drop garment.').slice(0, 800),
            image: cleanImage,
            gallery,
            stockBySize: cleanStock,
            featured: Boolean(input.featured),
            active: Boolean(input.active),
            updatedAt: new Date(),
          })
          .where(eq(productsTable.id, productId));
      } else {
        await tx.insert(productsTable).values({
          id: productId,
          slug: safeSlug,
          name: cleanName,
          category: input.category,
          collection: (input.collection.trim() || 'All-Star Drop').slice(0, 60),
          priceINR: safePrice,
          compareAtINR: compareAtINR ?? null,
          badge: badge ?? null,
          spec: (input.spec.trim() || '280 GSM heavyweight cotton · Relaxed fit').slice(0, 220),
          description: (input.description.trim() || 'Saucy Culture limited drop garment.').slice(0, 800),
          image: cleanImage,
          gallery,
          stockBySize: cleanStock,
          featured: Boolean(input.featured),
          active: Boolean(input.active),
        });
      }

      await appendAuditPg(
        tx,
        actor,
        existing ? 'PRODUCT_UPDATE' : 'PRODUCT_CREATE',
        'product',
        productId,
        { name: cleanName, priceINR: safePrice, stockBySize: cleanStock, restockedSizes }
      );

      const [saved] = await tx
        .select()
        .from(productsTable)
        .where(eq(productsTable.id, productId))
        .limit(1);

      return { product: mapPgProduct(saved), restockedSizes };
    });
  }

  const store = readLocalStore();
  const idx = store.products.findIndex((p) => p.id === productId);
  const restockedSizes: ApparelSize[] = [];
  if (idx >= 0) {
    for (const sz of APPAREL_SIZES) {
      if ((store.products[idx].stockBySize[sz] ?? 0) <= 0 && cleanStock[sz] > 0) {
        restockedSizes.push(sz);
      }
    }
  }

  const savedProduct: Product = {
    id: productId,
    slug: safeSlug,
    name: cleanName,
    category: input.category,
    collection: (input.collection.trim() || 'All-Star Drop').slice(0, 60),
    priceINR: safePrice,
    compareAtINR,
    badge,
    spec: (input.spec.trim() || '280 GSM heavyweight cotton · Relaxed fit').slice(0, 220),
    description: (input.description.trim() || 'Saucy Culture limited drop garment.').slice(0, 800),
    image: cleanImage,
    gallery,
    stockBySize: cleanStock,
    featured: Boolean(input.featured),
    active: Boolean(input.active),
    createdAt: idx >= 0 ? store.products[idx].createdAt : nowIso,
    updatedAt: nowIso,
  };

  if (idx >= 0) {
    store.products[idx] = savedProduct;
  } else {
    store.products.unshift(savedProduct);
  }

  await appendAuditLocal(
    store,
    actor,
    idx >= 0 ? 'PRODUCT_UPDATE' : 'PRODUCT_CREATE',
    'product',
    productId,
    { name: cleanName, priceINR: safePrice, stockBySize: cleanStock, restockedSizes }
  );
  writeLocalStore(store);

  return { product: savedProduct, restockedSizes };
}

export async function deleteProductAdmin(productId: string, actor: ActorContext): Promise<void> {
  if (hasDatabaseUrl()) {
    await ensurePgReady();
    const db = getDb()!;
    await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(productsTable)
        .where(eq(productsTable.id, productId))
        .limit(1);
      await tx.delete(productsTable).where(eq(productsTable.id, productId));
      await appendAuditPg(tx, actor, 'PRODUCT_DELETE', 'product', productId, {
        name: existing?.name ?? productId,
      });
    });
    return;
  }

  const store = readLocalStore();
  const existing = store.products.find((p) => p.id === productId);
  store.products = store.products.filter((p) => p.id !== productId);
  await appendAuditLocal(store, actor, 'PRODUCT_DELETE', 'product', productId, {
    name: existing?.name ?? productId,
  });
  writeLocalStore(store);
}

export async function updateOrderStatusAdmin(
  params: {
    orderId: string;
    nextStatus: OrderStatus;
    courierName?: string;
    trackingId?: string;
  },
  actor: ActorContext
): Promise<Order> {
  assertProductionDatabaseConfigured();
  const { orderId, nextStatus } = params;
  const VALID_ORDER_STATUSES: OrderStatus[] = [
    'PAYMENT_ON_HOLD',
    'UPI_PENDING_VERIFY',
    'UPI_VERIFIED',
    'COD_CONFIRMED',
    'PACKED',
    'DISPATCHED',
    'DELIVERED',
    'CANCELLED',
  ];
  const ACTIVE_FULFILLMENT_STATUSES: OrderStatus[] = [
    'PAYMENT_ON_HOLD',
    'UPI_PENDING_VERIFY',
    'COD_CONFIRMED',
    'UPI_VERIFIED',
    'PACKED',
    'DISPATCHED',
    'DELIVERED',
  ];
  const CONFIRMED_STATUSES: OrderStatus[] = [
    'COD_CONFIRMED',
    'UPI_VERIFIED',
    'PACKED',
    'DISPATCHED',
    'DELIVERED',
  ];

  if (!VALID_ORDER_STATUSES.includes(nextStatus)) {
    throw new Error('Invalid order status.');
  }

  if (hasDatabaseUrl()) {
    await ensurePgReady();
    const db = getDb()!;
    return db.transaction(async (tx) => {
      const [order] = await tx
        .select()
        .from(ordersTable)
        .where(eq(ordersTable.id, orderId))
        .for('update')
        .limit(1);
      if (!order) throw new Error('Order not found.');

      const shouldDeduct = !order.stockDeducted && ACTIVE_FULFILLMENT_STATUSES.includes(nextStatus);
      const shouldRestore = order.stockDeducted && nextStatus === 'CANCELLED';

      if (shouldDeduct || shouldRestore) {
        const productIds = Array.from(new Set(order.items.map((item) => item.productId))).sort();
        const grouped = new Map<string, StockBySize>();
        if (productIds.length > 0) {
          const lockedProducts = await tx
            .select()
            .from(productsTable)
            .where(inArray(productsTable.id, productIds))
            .orderBy(asc(productsTable.id))
            .for('update');
          for (const pRow of lockedProducts) {
            grouped.set(pRow.id, { ...pRow.stockBySize });
          }
        }

        const deltaSign = shouldDeduct ? -1 : 1;
        for (const item of order.items) {
          const map = grouped.get(item.productId);
          if (!map) {
            if (shouldDeduct) {
              throw new Error(`Product "${item.name}" no longer exists to re-reserve stock.`);
            }
            continue;
          }
          const nextQty = (map[item.size] ?? 0) + deltaSign * item.qty;
          if (shouldDeduct && nextQty < 0) {
            throw new Error(
              `Insufficient stock (${map[item.size] ?? 0} left) for ${item.name} (${item.size}).`
            );
          }
          map[item.size] = Math.max(0, nextQty);
        }

        for (const [pid, stock] of grouped.entries()) {
          await tx
            .update(productsTable)
            .set({ stockBySize: stock, updatedAt: new Date() })
            .where(eq(productsTable.id, pid));
        }
      }

      const nextStockDeducted = shouldDeduct
        ? true
        : shouldRestore
        ? false
        : order.stockDeducted;
      const nextReservedUntil =
        nextStatus === 'CANCELLED' || CONFIRMED_STATUSES.includes(nextStatus)
          ? null
          : order.reservedUntil ?? new Date(Date.now() + RESERVATION_HOLD_MS);

      const courierName = (params.courierName ?? order.courierName ?? '').trim();
      const trackingId = (params.trackingId ?? order.trackingId ?? '').trim();

      await tx
        .update(ordersTable)
        .set({
          paymentStatus: nextStatus,
          stockDeducted: nextStockDeducted,
          reservedUntil: nextReservedUntil,
          courierName,
          trackingId,
          updatedAt: new Date(),
        })
        .where(eq(ordersTable.id, order.id));

      await tx
        .update(orderTrackingTable)
        .set({
          paymentStatus: nextStatus,
          courierName,
          trackingId,
          updatedAt: new Date(),
        })
        .where(eq(orderTrackingTable.orderNumber, order.orderNumber));

      await appendAuditPg(tx, actor, 'ORDER_UPDATE', 'order', order.orderNumber, {
        prevStatus: order.paymentStatus,
        nextStatus,
        courierName,
        trackingId,
        stockDeducted: nextStockDeducted,
      });

      const [updated] = await tx
        .select()
        .from(ordersTable)
        .where(eq(ordersTable.id, order.id))
        .limit(1);

      return {
        ...updated,
        reservedUntil: updated.reservedUntil ? updated.reservedUntil.toISOString() : null,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      } as Order;
    });
  }

  const store = readLocalStore();
  const order = store.orders.find((o) => o.id === orderId);
  if (!order) throw new Error('Order not found.');

  const prevStatus = order.paymentStatus;
  const shouldDeduct = !order.stockDeducted && ACTIVE_FULFILLMENT_STATUSES.includes(nextStatus);
  const shouldRestore = order.stockDeducted && nextStatus === 'CANCELLED';

  if (shouldDeduct || shouldRestore) {
    const deltaSign = shouldDeduct ? -1 : 1;
    // Validate before mutating on re-deduct
    if (shouldDeduct) {
      const neededBySku = new Map<string, number>();
      for (const item of order.items) {
        const key = `${item.productId}::${item.size}`;
        neededBySku.set(key, (neededBySku.get(key) ?? 0) + item.qty);
      }
      for (const [key, need] of neededBySku.entries()) {
        const [pid, sz] = key.split('::') as [string, ApparelSize];
        const prod = store.products.find((p) => p.id === pid);
        const avail = prod ? Math.max(0, prod.stockBySize[sz] ?? 0) : 0;
        if (!prod || avail < need) {
          throw new Error(`Insufficient stock (${avail} left) for ${pid} (${sz}).`);
        }
      }
    }

    for (const item of order.items) {
      const prod = store.products.find((p) => p.id === item.productId);
      if (prod) {
        prod.stockBySize[item.size] = Math.max(
          0,
          (prod.stockBySize[item.size] ?? 0) + deltaSign * item.qty
        );
        prod.updatedAt = new Date().toISOString();
      }
    }
  }

  order.paymentStatus = nextStatus;
  order.stockDeducted = shouldDeduct ? true : shouldRestore ? false : order.stockDeducted;
  order.reservedUntil =
    nextStatus === 'CANCELLED' || CONFIRMED_STATUSES.includes(nextStatus)
      ? null
      : order.reservedUntil ?? new Date(Date.now() + RESERVATION_HOLD_MS).toISOString();
  order.courierName = (params.courierName ?? order.courierName ?? '').trim();
  order.trackingId = (params.trackingId ?? order.trackingId ?? '').trim();
  order.updatedAt = new Date().toISOString();

  const tracking = store.orderTracking.find((t) => t.orderNumber === order.orderNumber);
  if (tracking) {
    tracking.paymentStatus = nextStatus;
    tracking.courierName = order.courierName;
    tracking.trackingId = order.trackingId;
    tracking.updatedAt = order.updatedAt;
  }

  await appendAuditLocal(store, actor, 'ORDER_UPDATE', 'order', order.orderNumber, {
    prevStatus,
    nextStatus,
    courierName: order.courierName,
    trackingId: order.trackingId,
    stockDeducted: order.stockDeducted,
  });
  writeLocalStore(store);
  return order;
}

export async function updateStoreSettingsAdmin(
  settings: Omit<StoreSettings, 'updatedAt'>,
  actor: ActorContext
): Promise<StoreSettings> {
  const clean: StoreSettings = {
    upiId: settings.upiId.trim(),
    upiMerchantName: settings.upiMerchantName.trim(),
    freeShippingThresholdINR: Math.max(0, Math.round(settings.freeShippingThresholdINR)),
    shippingFeeINR: Math.max(0, Math.round(settings.shippingFeeINR)),
    vipPromoCode: settings.vipPromoCode.trim().toUpperCase(),
    vipDiscountPercent: Math.min(50, Math.max(0, Math.round(settings.vipDiscountPercent))),
    announcementText: settings.announcementText.trim().slice(0, 180),
    heroTitle: (settings.heroTitle?.trim() || 'THE NEW HOOP ERA').slice(0, 60),
    heroSubtitle: (
      settings.heroSubtitle?.trim() || 'BASKETBALL × STREETWEAR · ALL-STAR DROP'
    ).slice(0, 100),
    maintenanceMode: Boolean(settings.maintenanceMode),
    supportWhatsapp: settings.supportWhatsapp.trim(),
    supportEmail: settings.supportEmail.trim(),
    updatedAt: new Date().toISOString(),
  };

  if (hasDatabaseUrl()) {
    await ensurePgReady();
    const db = getDb()!;
    return db.transaction(async (tx) => {
      await tx
        .insert(storeSettingsTable)
        .values({
          id: 'main',
          upiId: clean.upiId,
          upiMerchantName: clean.upiMerchantName,
          freeShippingThresholdINR: clean.freeShippingThresholdINR,
          shippingFeeINR: clean.shippingFeeINR,
          vipPromoCode: clean.vipPromoCode,
          vipDiscountPercent: clean.vipDiscountPercent,
          announcementText: clean.announcementText,
          heroTitle: clean.heroTitle,
          heroSubtitle: clean.heroSubtitle,
          maintenanceMode: clean.maintenanceMode,
          supportWhatsapp: clean.supportWhatsapp,
          supportEmail: clean.supportEmail,
        })
        .onConflictDoUpdate({
          target: storeSettingsTable.id,
          set: {
            upiId: clean.upiId,
            upiMerchantName: clean.upiMerchantName,
            freeShippingThresholdINR: clean.freeShippingThresholdINR,
            shippingFeeINR: clean.shippingFeeINR,
            vipPromoCode: clean.vipPromoCode,
            vipDiscountPercent: clean.vipDiscountPercent,
            announcementText: clean.announcementText,
            heroTitle: clean.heroTitle,
            heroSubtitle: clean.heroSubtitle,
            maintenanceMode: clean.maintenanceMode,
            supportWhatsapp: clean.supportWhatsapp,
            supportEmail: clean.supportEmail,
            updatedAt: new Date(),
          },
        });

      await appendAuditPg(tx, actor, 'SETTINGS_UPDATE', 'settings', 'main', clean);
      return clean;
    });
  }

  const store = readLocalStore();
  store.settings = clean;
  await appendAuditLocal(store, actor, 'SETTINGS_UPDATE', 'settings', 'main', clean);
  writeLocalStore(store);
  return clean;
}

export async function addAdminEmail(email: string, actor: ActorContext): Promise<void> {
  if (actor.role !== 'OWNER' && actor.email !== OWNER_EMAIL) {
    throw new Error('Only the Store Owner can add admin team members.');
  }
  const cleanEmail = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    throw new Error('Enter a valid Google email address.');
  }

  if (hasDatabaseUrl()) {
    await ensurePgReady();
    const db = getDb()!;
    await db.transaction(async (tx) => {
      await tx
        .insert(adminsTable)
        .values({
          email: cleanEmail,
          role: cleanEmail === OWNER_EMAIL ? 'SUPER_ADMIN' : 'ADMIN',
          addedBy: actor.email,
        })
        .onConflictDoNothing();
      await appendAuditPg(tx, actor, 'ADMIN_ADD', 'admin', cleanEmail, { email: cleanEmail });
    });
    return;
  }

  const store = readLocalStore();
  if (!store.admins.some((a) => a.email.toLowerCase() === cleanEmail)) {
    store.admins.push({
      email: cleanEmail,
      role: cleanEmail === OWNER_EMAIL ? 'SUPER_ADMIN' : 'ADMIN',
      addedBy: actor.email,
      createdAt: new Date().toISOString(),
    });
  }
  await appendAuditLocal(store, actor, 'ADMIN_ADD', 'admin', cleanEmail, { email: cleanEmail });
  writeLocalStore(store);
}

export async function removeAdminEmail(email: string, actor: ActorContext): Promise<void> {
  const cleanEmail = email.trim().toLowerCase();
  if (cleanEmail === OWNER_EMAIL) {
    throw new Error('Owner access cannot be removed.');
  }
  if (actor.role !== 'OWNER' && actor.email !== OWNER_EMAIL) {
    throw new Error('Only the Store Owner can revoke admin team members.');
  }

  if (hasDatabaseUrl()) {
    await ensurePgReady();
    const db = getDb()!;
    await db.transaction(async (tx) => {
      await tx.delete(adminsTable).where(eq(adminsTable.email, cleanEmail));
      await appendAuditPg(tx, actor, 'ADMIN_REMOVE', 'admin', cleanEmail, { email: cleanEmail });
    });
    return;
  }

  const store = readLocalStore();
  store.admins = store.admins.filter((a) => a.email.toLowerCase() !== cleanEmail);
  await appendAuditLocal(store, actor, 'ADMIN_REMOVE', 'admin', cleanEmail, { email: cleanEmail });
  writeLocalStore(store);
}

export async function updateCartLeadStatusAdmin(
  leadId: string,
  status: 'NEW' | 'NOTIFIED' | 'CONVERTED',
  actor: ActorContext
): Promise<void> {
  if (hasDatabaseUrl()) {
    await ensurePgReady();
    const db = getDb()!;
    await db.transaction(async (tx) => {
      await tx.update(cartLeadsTable).set({ status }).where(eq(cartLeadsTable.id, leadId));
      await appendAuditPg(tx, actor, 'LEAD_UPDATE', 'cart_lead', leadId, { status });
    });
    return;
  }

  const store = readLocalStore();
  const found = store.cartLeads.find((l) => l.id === leadId);
  if (found) found.status = status;
  await appendAuditLocal(store, actor, 'LEAD_UPDATE', 'cart_lead', leadId, { status });
  writeLocalStore(store);
}

export async function updateRestockAlertStatusAdmin(
  alertId: string,
  status: 'WAITING' | 'NOTIFIED',
  actor: ActorContext
): Promise<void> {
  if (hasDatabaseUrl()) {
    await ensurePgReady();
    const db = getDb()!;
    await db.transaction(async (tx) => {
      await tx
        .update(restockAlertsTable)
        .set({ status })
        .where(eq(restockAlertsTable.id, alertId));
      await appendAuditPg(tx, actor, 'RESTOCK_UPDATE', 'restock_alert', alertId, { status });
    });
    return;
  }

  const store = readLocalStore();
  const found = store.restockAlerts.find((a) => a.id === alertId);
  if (found) found.status = status;
  await appendAuditLocal(store, actor, 'RESTOCK_UPDATE', 'restock_alert', alertId, { status });
  writeLocalStore(store);
}

export async function recordPushBlastAudit(
  actor: ActorContext,
  details: { topic: string; title: string; sent: number; failed: number }
): Promise<void> {
  if (hasDatabaseUrl()) {
    await ensurePgReady();
    const db = getDb()!;
    await db.transaction(async (tx) => {
      await appendAuditPg(tx, actor, 'PUSH_BLAST', 'push', details.topic, details);
    });
    return;
  }
  const store = readLocalStore();
  await appendAuditLocal(store, actor, 'PUSH_BLAST', 'push', details.topic, details);
  writeLocalStore(store);
}

export async function getAuditLogsWithVerification(): Promise<{
  logs: AuditLogEntry[];
  verification: AuditVerificationResult;
}> {
  let ascLogs: AuditLogEntry[];
  if (hasDatabaseUrl()) {
    await ensurePgReady();
    const db = getDb()!;
    const rows = await db
      .select()
      .from(adminAuditLogsTable)
      .orderBy(asc(adminAuditLogsTable.seq));
    ascLogs = rows.map((r) => ({
      id: r.id,
      seq: r.seq,
      actorEmail: r.actorEmail,
      actorRole: r.actorRole,
      action: r.action,
      entityType: r.entityType,
      entityId: r.entityId,
      detailsJson: r.detailsJson,
      ipAddress: r.ipAddress,
      prevHash: r.prevHash,
      entryHash: r.entryHash,
      createdAt: r.createdAt,
    }));
  } else {
    ascLogs = [...readLocalStore().auditLogs].sort((a, b) => a.seq - b.seq);
  }

  const verification = verifyAuditChain(ascLogs);
  return {
    logs: [...ascLogs].reverse(),
    verification,
  };
}

export async function pruneAuditLogsOwnerOnly(
  actor: ActorContext,
  mode: 'CLEAR_ALL' | 'KEEP_RECENT'
): Promise<{ deletedCount: number }> {
  if (!canManageAuditLogs(actor.email)) {
    throw new Error('Forbidden: Only the Store Owner can modify or clear audit logs.');
  }

  if (hasDatabaseUrl()) {
    await ensurePgReady();
    const db = getDb()!;
    return db.transaction(async (tx) => {
      const existing = await tx
        .select()
        .from(adminAuditLogsTable)
        .orderBy(asc(adminAuditLogsTable.seq));

      if (mode === 'CLEAR_ALL') {
        const deletedCount = existing.length;
        await tx.delete(adminAuditLogsTable);
        await appendAuditPg(tx, actor, 'AUDIT_CLEAR', 'audit_log', 'all', {
          deletedCount,
        });
        return { deletedCount };
      }

      const keepCount = 50;
      if (existing.length <= keepCount) {
        return { deletedCount: 0 };
      }
      const cutoff = existing[existing.length - keepCount];
      let deletedCount = 0;
      for (const row of existing) {
        if (row.seq < cutoff.seq) {
          await tx.delete(adminAuditLogsTable).where(eq(adminAuditLogsTable.id, row.id));
          deletedCount++;
        }
      }
      await appendAuditPg(tx, actor, 'AUDIT_PRUNE', 'audit_log', 'archive', {
        deletedCount,
        kept: keepCount,
      });
      return { deletedCount };
    });
  }

  const store = readLocalStore();
  if (mode === 'CLEAR_ALL') {
    const deletedCount = store.auditLogs.length;
    store.auditLogs = [];
    await appendAuditLocal(store, actor, 'AUDIT_CLEAR', 'audit_log', 'all', {
      deletedCount,
    });
    writeLocalStore(store);
    return { deletedCount };
  }

  const keepCount = 50;
  if (store.auditLogs.length <= keepCount) {
    return { deletedCount: 0 };
  }
  const deletedCount = store.auditLogs.length - keepCount;
  store.auditLogs = store.auditLogs.slice(-keepCount);
  await appendAuditLocal(store, actor, 'AUDIT_PRUNE', 'audit_log', 'archive', {
    deletedCount,
    kept: keepCount,
  });
  writeLocalStore(store);
  return { deletedCount };
}
