# Saucy Culture Security Specification

## 1. Architecture & Persistence Invariants
1. **Mandatory Production PostgreSQL (`src/db/index.ts`)**: When `NODE_ENV=production`, `VERCEL=1`, or `VERCEL_ENV` is set, `DATABASE_URL` is strictly mandatory. Startup (`server.ts` / `api/index.ts`), `/api/health`, and every repository call fail fast if PostgreSQL is unavailable—never silently falling back to ephemeral local JSON storage.
2. **Atomic Inventory Reservation & Release (`src/server/repository.ts`)**:
   - Duplicate `(productId, size)` entries in a single cart payload are aggregated and capped before validation.
   - Checkout executes inside a PostgreSQL transaction locking target product rows in deterministic ID order (`ORDER BY id ASC FOR UPDATE`), verifies stock, deducts reserved units immediately (`>= 0` guard), and sets a 72-hour `reservedUntil` window on unpaid holds.
   - Expired unpaid holds (`PAYMENT_ON_HOLD` / `UPI_PENDING_VERIFY` past `reservedUntil`) are opportunistically released during checkout and manually via `POST /api/admin/orders/release-expired`, restoring inventory atomically.
   - Admin order cancellation restores stock (`stockDeducted = false`); order confirmation clears `reservedUntil` without double-deducting.
3. **High-Entropy Order Tracking & Timing-Safe Verification**:
   - Order IDs (`SC-IN-XXXXXXXXXX`, 50 bits) and Tracking Keys (`XXXX-XXXX-XXXX`, 60 bits) are generated strictly server-side using `node:crypto.randomBytes`.
   - `/api/track` verifies `trackingToken` using `crypto.timingSafeEqual`, omits phone PII from public tracking responses, and returns a single generic `404` error (`Order ID or tracking key is invalid.`) whether the order is missing or the key is wrong.
4. **Public API Abuse & SSRF Protection (`src/server/rateLimit.ts`, `src/utils/commerce.ts`)**:
   - Global `/api` burst limiting (`150/min`) plus endpoint-specific PostgreSQL-backed IP rate limits on `/api/orders`, `/api/track`, `/api/circle`, `/api/leads`, `/api/restock-alerts`, and `/api/push/subscribe`.
   - JSON request body size capped at `64kb` and hidden honeypot fields checked on public write routes.
   - Web Push subscription endpoints validated by `validatePushEndpointUrl()` (HTTPS only, no credentials/ports, no localhost or IP literals, strict browser push provider host allowlist).
5. **Firebase Auth & Tamper-Evident Audit Chain (`src/server/auth.ts`, `src/utils/audit.ts`)**:
   - All `/api/admin/*` endpoints verify Firebase Google ID tokens (`email_verified === true`) against the `admins` table.
   - Team management and audit-log pruning are restricted strictly to the immutable Store Owner (`spiritofhinduism@gmail.com`).
   - Every admin mutation appends a SHA-256 hash-chained entry to `admin_audit_logs`.
   - `firestore.rules` is locked to complete default-deny (`allow read, write: if false;`) because Firebase is used only for Auth.
