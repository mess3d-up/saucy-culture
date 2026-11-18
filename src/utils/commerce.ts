import {
  APPAREL_SIZES,
  type ApparelSize,
  type CartItem,
  type LeadChannel,
  type Order,
  type OrderItemRecord,
  type OrderStatus,
  type Product,
  type StoreSettings,
  type WishlistItem,
} from '../types/store';

export function formatINR(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(Math.round(amount));
}

export function getTotalStock(product: Product): number {
  return Object.values(product.stockBySize).reduce((sum, count) => sum + Math.max(0, count), 0);
}

export function getSizeStock(product: Product, size: ApparelSize): number {
  return Math.max(0, product.stockBySize[size] ?? 0);
}

export function slugifyProductName(name: string): string {
  const cleaned = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || 'saucy-drop-item';
}

const UNIFORM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 32 chars (5 bits each)

function randomFromAlphabet(length: number, randomFn?: () => number): string {
  if (!randomFn && typeof globalThis.crypto?.getRandomValues === 'function') {
    const bytes = new Uint8Array(length);
    globalThis.crypto.getRandomValues(bytes);
    let out = '';
    for (let i = 0; i < length; i++) {
      out += UNIFORM_ALPHABET[bytes[i] & 31];
    }
    return out;
  }
  const rng = randomFn ?? Math.random;
  let out = '';
  for (let i = 0; i < length; i++) {
    out += UNIFORM_ALPHABET[Math.floor(rng() * 32) & 31];
  }
  return out;
}

export function generateOrderNumber(randomFn?: () => number): string {
  return `SC-IN-${randomFromAlphabet(10, randomFn)}`;
}

export function generateTrackingToken(randomFn?: () => number): string {
  const raw = randomFromAlphabet(12, randomFn);
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
}

