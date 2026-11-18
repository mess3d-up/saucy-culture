export type ApparelCategory = 'Jerseys' | 'Hoodies' | 'Shorts' | 'Tees';
export type ApparelSize = 'S' | 'M' | 'L' | 'XL' | 'XXL';

export const APPAREL_SIZES: ApparelSize[] = ['S', 'M', 'L', 'XL', 'XXL'];
export const APPAREL_CATEGORIES: ApparelCategory[] = ['Jerseys', 'Hoodies', 'Shorts', 'Tees'];

export type StockBySize = Record<ApparelSize, number>;

export interface Product {
  id: string;
  slug: string;
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
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface CartItem {
  productId: string;
  name: string;
  image: string;
  size: ApparelSize;
  qty: number;
  priceINR: number;
}

export type PaymentMethod = 'COD' | 'UPI_DIRECT';

export type OrderStatus =
  | 'PAYMENT_ON_HOLD'
  | 'UPI_PENDING_VERIFY'
  | 'UPI_VERIFIED'
  | 'COD_CONFIRMED'
  | 'PACKED'
  | 'DISPATCHED'
  | 'DELIVERED'
  | 'CANCELLED';

export interface OrderItemRecord {
  productId: string;
  name: string;
  size: ApparelSize;
  qty: number;
  priceINR: number;
}

export interface Order {
  id: string;
  orderNumber: string;
  trackingToken: string;
  customerName: string;
  customerPhone: string;
  shippingAddr: string;
  city: string;
  pincode: string;
  items: OrderItemRecord[];
  subtotalINR: number;
  shippingINR: number;
  discountINR: number;
  promoCode: string;
  totalINR: number;
  paymentMethod: PaymentMethod;
  upiRef: string;
  paymentStatus: OrderStatus;
  stockDeducted: boolean;
  reservedUntil?: string | null;
  courierName: string;
  trackingId: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface OrderTracking {
  orderId: string;
  orderNumber: string;
  customerFirstName: string;
  city: string;
  itemsSummary: OrderItemRecord[];
  totalINR: number;
  paymentMethod: PaymentMethod;
  paymentStatus: OrderStatus;
  courierName: string;
  trackingId: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface CircleMember {
  id: string;
  nickname: string;
  whatsappPhone: string;
  preferredSize: ApparelSize;
  vipCode: string;
  joinedAt?: unknown;
}

export interface StoreSettings {
  upiId: string;
  upiMerchantName: string;
  freeShippingThresholdINR: number;
  shippingFeeINR: number;
  vipPromoCode: string;
  vipDiscountPercent: number;
  announcementText: string;
  heroTitle: string;
  heroSubtitle: string;
  maintenanceMode: boolean;
  supportWhatsapp: string;
  supportEmail: string;
  updatedAt?: unknown;
}

export interface AdminAccess {
  email: string;
  role: 'ADMIN' | 'SUPER_ADMIN';
  addedBy: string;
  createdAt?: unknown;
}

export interface WishlistItem {
  productId: string;
  name: string;
  image: string;
  size: ApparelSize;
  priceINR: number;
  addedAt: number;
  wasOutOfStock: boolean;
}

export type LeadChannel = 'WHATSAPP' | 'EMAIL' | 'BROWSER_PUSH';

export interface CartLead {
  id: string;
  contact: string;
  channel: LeadChannel;
  itemsSummary: OrderItemRecord[];
  cartTotalINR: number;
  promoOffered: string;
  pushEnabled: boolean;
  status: 'NEW' | 'NOTIFIED' | 'CONVERTED';
  createdAt?: unknown;
}

export interface RestockAlert {
  id: string;
  productId: string;
  productName: string;
  size: ApparelSize;
  contact: string;
  pushEnabled: boolean;
  status: 'WAITING' | 'NOTIFIED';
  createdAt?: unknown;
}

export interface PushSubscriptionInput {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  contact?: string;
  topic?: 'CART_ABANDON' | 'RESTOCK' | 'ALL';
  productId?: string;
  size?: ApparelSize;
}

export interface AuditLogEntry {
  id: string;
  seq: number;
  actorEmail: string;
  actorRole: 'OWNER' | 'ADMIN';
  action: string;
  entityType: string;
  entityId: string;
  detailsJson: string;
  ipAddress: string;
  prevHash: string;
  entryHash: string;
  createdAt: string;
}

export interface AuditVerificationResult {
  valid: boolean;
  totalEntries: number;
  brokenAtSeq: number | null;
  reason?: string;
}


