import argon2 from 'argon2';
import crypto from 'node:crypto';
import { env } from '../../config/env.js';

export interface SessionData {
  userId: string;
  organizationId: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  email: string;
  createdAt: number;
}

export class SessionService {
  private static readonly ALGORITHM = 'aes-256-gcm';

  /**
   * Hashes a plaintext password using Argon2id with OWASP-recommended parameters.
   */
  static async hashPassword(password: string): Promise<string> {
    return argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 65536, // 64 MB
      timeCost: 3,
      parallelism: 4,
    });
  }

  /**
   * Verifies a plaintext password against a stored Argon2id hash.
   */
  static async verifyPassword(password: string, hash: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }

  /**
   * Encrypts and signs session data into an opaque HTTP-only cookie token.
   */
  static encryptSession(data: SessionData): string {
    const key = crypto.createHash('sha256').update(env.SESSION_SECRET).digest();
    const iv = crypto.randomBytes(12); // 96 bits for GCM
    const cipher = crypto.createCipheriv(this.ALGORITHM, key, iv);

    const payload = JSON.stringify(data);
    const encrypted = Buffer.concat([cipher.update(payload, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    // Format: iv:authTag:ciphertext (base64)
    return [
      iv.toString('base64url'),
      authTag.toString('base64url'),
      encrypted.toString('base64url'),
    ].join('.');
  }

  /**
   * Decrypts and verifies an opaque session token. Returns null if invalid or tampered.
   */
  static decryptSession(token: string): SessionData | null {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) {
        return null;
      }

      const [ivB64, authTagB64, cipherB64] = parts;
      if (!ivB64 || !authTagB64 || !cipherB64) {
        return null;
      }

      const iv = Buffer.from(ivB64, 'base64url');
      const authTag = Buffer.from(authTagB64, 'base64url');
      const ciphertext = Buffer.from(cipherB64, 'base64url');

      const key = crypto.createHash('sha256').update(env.SESSION_SECRET).digest();
      const decipher = crypto.createDecipheriv(this.ALGORITHM, key, iv);
      decipher.setAuthTag(authTag);

      const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
      const parsed = JSON.parse(decrypted) as unknown;

      if (
        parsed &&
        typeof parsed === 'object' &&
        'userId' in parsed &&
        'organizationId' in parsed &&
        'role' in parsed &&
        'email' in parsed &&
        'createdAt' in parsed &&
        typeof (parsed as Record<string, unknown>).userId === 'string'
      ) {
        return parsed as SessionData;
      }

      return null;
    } catch {
      return null;
    }
  }
}
