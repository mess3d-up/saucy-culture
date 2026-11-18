import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import type { Request } from 'express';
import firebaseConfig from '../../firebase-applet-config.json';
import { OWNER_EMAIL } from '../utils/audit';

let initialized = false;

function getFirebaseAdminAuth() {
  if (!initialized) {
    if (getApps().length === 0) {
      initializeApp({
        projectId: firebaseConfig.projectId,
      });
    }
    initialized = true;
  }
  return getAuth();
}

export interface VerifiedAdminIdentity {
  uid: string;
  email: string;
  emailVerified: boolean;
  role: 'OWNER' | 'ADMIN';
  ipAddress: string;
}

export function extractRequestIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim().length > 0) {
    return forwarded.split(',')[0].trim().slice(0, 64);
  }
  return (req.ip || req.socket.remoteAddress || 'unknown').slice(0, 64);
}

/**
 * Verifies a Firebase Google ID Token from Authorization: Bearer <token>.
 * Uses Firebase's public JWKS keys against the project ID from firebase-applet-config.json.
 */
export async function verifyBearerToken(
  req: Request
): Promise<{ uid: string; email: string; emailVerified: boolean }> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Missing Authorization Bearer token.');
  }
  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) {
    throw new Error('Empty Bearer token.');
  }

  const decoded = await getFirebaseAdminAuth().verifyIdToken(token, false);
  const email = (decoded.email ?? '').trim().toLowerCase();
  const emailVerified = Boolean(decoded.email_verified);

  if (!email || !emailVerified) {
    throw new Error('Verified Google email is required for admin access.');
  }

  return {
    uid: decoded.uid,
    email,
    emailVerified,
  };
}

export function isOwnerEmail(email: string): boolean {
  return email.trim().toLowerCase() === OWNER_EMAIL;
}
