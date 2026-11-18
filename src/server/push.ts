import { createRequire } from 'node:module';
import type webpushTypes from 'web-push';

const require = createRequire(import.meta.url);
const webpush = require('web-push') as typeof webpushTypes;

export interface PushConfigStatus {
  configured: boolean;
  publicKey: string | null;
}

let vapidConfigured = false;

export function getWebPushStatus(): PushConfigStatus {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim() || '';
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim() || '';
  const subject = process.env.VAPID_SUBJECT?.trim() || 'mailto:support@saucyculture.in';

  if (!publicKey || !privateKey) {
    return { configured: false, publicKey: null };
  }

  if (!vapidConfigured) {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    vapidConfigured = true;
  }

  return { configured: true, publicKey };
}

export interface StoredPushSub {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export async function dispatchWebPushBatch(
  subscriptions: StoredPushSub[],
  payload: { title: string; body: string; url?: string; tag?: string }
): Promise<{ sent: number; failed: number; expiredEndpoints: string[]; configured: boolean }> {
  const status = getWebPushStatus();
  if (!status.configured) {
    return {
      sent: 0,
      failed: subscriptions.length,
      expiredEndpoints: [],
      configured: false,
    };
  }

  let sent = 0;
  let failed = 0;
  const expiredEndpoints: string[] = [];
  const jsonPayload = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url || '/',
    tag: payload.tag || 'saucy-culture-drop',
  });

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          jsonPayload
        );
        sent++;
      } catch (err: unknown) {
        failed++;
        const statusCode =
          typeof err === 'object' && err !== null && 'statusCode' in err
            ? Number((err as { statusCode?: number }).statusCode)
            : 0;
        if (statusCode === 404 || statusCode === 410) {
          expiredEndpoints.push(sub.endpoint);
        }
      }
    })
  );

  return { sent, failed, expiredEndpoints, configured: true };
}
