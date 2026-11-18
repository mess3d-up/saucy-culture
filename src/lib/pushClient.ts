import type { ApparelSize } from '../types/store';

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function ensureServiceWorkerRegistered(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }
  try {
    return await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  } catch {
    return null;
  }
}

export async function subscribeBrowserBackgroundPush(params: {
  contact?: string;
  topic: 'CART_ABANDON' | 'RESTOCK' | 'ALL';
  productId?: string;
  size?: ApparelSize;
}): Promise<{ subscribed: boolean; reason?: string }> {
  if (
    typeof window === 'undefined' ||
    !('Notification' in window) ||
    !('serviceWorker' in navigator) ||
    !('PushManager' in window)
  ) {
    return { subscribed: false, reason: 'Push not supported on this browser.' };
  }

  let permission = Notification.permission;
  if (permission === 'default') {
    permission = await Notification.requestPermission();
  }
  if (permission !== 'granted') {
    return { subscribed: false, reason: 'Notification permission not granted.' };
  }

  const reg = await ensureServiceWorkerRegistered();
  if (!reg) {
    return { subscribed: false, reason: 'Service worker unavailable.' };
  }

  try {
    const keyRes = await fetch('/api/push/public-key');
    if (!keyRes.ok) return { subscribed: false, reason: 'Push server unreachable.' };
    const keyData = (await keyRes.json()) as { configured: boolean; publicKey: string | null };
    if (!keyData.configured || !keyData.publicKey) {
      return { subscribed: false, reason: 'VAPID public key not configured yet.' };
    }

    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(keyData.publicKey),
      });
    }

    const json = sub.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
      return { subscribed: false, reason: 'Incomplete push subscription keys.' };
    }

    const saveRes = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        endpoint: json.endpoint,
        keys: {
          p256dh: json.keys.p256dh,
          auth: json.keys.auth,
        },
        contact: params.contact,
        topic: params.topic,
        productId: params.productId,
        size: params.size,
      }),
    });

    return { subscribed: saveRes.ok };
  } catch (err) {
    return {
      subscribed: false,
      reason: err instanceof Error ? err.message : 'Unable to register background push.',
    };
  }
}
