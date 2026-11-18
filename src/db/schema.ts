import {
  boolean,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';
import type {
  ApparelCategory,
  ApparelSize,
  LeadChannel,
  OrderItemRecord,
  OrderStatus,
  PaymentMethod,
  StockBySize,
} from '../types/store';

export const productsTable = pgTable('products', {
  id: text('id').primaryKey(),
  slug: text('slug').notNull(),
  name: text('name').notNull(),
  category: text('category').$type<ApparelCategory>().notNull(),
  collection: text('collection').notNull(),
  priceINR: integer('price_inr').notNull(),
  compareAtINR: integer('compare_at_inr'),
  badge: text('badge'),
  spec: text('spec').notNull(),
  description: text('description').notNull(),
  image: text('image').notNull(),
  gallery: jsonb('gallery').$type<string[]>().notNull().default([]),
  stockBySize: jsonb('stock_by_size').$type<StockBySize>().notNull(),
  featured: boolean('featured').notNull().default(false),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const ordersTable = pgTable('orders', {
  id: text('id').primaryKey(),
  orderNumber: text('order_number').notNull().unique(),
  trackingToken: text('tracking_token').notNull().default(''),
  customerName: text('customer_name').notNull(),
  customerPhone: text('customer_phone').notNull(),
  shippingAddr: text('shipping_addr').notNull(),
  city: text('city').notNull(),
  pincode: text('pincode').notNull(),
  items: jsonb('items').$type<OrderItemRecord[]>().notNull(),
  subtotalINR: integer('subtotal_inr').notNull(),
  shippingINR: integer('shipping_inr').notNull(),
  discountINR: integer('discount_inr').notNull().default(0),
  promoCode: text('promo_code').notNull().default(''),
  totalINR: integer('total_inr').notNull(),
  paymentMethod: text('payment_method').$type<PaymentMethod>().notNull(),
  upiRef: text('upi_ref').notNull().default(''),
  paymentStatus: text('payment_status').$type<OrderStatus>().notNull(),
  stockDeducted: boolean('stock_deducted').notNull().default(true),
  reservedUntil: timestamp('reserved_until', { withTimezone: true }),
  courierName: text('courier_name').notNull().default(''),
  trackingId: text('tracking_id').notNull().default(''),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const orderTrackingTable = pgTable('order_tracking', {
  orderNumber: text('order_number').primaryKey(),
  orderId: text('order_id').notNull(),
  trackingToken: text('tracking_token').notNull().default(''),
  phoneLast4: text('phone_last_4').notNull().default(''),
  customerFirstName: text('customer_first_name').notNull(),
  city: text('city').notNull(),
  itemsSummary: jsonb('items_summary').$type<OrderItemRecord[]>().notNull(),
  totalINR: integer('total_inr').notNull(),
  paymentMethod: text('payment_method').$type<PaymentMethod>().notNull(),
  paymentStatus: text('payment_status').$type<OrderStatus>().notNull(),
  courierName: text('courier_name').notNull().default(''),
  trackingId: text('tracking_id').notNull().default(''),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const rateLimitsTable = pgTable('rate_limits', {
  bucketKey: text('bucket_key').primaryKey(),
  count: integer('count').notNull().default(0),
  resetAt: timestamp('reset_at', { withTimezone: true }).notNull(),
});

export const circleMembersTable = pgTable('circle_members', {
  id: text('id').primaryKey(),
  nickname: text('nickname').notNull(),
  whatsappPhone: text('whatsapp_phone').notNull().unique(),
  preferredSize: text('preferred_size').$type<ApparelSize>().notNull(),
  vipCode: text('vip_code').notNull(),
  joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
});

export const cartLeadsTable = pgTable('cart_leads', {
  id: text('id').primaryKey(),
  contact: text('contact').notNull(),
  channel: text('channel').$type<LeadChannel>().notNull(),
  itemsSummary: jsonb('items_summary').$type<OrderItemRecord[]>().notNull(),
  cartTotalINR: integer('cart_total_inr').notNull(),
  promoOffered: text('promo_offered').notNull(),
  pushEnabled: boolean('push_enabled').notNull().default(false),
  status: text('status').$type<'NEW' | 'NOTIFIED' | 'CONVERTED'>().notNull().default('NEW'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const restockAlertsTable = pgTable('restock_alerts', {
  id: text('id').primaryKey(),
  productId: text('product_id').notNull(),
  productName: text('product_name').notNull(),
  size: text('size').$type<ApparelSize>().notNull(),
  contact: text('contact').notNull(),
  pushEnabled: boolean('push_enabled').notNull().default(false),
  status: text('status').$type<'WAITING' | 'NOTIFIED'>().notNull().default('WAITING'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const pushSubscriptionsTable = pgTable('push_subscriptions', {
  id: text('id').primaryKey(),
  endpoint: text('endpoint').notNull().unique(),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  contact: text('contact').notNull().default(''),
  topic: text('topic').$type<'CART_ABANDON' | 'RESTOCK' | 'ALL'>().notNull().default('ALL'),
  productId: text('product_id'),
  size: text('size').$type<ApparelSize>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const storeSettingsTable = pgTable('store_settings', {
  id: text('id').primaryKey(),
  upiId: text('upi_id').notNull(),
  upiMerchantName: text('upi_merchant_name').notNull(),
  freeShippingThresholdINR: integer('free_shipping_threshold_inr').notNull(),
  shippingFeeINR: integer('shipping_fee_inr').notNull(),
  vipPromoCode: text('vip_promo_code').notNull(),
  vipDiscountPercent: integer('vip_discount_percent').notNull(),
  announcementText: text('announcement_text').notNull(),
  heroTitle: text('hero_title').notNull().default('THE NEW HOOP ERA'),
  heroSubtitle: text('hero_subtitle').notNull().default('BASKETBALL × STREETWEAR · ALL-STAR DROP'),
  maintenanceMode: boolean('maintenance_mode').notNull().default(false),
  supportWhatsapp: text('support_whatsapp').notNull(),
  supportEmail: text('support_email').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const adminsTable = pgTable('admins', {
  email: text('email').primaryKey(),
  role: text('role').$type<'ADMIN' | 'SUPER_ADMIN'>().notNull().default('ADMIN'),
  addedBy: text('added_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const adminAuditLogsTable = pgTable('admin_audit_logs', {
  id: text('id').primaryKey(),
  seq: serial('seq').notNull(),
  actorEmail: text('actor_email').notNull(),
  actorRole: text('actor_role').$type<'OWNER' | 'ADMIN'>().notNull(),
  action: text('action').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull(),
  detailsJson: text('details_json').notNull(),
  ipAddress: text('ip_address').notNull(),
  prevHash: text('prev_hash').notNull(),
  entryHash: text('entry_hash').notNull(),
  createdAt: text('created_at').notNull(),
});
