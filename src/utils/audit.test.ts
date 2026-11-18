import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canManageAuditLogs,
  createChainedAuditEntry,
  OWNER_EMAIL,
  verifyAuditChain,
} from './audit';

test('audit chain links hashes sequentially and verifies cleanly', () => {
  const e1 = createChainedAuditEntry({
    id: 'a1',
    prevEntry: null,
    actorEmail: 'client@saucy.in',
    actorRole: 'ADMIN',
    action: 'PRODUCT_CREATE',
    entityType: 'product',
    entityId: 'hoodie-1',
    details: { priceINR: 2699 },
    createdAt: '2026-11-17T10:00:00.000Z',
  });
  const e2 = createChainedAuditEntry({
    id: 'a2',
    prevEntry: e1,
    actorEmail: OWNER_EMAIL,
    actorRole: 'OWNER',
    action: 'ORDER_UPDATE',
    entityType: 'order',
    entityId: 'SC-IN-100001',
    details: { status: 'DISPATCHED' },
    createdAt: '2026-11-17T10:05:00.000Z',
  });

  const verification = verifyAuditChain([e2, e1]);
  assert.equal(verification.valid, true);
  assert.equal(verification.totalEntries, 2);
  assert.equal(verification.brokenAtSeq, null);
});

test('tampering with an audit entry details or deleting a middle row breaks verification', () => {
  const e1 = createChainedAuditEntry({
    id: 'a1',
    prevEntry: null,
    actorEmail: 'client@saucy.in',
    actorRole: 'ADMIN',
    action: 'PRODUCT_UPDATE',
    entityType: 'product',
    entityId: 'tee-1',
    details: { priceINR: 1399 },
    createdAt: '2026-11-17T10:00:00.000Z',
  });
  const e2 = createChainedAuditEntry({
    id: 'a2',
    prevEntry: e1,
    actorEmail: 'client@saucy.in',
    actorRole: 'ADMIN',
    action: 'PRODUCT_DELETE',
    entityType: 'product',
    entityId: 'tee-2',
    details: { name: 'Deleted Drop' },
    createdAt: '2026-11-17T10:02:00.000Z',
  });
  const e3 = createChainedAuditEntry({
    id: 'a3',
    prevEntry: e2,
    actorEmail: OWNER_EMAIL,
    actorRole: 'OWNER',
    action: 'SETTINGS_UPDATE',
    entityType: 'settings',
    entityId: 'main',
    details: { upiId: 'saucy@okaxis' },
    createdAt: '2026-11-17T10:03:00.000Z',
  });

  // Tamper payload
  const tampered = { ...e2, detailsJson: JSON.stringify({ name: 'Altered' }) };
  const tamperCheck = verifyAuditChain([e1, tampered, e3]);
  assert.equal(tamperCheck.valid, false);
  assert.equal(tamperCheck.brokenAtSeq, 2);

  // Silent row deletion gap
  const gapCheck = verifyAuditChain([e1, e3]);
  assert.equal(gapCheck.valid, false);
  assert.equal(gapCheck.brokenAtSeq, 3);
});

test('only owner email is permitted to prune or manage audit logs', () => {
  assert.equal(canManageAuditLogs('SpiritOfHinduism@gmail.com'), true);
  assert.equal(canManageAuditLogs('client@gmail.com'), false);
  assert.equal(canManageAuditLogs(null), false);
});