export function normalizeTrackingToken(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export interface CheckoutTotals {
  items: OrderItemRecord[];
  subtotalINR: number;
  discountINR: number;
  shippingINR: number;
  totalINR: number;
  appliedPromoCode: string;
  freeShippingUnlocked: boolean;
}

/**
 * Authoritatively recalculates checkout totals from the live product catalogue
 * so tampered client-side cart prices cannot alter the final order amount.
 */
export function calculateAuthoritativeTotals(
  cartItems: CartItem[],
  catalog: Product[],
  settings: StoreSettings,
  promoInput: string
): CheckoutTotals {
  if (!Array.isArray(cartItems) || cartItems.length === 0) {
    throw new Error('Your bag is empty.');
  }
  if (cartItems.length > 30) {
    throw new Error('Too many cart lines in one order.');
  }

  const catalogById = new Map(catalog.map((p) => [p.id, p]));
  const aggregated = new Map<string, { product: Product; size: ApparelSize; qty: number }>();

  for (const item of cartItems) {
    if (!item || typeof item.productId !== 'string' || !APPAREL_SIZES.includes(item.size)) {
      throw new Error('Invalid item or size in bag.');
    }
    const product = catalogById.get(item.productId);
    if (!product || !product.active) {
      throw new Error(`Product "${item.name}" is no longer available.`);
    }
    if (!Number.isFinite(item.qty) || !Number.isInteger(item.qty) || item.qty < 1 || item.qty > 10) {
      throw new Error(`Invalid quantity for "${product.name}".`);
    }

    const key = `${product.id}::${item.size}`;
    const prev = aggregated.get(key);
    const nextQty = (prev?.qty ?? 0) + item.qty;
    if (nextQty > 10) {
      throw new Error(`Maximum 10 units allowed per item/size for "${product.name} (${item.size})".`);
    }
    aggregated.set(key, { product, size: item.size, qty: nextQty });
  }

  const verifiedItems: OrderItemRecord[] = [];
  for (const { product, size, qty } of aggregated.values()) {
    const available = getSizeStock(product, size);
    if (available < qty) {
      throw new Error(`Only ${available} unit(s) left for ${product.name} (${size}).`);
    }
    verifiedItems.push({
      productId: product.id,
      name: product.name,
      size,
      qty,
      priceINR: product.priceINR,
    });
  }

  if (verifiedItems.length === 0) {
    throw new Error('Your bag is empty.');
  }

  const subtotalINR = verifiedItems.reduce((sum, item) => sum + item.priceINR * item.qty, 0);
  const normalizedInput = promoInput.trim().toUpperCase();
  const normalizedStoreCode = settings.vipPromoCode.trim().toUpperCase();
  const promoMatched =
    normalizedInput.length > 0 &&
    normalizedStoreCode.length > 0 &&
    normalizedInput === normalizedStoreCode &&
    settings.vipDiscountPercent > 0;

  const discountINR = promoMatched
    ? Math.round((subtotalINR * settings.vipDiscountPercent) / 100)
    : 0;

  const afterDiscount = Math.max(1, subtotalINR - discountINR);
  const freeShippingUnlocked = afterDiscount >= settings.freeShippingThresholdINR;
  const shippingINR = freeShippingUnlocked ? 0 : settings.shippingFeeINR;
  const totalINR = afterDiscount + shippingINR;

  return {
    items: verifiedItems,
    subtotalINR,
    discountINR,
    shippingINR,
    totalINR,
    appliedPromoCode: promoMatched ? normalizedStoreCode : '',
    freeShippingUnlocked,
  };
}

export interface CheckoutInput {
  customerName: string;
  customerPhone: string;
  shippingAddr: string;
  city: string;
  pincode: string;
  paymentMethod: 'COD' | 'UPI_DIRECT';
  upiRef: string;
}

export function validateCheckoutInput(input: CheckoutInput): string | null {
  if (input.customerName.trim().length < 2) {
    return 'Enter customer full name (at least 2 characters).';
  }
  if (!/^[6-9][0-9]{9}$/.test(input.customerPhone.trim())) {
    return 'Enter a valid 10-digit Indian mobile number.';
  }
  if (input.shippingAddr.trim().length < 8) {
    return 'Enter complete street / flat delivery address.';
  }
  if (input.city.trim().length < 2) {
    return 'Enter delivery city.';
  }
  if (!/^[1-9][0-9]{5}$/.test(input.pincode.trim())) {
    return 'Enter a valid 6-digit Indian PIN code.';
  }
  if (input.paymentMethod === 'UPI_DIRECT') {
    const ref = input.upiRef.trim();
    if (!/^[a-zA-Z0-9]{6,40}$/.test(ref)) {
      return 'Enter your 12-digit UPI UTR / transaction reference (6–40 alphanumeric chars).';
    }
  }
  return null;
}

export function buildUpiPaymentUri(params: {
  upiId: string;
  merchantName: string;
  amountINR: number;
  orderRef: string;
}): string {
  const query = new URLSearchParams({
    pa: params.upiId.trim(),
    pn: params.merchantName.trim(),
    am: String(Math.max(1, Math.round(params.amountINR))),
    cu: 'INR',
    tn: `Saucy Culture ${params.orderRef}`,
  });
  return `upi://pay?${query.toString()}`;
}

export function getOrderStatusLabel(status: OrderStatus): string {
  switch (status) {
    case 'PAYMENT_ON_HOLD':
      return 'COD Awaiting Confirmation';
    case 'UPI_PENDING_VERIFY':
      return 'UPI Pending Verification';
    case 'UPI_VERIFIED':
      return 'UPI Payment Verified';
    case 'COD_CONFIRMED':
      return 'COD Confirmed';
    case 'PACKED':
      return 'Packed at Studio';
    case 'DISPATCHED':
      return 'Dispatched';
    case 'DELIVERED':
      return 'Delivered';
    case 'CANCELLED':
      return 'Cancelled';
  }
}

export function getOrderTimelineStep(status: OrderStatus): number {
  switch (status) {
    case 'PAYMENT_ON_HOLD':
    case 'UPI_PENDING_VERIFY':
      return 1;
    case 'UPI_VERIFIED':
    case 'COD_CONFIRMED':
      return 2;
    case 'PACKED':
      return 3;
    case 'DISPATCHED':
    case 'DELIVERED':
      return 4;
    case 'CANCELLED':
      return 0;
  }
}

export function buildOrdersCsv(orders: Order[]): string {
  const header = [
    'OrderNumber',
    'Customer',
    'Phone',
    'City',
    'Pincode',
    'PaymentMethod',
    'UPI_UTR',
    'Status',
    'TotalINR',
    'Courier',
    'TrackingID',
    'Items',
  ];
  const escapeCell = (val: string | number) => `"${String(val).replace(/"/g, '""')}"`;
  const rows = orders.map((o) =>
    [
      o.orderNumber,
      o.customerName,
      o.customerPhone,
      o.city,
      o.pincode,
      o.paymentMethod,
      o.upiRef || '-',
      o.paymentStatus,
      o.totalINR,
      o.courierName || '-',
      o.trackingId || '-',
      o.items.map((i) => `${i.name} (${i.size}x${i.qty})`).join('; '),
    ]
      .map(escapeCell)
      .join(',')
  );
  return [header.join(','), ...rows].join('\n');
}

export function validateLeadContact(
  raw: string
): { valid: true; normalized: string; channel: LeadChannel } | { valid: false; error: string } {
  const clean = raw.trim();
  const digits = clean.replace(/[^0-9]/g, '');
  if (/^[6-9][0-9]{9}$/.test(digits) && digits.length === clean.replace(/[\s+\-()]/g, '').replace(/^91/, '').length) {
    return { valid: true, normalized: digits, channel: 'WHATSAPP' };
  }
  if (/^[6-9][0-9]{9}$/.test(clean)) {
    return { valid: true, normalized: clean, channel: 'WHATSAPP' };
  }
  if (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(clean) && clean.length <= 120) {
    return { valid: true, normalized: clean.toLowerCase(), channel: 'EMAIL' };
  }
  return {
    valid: false,
    error: 'Enter a valid 10-digit WhatsApp number or email address.',
  };
}

export function findRestockedWishlistItems(
  wishlist: WishlistItem[],
  catalog: Product[]
): WishlistItem[] {
  const catalogById = new Map(catalog.map((p) => [p.id, p]));
  return wishlist.filter((item) => {
    if (!item.wasOutOfStock) return false;
    const prod = catalogById.get(item.productId);
    if (!prod || !prod.active) return false;
    return getSizeStock(prod, item.size) > 0;
  });
}

export function buildAbandonedCartPitch(params: {
  items: CartItem[];
  promoCode: string;
  discountPercent: number;
}): { title: string; body: string } {
  const leadItem = params.items[0];
  const extraCount = Math.max(0, params.items.length - 1);
  const itemPhrase = leadItem
    ? extraCount > 0
      ? `${leadItem.name} (${leadItem.size}) + ${extraCount} more`
      : `${leadItem.name} (Size ${leadItem.size})`
    : 'your Saucy Culture drop';

  const code = params.promoCode.trim() || 'SAUCYVIP10';
  const pct = Math.max(5, params.discountPercent || 10);

  return {
    title: `YO! LOCK YOUR ${pct}% OFF BEFORE YOUR SIZE VANISHES`,
    body: `Your ${itemPhrase} is still sitting in the bag. Hit checkout right now with code ${code} for an instant ${pct}% OFF — zero-fee UPI & COD ready!`,
  };
}

export function buildRestockPitch(params: {
  productName: string;
  size: ApparelSize;
  promoCode: string;
  discountPercent: number;
}): { title: string; body: string } {
  const code = params.promoCode.trim() || 'SAUCYVIP10';
  const pct = Math.max(5, params.discountPercent || 10);
  return {
    title: `BACK IN STOCK: ${params.productName} (${params.size})`,
    body: `Fresh units just landed! Grab your Size ${params.size} before it sells out again — use ${code} for ${pct}% OFF.`,
  };
}

const ALLOWED_PUSH_EXACT_HOSTS = new Set([
  'fcm.googleapis.com',
  'android.googleapis.com',
  'updates.push.services.mozilla.com',
  'push.services.mozilla.com',
]);

const ALLOWED_PUSH_SUFFIXES = [
  '.push.services.mozilla.com',
  '.mozaws.net',
  '.push.apple.com',
  '.notify.windows.com',
  '.push.samsungosp.com',
];

export function validatePushEndpointUrl(endpoint: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(endpoint.trim());
  } catch {
    throw new Error('Invalid push endpoint URL.');
  }

  if (parsed.protocol !== 'https:') {
    throw new Error('Push endpoint must use HTTPS.');
  }
  if (parsed.username || parsed.password || parsed.port) {
    throw new Error('Push endpoint must not include credentials or non-standard ports.');
  }
  const host = parsed.hostname.toLowerCase();
  if (
    !host ||
    host === 'localhost' ||
    /^[0-9.]+$/.test(host) ||
    host.includes(':')
  ) {
    throw new Error('Invalid push service host.');
  }

  const allowed =
    ALLOWED_PUSH_EXACT_HOSTS.has(host) ||
    ALLOWED_PUSH_SUFFIXES.some((suffix) => host.endsWith(suffix));

  if (!allowed) {
    throw new Error('Unsupported Web Push service provider host.');
  }

  return parsed;
}
