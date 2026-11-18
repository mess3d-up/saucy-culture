import { createHash } from 'node:crypto';
import express, { type NextFunction, type Request, type Response } from 'express';
import { assertProductionDatabaseConfigured, isProductionRuntime } from '../db/index';
import { buildRestockPitch } from '../utils/commerce';
import { extractRequestIp, isOwnerEmail, verifyBearerToken } from './auth';
import { dispatchWebPushBatch, getWebPushStatus } from './push';
import { isHoneypotTriggered, RATE_LIMITS, rateLimitMiddleware } from './rateLimit';
import {
  addAdminEmail,
  deleteExpiredPushEndpoints,
  deleteProductAdmin,
  getAdminRole,
  getAuditLogsWithVerification,
  getStorageInfo,
  getStoreSettings,
  joinOurCircle,
  listAdminDashboardData,
  listProducts,
  listPushSubscriptions,
  lookupOrderTracking,
  placeCustomerOrder,
  pruneAuditLogsOwnerOnly,
  recordPushBlastAudit,
  releaseExpiredReservations,
  removeAdminEmail,
  saveCartLead,
  saveProductAdmin,
  savePushSubscription,
  saveRestockAlert,
  seedDefaultCatalog,
  updateCartLeadStatusAdmin,
  updateOrderStatusAdmin,
  updateRestockAlertStatusAdmin,
  updateStoreSettingsAdmin,
  verifyDatabaseConnectionAndSchema,
  type ActorContext,
} from './repository';

interface AdminRequest extends Request {
  adminActor?: ActorContext;
}

async function requireAdmin(req: AdminRequest, res: Response, next: NextFunction) {
  try {
    const identity = await verifyBearerToken(req);
    const role = await getAdminRole(identity.email);
    if (!role) {
      res.status(403).json({ error: 'Account is not authorized for Saucy Culture Admin.' });
      return;
    }
    req.adminActor = {
      email: identity.email,
      role,
      ipAddress: extractRequestIp(req),
    };
    next();
  } catch (err) {
    res.status(401).json({
      error: err instanceof Error ? err.message : 'Unauthorized admin request.',
    });
  }
}

