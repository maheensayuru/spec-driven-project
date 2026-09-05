import { describe, it, expect } from 'vitest';
import { SessionService, SessionData } from '../../../src/modules/auth/session.service.js';

describe('SessionService & Argon2id Password Security', () => {
  it('should hash a password and verify it successfully with Argon2id', async () => {
    const password = 'CorrectHorseBatteryStaple123!';
    const hash = await SessionService.hashPassword(password);

    expect(hash).toBeDefined();
    expect(hash.startsWith('$argon2id$')).toBe(true);

    const isValid = await SessionService.verifyPassword(password, hash);
    expect(isValid).toBe(true);

    const isWrong = await SessionService.verifyPassword('WrongPassword123!', hash);
    expect(isWrong).toBe(false);
  });

  it('should encrypt and decrypt a session token without data loss', () => {
    const sessionData: SessionData = {
      userId: '11111111-1111-1111-1111-111111111111',
      organizationId: '22222222-2222-2222-2222-222222222222',
      role: 'admin',
      email: 'admin@acme.corp',
      createdAt: Date.now(),
    };

    const token = SessionService.encryptSession(sessionData);
    expect(token).toBeDefined();
    expect(token.split('.').length).toBe(3);

    const decrypted = SessionService.decryptSession(token);
    expect(decrypted).not.toBeNull();
    expect(decrypted?.userId).toBe(sessionData.userId);
    expect(decrypted?.organizationId).toBe(sessionData.organizationId);
    expect(decrypted?.role).toBe('admin');
    expect(decrypted?.email).toBe('admin@acme.corp');
  });

  it('should reject tampered or malformed session tokens', () => {
    const sessionData: SessionData = {
      userId: '11111111-1111-1111-1111-111111111111',
      organizationId: '22222222-2222-2222-2222-222222222222',
      role: 'owner',
      email: 'owner@acme.corp',
      createdAt: Date.now(),
    };

    const token = SessionService.encryptSession(sessionData);
    const tampered = token.slice(0, -5) + 'AAAAA';

    const result = SessionService.decryptSession(tampered);
    expect(result).toBeNull();

    expect(SessionService.decryptSession('invalid.token')).toBeNull();
    expect(SessionService.decryptSession('')).toBeNull();
  });
});
