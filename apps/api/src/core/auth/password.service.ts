import { Injectable } from '@nestjs/common';
import argon2 from 'argon2';
import { checkPassword } from '@pt/domain';
import { AppError } from '../../common/errors/app-error.js';

// OWASP argon2id baseline: 19 MiB, 2 iterations, 1 lane.
const OPTIONS = { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

@Injectable()
export class PasswordService {
  /** Hash computed once at startup and verified against when the account does not exist (timing equalizer). */
  private readonly dummyHash = argon2.hash('timing-equalizer-password', OPTIONS);

  hash(password: string): Promise<string> {
    return argon2.hash(password, OPTIONS);
  }

  async verify(hash: string | null, password: string): Promise<boolean> {
    const target = hash ?? (await this.dummyHash);
    try {
      const ok = await argon2.verify(target, password);
      return ok && hash !== null;
    } catch {
      return false;
    }
  }

  assertAcceptable(password: string, email?: string): void {
    const violations = checkPassword(password, email);
    if (violations.length > 0) throw new AppError('WEAK_PASSWORD', { violations });
  }
}