export function createApiApp() {
  assertProductionDatabaseConfigured();

  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '64kb' }));
  app.use('/api', rateLimitMiddleware(RATE_LIMITS.globalApi));

  app.get('/api/health', async (_req, res) => {
    try {
      const dbStatus = await verifyDatabaseConnectionAndSchema();
      if (isProductionRuntime() && dbStatus.mode !== 'postgres') {
        res.status(503).json({
          ok: false,
          storage: dbStatus.mode,
          error: 'Production runtime requires PostgreSQL.',
        });
        return;
      }

      const push = getWebPushStatus();
      res.json({
        ok: true,
        storage: dbStatus.mode,
        dbConnected: dbStatus.connected,
        webPushConfigured: push.configured,
        cloudinaryConfigured: Boolean(
          process.env.CLOUDINARY_CLOUD_NAME &&
            process.env.CLOUDINARY_API_KEY &&
            process.env.CLOUDINARY_API_SECRET
        ),
      });
    } catch (err) {
      res.status(503).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Database health check failed.',
      });
    }
  });

  // Public Storefront Endpoints
  app.get('/api/products', async (_req, res) => {
    try {
      const products = await listProducts(false);
      res.json({ products });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to load products.' });
    }
  });

  app.get('/api/settings', async (_req, res) => {
    try {
      const settings = await getStoreSettings();
      res.json({ settings });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to load settings.' });
    }
  });

  app.post('/api/orders', rateLimitMiddleware(RATE_LIMITS.orders), async (req, res) => {
    try {
      if (isHoneypotTriggered(req.body)) {
        res.status(400).json({ error: 'Unable to place order.' });
        return;
      }
      const result = await placeCustomerOrder(req.body);
      res.status(201).json(result);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Unable to place order.' });
    }
  });

  app.get('/api/track', rateLimitMiddleware(RATE_LIMITS.track), async (req, res) => {
    try {
      const orderNumber = String(req.query.orderNumber ?? '');
      const trackingToken = String(req.query.trackingToken ?? req.query.token ?? '');
      const tracking = await lookupOrderTracking(orderNumber, trackingToken);
      if (!tracking) {
        res.status(404).json({ error: 'Order ID or tracking key is invalid.' });
        return;
      }
      res.json({ tracking });
    } catch {
      res.status(404).json({ error: 'Order ID or tracking key is invalid.' });
    }
  });

  app.post('/api/circle', rateLimitMiddleware(RATE_LIMITS.circle), async (req, res) => {
    try {
      if (isHoneypotTriggered(req.body)) {
        res.status(400).json({ error: 'Unable to join Our Circle.' });
        return;
      }
      const result = await joinOurCircle(req.body);
      res.status(201).json(result);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Unable to join Our Circle.' });
    }
  });

  app.post('/api/leads', rateLimitMiddleware(RATE_LIMITS.leads), async (req, res) => {
    try {
      if (isHoneypotTriggered(req.body)) {
        res.status(400).json({ error: 'Unable to save lead.' });
        return;
      }
      const leadId = await saveCartLead(req.body);
      res.status(201).json({ leadId });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Unable to save lead.' });
    }
  });

  app.post(
    '/api/restock-alerts',
    rateLimitMiddleware(RATE_LIMITS.restockAlerts),
    async (req, res) => {
      try {
        if (isHoneypotTriggered(req.body)) {
          res.status(400).json({ error: 'Unable to save alert.' });
          return;
        }
        const alertId = await saveRestockAlert(req.body);
        res.status(201).json({ alertId });
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : 'Unable to save alert.' });
      }
    }
  );

  // Web Push Subscription Endpoints
  app.get('/api/push/public-key', (_req, res) => {
    const status = getWebPushStatus();
    res.json(status);
  });

  app.post(
    '/api/push/subscribe',
    rateLimitMiddleware(RATE_LIMITS.pushSubscribe),
    async (req, res) => {
      try {
        await savePushSubscription(req.body);
        res.status(201).json({ ok: true });
      } catch (err) {
        res
          .status(400)
          .json({ error: err instanceof Error ? err.message : 'Failed to save push subscription.' });
      }
    }
  );

  // Protected Admin Endpoints
  app.get('/api/admin/me', requireAdmin, async (req: AdminRequest, res) => {
    const storage = await getStorageInfo();
    res.json({
      email: req.adminActor!.email,
      role: req.adminActor!.role,
      isOwner: isOwnerEmail(req.adminActor!.email),
      storageMode: storage.mode,
    });
  });

  app.get('/api/admin/dashboard', requireAdmin, async (req: AdminRequest, res) => {
    try {
      const [products, settings, dashboard, storage] = await Promise.all([
        listProducts(true),
        getStoreSettings(),
        listAdminDashboardData(),
        getStorageInfo(),
      ]);
      const push = getWebPushStatus();
      res.json({
        ...dashboard,
        products,
        settings,
        storageMode: storage.mode,
        isOwner: isOwnerEmail(req.adminActor!.email),
        webPushConfigured: push.configured,
        cloudinaryConfigured: Boolean(
          process.env.CLOUDINARY_CLOUD_NAME &&
            process.env.CLOUDINARY_API_KEY &&
            process.env.CLOUDINARY_API_SECRET
        ),
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to load admin console.' });
    }
  });

  app.post('/api/admin/sync-catalog', requireAdmin, async (req: AdminRequest, res) => {
    try {
      const result = await seedDefaultCatalog(req.adminActor!);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Sync failed.' });
    }
  });

  app.post('/api/admin/orders/release-expired', requireAdmin, async (req: AdminRequest, res) => {
    try {
      const result = await releaseExpiredReservations(req.adminActor!);
      res.json(result);
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to release expired holds.',
      });
    }
  });

  app.post('/api/admin/products', requireAdmin, async (req: AdminRequest, res) => {
    try {
      const isNew = Boolean(req.body?.isNew);
      const { product, restockedSizes } = await saveProductAdmin(req.body, isNew, req.adminActor!);

      let pushDispatch = { sent: 0, failed: 0, configured: false };
      if (restockedSizes.length > 0 && product.active) {
        const settings = await getStoreSettings();
        const subs = await listPushSubscriptions({ topic: 'RESTOCK', productId: product.id });
        if (subs.length > 0) {
          const pitch = buildRestockPitch({
            productName: product.name,
            size: restockedSizes[0],
            promoCode: settings.vipPromoCode,
            discountPercent: settings.vipDiscountPercent,
          });
          const batchResult = await dispatchWebPushBatch(subs, {
            title: pitch.title,
            body: pitch.body,
            url: '/#shop',
            tag: `restock-${product.id}`,
          });
          if (batchResult.expiredEndpoints.length > 0) {
            await deleteExpiredPushEndpoints(batchResult.expiredEndpoints);
          }
          pushDispatch = {
            sent: batchResult.sent,
            failed: batchResult.failed,
            configured: batchResult.configured,
          };
        }
      }

      res.json({ product, restockedSizes, pushDispatch });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Unable to save product.' });
    }
  });

  app.delete('/api/admin/products/:id', requireAdmin, async (req: AdminRequest, res) => {
    try {
      await deleteProductAdmin(String(req.params.id), req.adminActor!);
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Delete failed.' });
    }
  });

  app.patch('/api/admin/orders/:id', requireAdmin, async (req: AdminRequest, res) => {
    try {
      const updated = await updateOrderStatusAdmin(
        {
          orderId: String(req.params.id),
          nextStatus: req.body.nextStatus,
          courierName: req.body.courierName,
          trackingId: req.body.trackingId,
        },
        req.adminActor!
      );
      res.json({ order: updated });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Order update failed.' });
    }
  });

  app.put('/api/admin/settings', requireAdmin, async (req: AdminRequest, res) => {
    try {
      const settings = await updateStoreSettingsAdmin(req.body, req.adminActor!);
      res.json({ settings });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Settings update failed.' });
    }
  });

  app.post('/api/admin/team', requireAdmin, async (req: AdminRequest, res) => {
    try {
      await addAdminEmail(String(req.body?.email ?? ''), req.adminActor!);
      res.status(201).json({ ok: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to add admin.';
      res.status(msg.includes('Owner') ? 403 : 400).json({ error: msg });
    }
  });

  app.delete('/api/admin/team/:email', requireAdmin, async (req: AdminRequest, res) => {
    try {
      await removeAdminEmail(decodeURIComponent(String(req.params.email)), req.adminActor!);
      res.json({ ok: true });
    } catch (err) {
      res.status(403).json({ error: err instanceof Error ? err.message : 'Failed to remove admin.' });
    }
  });

  app.patch('/api/admin/leads/:id', requireAdmin, async (req: AdminRequest, res) => {
    try {
      await updateCartLeadStatusAdmin(
        String(req.params.id),
        req.body.status,
        req.adminActor!
      );
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Update failed.' });
    }
  });

  app.patch('/api/admin/restock-alerts/:id', requireAdmin, async (req: AdminRequest, res) => {
    try {
      await updateRestockAlertStatusAdmin(
        String(req.params.id),
        req.body.status,
        req.adminActor!
      );
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Update failed.' });
    }
  });

  // Cloudinary Direct Image Upload Signature
  app.post('/api/admin/cloudinary-signature', requireAdmin, (_req: AdminRequest, res) => {
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim() || '';
    const apiKey = process.env.CLOUDINARY_API_KEY?.trim() || '';
    const apiSecret = process.env.CLOUDINARY_API_SECRET?.trim() || '';

    if (!cloudName || !apiKey || !apiSecret) {
      res.status(400).json({
        configured: false,
        error:
          'Cloudinary env vars (CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET) are not configured yet.',
      });
      return;
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const folder = 'saucy-culture/products';
    const toSign = `folder=${folder}&timestamp=${timestamp}${apiSecret}`;
    const signature = createHash('sha1').update(toSign).digest('hex');

    res.json({
      configured: true,
      cloudName,
      apiKey,
      timestamp,
      folder,
      signature,
    });
  });

  // Background Browser Web Push Blast
  app.post('/api/admin/push/blast', requireAdmin, async (req: AdminRequest, res) => {
    try {
      const topic = (req.body?.topic as 'CART_ABANDON' | 'RESTOCK' | 'ALL') || 'ALL';
      const title = String(req.body?.title || 'SAUCY CULTURE DROP ALERT').slice(0, 90);
      const body = String(
        req.body?.body || 'Limited sizes are moving fast — tap to lock your fit!'
      ).slice(0, 220);
      const url = String(req.body?.url || '/#shop').slice(0, 200);

      const subs = await listPushSubscriptions({ topic });
      const result = await dispatchWebPushBatch(subs, { title, body, url, tag: `blast-${topic}` });
      if (result.expiredEndpoints.length > 0) {
        await deleteExpiredPushEndpoints(result.expiredEndpoints);
      }

      await recordPushBlastAudit(req.adminActor!, {
        topic,
        title,
        sent: result.sent,
        failed: result.failed,
      });

      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Push blast failed.' });
    }
  });

  // Tamper-Evident Audit Log Endpoints
  app.get('/api/admin/audit-logs', requireAdmin, async (_req: AdminRequest, res) => {
    try {
      const data = await getAuditLogsWithVerification();
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Unable to read audit logs.' });
    }
  });

  app.delete('/api/admin/audit-logs', requireAdmin, async (req: AdminRequest, res) => {
    try {
      const mode = req.query.mode === 'CLEAR_ALL' ? 'CLEAR_ALL' : 'KEEP_RECENT';
      const result = await pruneAuditLogsOwnerOnly(req.adminActor!, mode);
      res.json(result);
    } catch (err) {
      res.status(403).json({ error: err instanceof Error ? err.message : 'Forbidden.' });
    }
  });

  return app;
}
