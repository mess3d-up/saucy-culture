import { createHash } from 'node:crypto';
import type { AuditLogEntry, AuditVerificationResult } from '../types/store';

export const GENESIS_AUDIT_HASH = '0'.repeat(64);
export const OWNER_EMAIL = 'spiritofhinduism@gmail.com';

export interface AuditHashInput {
  seq: number;
  actorEmail: string;
  actorRole: 'OWNER' | 'ADMIN';
  action: string;
  entityType: string;
  entityId: string;
  detailsJson: string;
  prevHash: string;
  createdAt: string;
}

/**
 * Computes a deterministic SHA-256 hash linking this entry to the previous
 * entry's hash, making silent row modification or deletion mathematically detectable.
 */
export function computeAuditEntryHash(input: AuditHashInput): string {
  const canonical = [
    String(input.seq),
    input.actorEmail.trim().toLowerCase(),
    input.actorRole,
    input.action.trim(),
    input.entityType.trim(),
    input.entityId.trim(),
    input.detailsJson,
    input.prevHash,
    input.createdAt,
  ].join('|');

  return createHash('sha256').update(canonical).digest('hex');
}

export function createChainedAuditEntry(params: {
  id: string;
  prevEntry?: Pick<AuditLogEntry, 'seq' | 'entryHash'> | null;
  actorEmail: string;
  actorRole: 'OWNER' | 'ADMIN';
  action: string;
  entityType: string;
  entityId: string;
  details: unknown;
  ipAddress?: string;
  createdAt?: string;
}): AuditLogEntry {
  const seq = (params.prevEntry?.seq ?? 0) + 1;
  const prevHash = params.prevEntry?.entryHash ?? GENESIS_AUDIT_HASH;
  const createdAt = params.createdAt ?? new Date().toISOString();
  const actorEmail = params.actorEmail.trim().toLowerCase();
  const detailsJson = JSON.stringify(params.details ?? {});

  const entryHash = computeAuditEntryHash({
    seq,
    actorEmail,
    actorRole: params.actorRole,
    action: params.action,
    entityType: params.entityType,
    entityId: params.entityId,
    detailsJson,
    prevHash,
    createdAt,
  });

  return {
    id: params.id,
    seq,
    actorEmail,
    actorRole: params.actorRole,
    action: params.action,
    entityType: params.entityType,
    entityId: params.entityId,
    detailsJson,
    ipAddress: (params.ipAddress ?? 'unknown').slice(0, 64),
    prevHash,
    entryHash,
    createdAt,
  };
}

/**
 * Verifies an ordered (ascending seq) audit log chain.
 * Supports pruned chains where the earliest remaining entry starts from a checkpoint hash.
 */
export function verifyAuditChain(entries: AuditLogEntry[]): AuditVerificationResult {
  if (entries.length === 0) {
    return { valid: true, totalEntries: 0, brokenAtSeq: null };
  }

  const ordered = [...entries].sort((a, b) => a.seq - b.seq);

  for (let i = 0; i < ordered.length; i++) {
    const current = ordered[i];
    if (i === 0 && current.seq === 1 && current.prevHash !== GENESIS_AUDIT_HASH) {
      return {
        valid: false,
        totalEntries: ordered.length,
        brokenAtSeq: current.seq,
        reason: 'Genesis entry does not anchor to zero hash.',
      };
    }

    if (i > 0) {
      const prev = ordered[i - 1];
      if (current.seq !== prev.seq + 1) {
        return {
          valid: false,
          totalEntries: ordered.length,
          brokenAtSeq: current.seq,
          reason: `Sequence gap between #${prev.seq} and #${current.seq}.`,
        };
      }
      if (current.prevHash !== prev.entryHash) {
        return {
          valid: false,
          totalEntries: ordered.length,
          brokenAtSeq: current.seq,
          reason: `Previous hash mismatch at #${current.seq}.`,
        };
      }
    }

    const expected = computeAuditEntryHash({
      seq: current.seq,
      actorEmail: current.actorEmail,
      actorRole: current.actorRole,
      action: current.action,
      entityType: current.entityType,
      entityId: current.entityId,
      detailsJson: current.detailsJson,
      prevHash: current.prevHash,
      createdAt: current.createdAt,
    });

    if (current.entryHash !== expected) {
      return {
        valid: false,
        totalEntries: ordered.length,
        brokenAtSeq: current.seq,
        reason: `Entry payload hash mismatch at #${current.seq}.`,
      };
    }
  }

  return { valid: true, totalEntries: ordered.length, brokenAtSeq: null };
}

export function canManageAuditLogs(email: string | null | undefined): boolean {
  return Boolean(email && email.trim().toLowerCase() === OWNER_EMAIL);
}
