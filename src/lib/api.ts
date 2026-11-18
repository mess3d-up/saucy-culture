import { getAdminIdToken } from './firebase';
import type {
  AdminAccess,
  ApparelSize,
  AuditLogEntry,
  AuditVerificationResult,
  CartLead,
  CircleMember,
  LeadChannel,
  Order,
  OrderItemRecord,
  OrderStatus,
  OrderTracking,
  Product,
  RestockAlert,
  StoreSettings,
} from '../types/store';

async function parseApiResponse<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      typeof data === 'object' && data !== null && 'error' in data
        ? String((data as { error: unknown }).error)
        : `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return data as T;
}

async function adminFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const token = await getAdminIdToken();
  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });
  return parseApiResponse<T>(res);
}

// Public Storefront Calls
export async function fetchProducts(): Promise<Product[]> {
  const data = await parseApiResponse<{ products: Product[] }>(await fetch('/api/products'));
  return data.products;
}

export async function fetchStoreSettings(): Promise<StoreSettings> {
  const data = await parseApiResponse<{ settings: StoreSettings }>(await fetch('/api/settings'));
  return data.settings;
}

export async function placeCustomerOrder(params: {
  customerName: string;
  customerPhone: string;
  shippingAddr: string;
  city: string;
  pincode: string;
  items: { productId: string; name: string; size: ApparelSize; qty: number; priceINR: number }[];
  subtotalINR: number;
  shippingINR: number;
  discountINR: number;
  promoCode: string;
  totalINR: number;
  paymentMethod: 'COD' | 'UPI_DIRECT';
  upiRef: string;
  website?: string;
}): Promise<{ orderId: string; orderNumber: string; trackingToken: string; totalINR: number }> {
  const res = await fetch('/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return parseApiResponse(res);
}

export async function lookupOrderTracking(
  orderNumber: string,
  trackingToken: string
): Promise<OrderTracking | null> {
  const qs = new URLSearchParams({
    orderNumber: orderNumber.trim().toUpperCase(),
    trackingToken: trackingToken.trim().toUpperCase(),
  });
  const res = await fetch(`/api/track?${qs.toString()}`);
  if (res.status === 404) return null;
  const data = await parseApiResponse<{ tracking: OrderTracking }>(res);
  return data.tracking;
}

export async function joinOurCircle(params: {
  nickname: string;
  whatsappPhone: string;
  preferredSize: ApparelSize;
  vipCode: string;
}): Promise<{ alreadyJoined: boolean; vipCode: string }> {
  const res = await fetch('/api/circle', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return parseApiResponse(res);
}

export async function saveCartLead(params: {
  contact: string;
  channel: LeadChannel;
  itemsSummary: OrderItemRecord[];
  cartTotalINR: number;
  promoOffered: string;
  pushEnabled: boolean;
}): Promise<string> {
  const res = await fetch('/api/leads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const data = await parseApiResponse<{ leadId: string }>(res);
  return data.leadId;
}

export async function saveRestockAlert(params: {
  productId: string;
  productName: string;
  size: ApparelSize;
  contact: string;
  pushEnabled: boolean;
}): Promise<string> {
  const res = await fetch('/api/restock-alerts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const data = await parseApiResponse<{ alertId: string }>(res);
  return data.alertId;
}

// Admin Authenticated Calls
export interface AdminDashboardPayload {
  products: Product[];
  settings: StoreSettings;
  orders: Order[];
  circleMembers: CircleMember[];
  cartLeads: CartLead[];
  restockAlerts: RestockAlert[];
  admins: AdminAccess[];
  pushSubscriberCount: number;
  storageMode: 'postgres' | 'local-json';
  isOwner: boolean;
  webPushConfigured: boolean;
  cloudinaryConfigured: boolean;
}

export async function checkAdminIdentity(): Promise<{
  email: string;
  role: 'OWNER' | 'ADMIN';
  isOwner: boolean;
  storageMode: 'postgres' | 'local-json';
}> {
  return adminFetch('/api/admin/me');
}

export async function fetchAdminDashboard(): Promise<AdminDashboardPayload> {
  return adminFetch('/api/admin/dashboard');
}

export async function seedInitialCatalogIfEmpty(): Promise<{ seededProducts: number }> {
  return adminFetch('/api/admin/sync-catalog', { method: 'POST' });
}

export async function saveProductAdmin(
  product: Omit<Product, 'createdAt' | 'updatedAt'>,
  isNew: boolean
): Promise<{
  product: Product;
  restockedSizes: ApparelSize[];
  pushDispatch: { sent: number; failed: number; configured: boolean };
}> {
  return adminFetch('/api/admin/products', {
    method: 'POST',
    body: JSON.stringify({ ...product, isNew }),
  });
}

export async function deleteProductAdmin(productId: string): Promise<void> {
  await adminFetch(`/api/admin/products/${encodeURIComponent(productId)}`, {
    method: 'DELETE',
  });
}

export async function updateOrderStatusAdmin(params: {
  order: Order;
  nextStatus: OrderStatus;
  courierName?: string;
  trackingId?: string;
}): Promise<Order> {
  const data = await adminFetch<{ order: Order }>(
    `/api/admin/orders/${encodeURIComponent(params.order.id)}`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        nextStatus: params.nextStatus,
        courierName: params.courierName,
        trackingId: params.trackingId,
      }),
    }
  );
  return data.order;
}

export async function releaseExpiredOrdersAdmin(): Promise<{ releasedCount: number }> {
  return adminFetch('/api/admin/orders/release-expired', { method: 'POST' });
}

export async function updateStoreSettingsAdmin(
  settings: Omit<StoreSettings, 'updatedAt'>
): Promise<StoreSettings> {
  const data = await adminFetch<{ settings: StoreSettings }>('/api/admin/settings', {
    method: 'PUT',
    body: JSON.stringify(settings),
  });
  return data.settings;
}

export async function addAdminEmail(email: string): Promise<void> {
  await adminFetch('/api/admin/team', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export async function removeAdminEmail(email: string): Promise<void> {
  await adminFetch(`/api/admin/team/${encodeURIComponent(email)}`, {
    method: 'DELETE',
  });
}

export async function updateCartLeadStatusAdmin(
  leadId: string,
  status: 'NEW' | 'NOTIFIED' | 'CONVERTED'
): Promise<void> {
  await adminFetch(`/api/admin/leads/${encodeURIComponent(leadId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export async function updateRestockAlertStatusAdmin(
  alertId: string,
  status: 'WAITING' | 'NOTIFIED'
): Promise<void> {
  await adminFetch(`/api/admin/restock-alerts/${encodeURIComponent(alertId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export async function sendPushBlastAdmin(params: {
  topic: 'CART_ABANDON' | 'RESTOCK' | 'ALL';
  title: string;
  body: string;
  url?: string;
}): Promise<{ sent: number; failed: number; configured: boolean }> {
  return adminFetch('/api/admin/push/blast', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function fetchAuditLogsAdmin(): Promise<{
  logs: AuditLogEntry[];
  verification: AuditVerificationResult;
}> {
  return adminFetch('/api/admin/audit-logs');
}

export async function pruneAuditLogsOwnerAdmin(
  mode: 'KEEP_RECENT' | 'CLEAR_ALL'
): Promise<{ deletedCount: number }> {
  return adminFetch(`/api/admin/audit-logs?mode=${mode}`, {
    method: 'DELETE',
  });
}

/**
 * Compresses large camera images on the client if needed and uploads directly
 * to Cloudinary using a short-lived Admin-authenticated SHA-1 signature.
 */
export async function uploadProductImageCloudinary(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Select a valid image file (JPG, PNG, or WEBP).');
  }
  if (file.size > 15 * 1024 * 1024) {
    throw new Error('Image must be smaller than 15 MB.');
  }

  const sig = await adminFetch<{
    configured: boolean;
    cloudName: string;
    apiKey: string;
    timestamp: number;
    folder: string;
    signature: string;
  }>('/api/admin/cloudinary-signature', { method: 'POST' });

  let uploadBlob: Blob = file;
  try {
    if (file.size > 1.8 * 1024 * 1024 && typeof createImageBitmap === 'function') {
      const bitmap = await createImageBitmap(file);
      const maxDim = 1600;
      const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        const compressed = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, 'image/webp', 0.86)
        );
        if (compressed) uploadBlob = compressed;
      }
      bitmap.close();
    }
  } catch {
    // Fallback to raw file upload if canvas resizing fails
  }

  const form = new FormData();
  form.append('file', uploadBlob, file.name);
  form.append('api_key', sig.apiKey);
  form.append('timestamp', String(sig.timestamp));
  form.append('folder', sig.folder);
  form.append('signature', sig.signature);

  const cloudRes = await fetch(
    `https://api.cloudinary.com/v1_1/${encodeURIComponent(sig.cloudName)}/image/upload`,
    {
      method: 'POST',
      body: form,
    }
  );
  const cloudData = await cloudRes.json();
  if (!cloudRes.ok || !cloudData.secure_url) {
    throw new Error(cloudData?.error?.message || 'Cloudinary upload failed.');
  }
  return String(cloudData.secure_url);
}
