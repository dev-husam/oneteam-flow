import { Inject, Injectable, Logger } from '@nestjs/common';
import { SignJWT, jwtVerify, importPKCS8, importSPKI, generateKeyPair, errors, type CryptoKey } from 'jose';
import { APP_CONFIG, type AppConfig } from '../../config/env.js';
import { AppError } from '../../common/errors/app-error.js';

const ALG = 'ES256';
const ISSUER = 'pt-api';
const AUDIENCE = 'pt-clients';
/** Separate audience: a pending-MFA token can never be used as an access token, and vice versa. */
const MFA_AUDIENCE = 'pt-mfa';
const MFA_TOKEN_TTL = '5m';

export interface AccessClaims {
  /** User id. No organization, role or permission claims by design (see docs/03). */
  sub: string;
  /** Session id: lets the guard reject tokens of revoked sessions immediately. */
  sid: string;
}

/** Claims of a token that was just verified, including when it stops being valid (epoch seconds). */
export interface VerifiedAccess extends AccessClaims {
  exp: number;
}

const normalizePem = (pem: string) => pem.replace(/\\n/g, '\n');

@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);
  private keys?: Promise<{ privateKey: CryptoKey; publicKey: CryptoKey }>;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  private loadKeys() {
    this.keys ??= (async () => {
      const { JWT_PRIVATE_KEY, JWT_PUBLIC_KEY } = this.config;
      if (JWT_PRIVATE_KEY && JWT_PUBLIC_KEY) {
        return {
          privateKey: await importPKCS8(normalizePem(JWT_PRIVATE_KEY), ALG),
          publicKey: await importSPKI(normalizePem(JWT_PUBLIC_KEY), ALG),
        };
      }
      // env.ts rejects this in production; development and tests get an ephemeral pair.
      this.logger.warn('JWT keys not configured: using an ephemeral key pair (tokens die on restart)');
      return generateKeyPair(ALG, { extractable: false });
    })();
    return this.keys;
  }

  async signAccessToken(claims: AccessClaims): Promise<{ token: string; expiresIn: number }> {
    const { privateKey } = await this.loadKeys();
    const expiresIn = this.config.ACCESS_TOKEN_TTL_SECONDS;
    const token = await new SignJWT({ sid: claims.sid })
      .setProtectedHeader({ alg: ALG, kid: this.config.JWT_KEY_ID, typ: 'JWT' })
      .setSubject(claims.sub)
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(`${expiresIn}s`)
      .sign(privateKey);
    return { token, expiresIn };
  }

  async signMfaToken(userId: string): Promise<string> {
    const { privateKey } = await this.loadKeys();
    return new SignJWT({ purpose: 'mfa' })
      .setProtectedHeader({ alg: ALG, kid: this.config.JWT_KEY_ID, typ: 'JWT' })
      .setSubject(userId)
      .setIssuer(ISSUER)
      .setAudience(MFA_AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(MFA_TOKEN_TTL)
      .sign(privateKey);
  }

  async verifyMfaToken(token: string): Promise<string> {
    const { publicKey } = await this.loadKeys();
    try {
      const { payload } = await jwtVerify(token, publicKey, { algorithms: [ALG], issuer: ISSUER, audience: MFA_AUDIENCE });
      if (typeof payload.sub !== 'string' || payload.purpose !== 'mfa') throw new Error('bad claims');
      return payload.sub;
    } catch {
      throw new AppError('MFA_TOKEN_INVALID');
    }
  }

  async verifyAccessToken(token: string): Promise<VerifiedAccess> {
    const { publicKey } = await this.loadKeys();
    try {
      // The algorithm is pinned: tokens signed with any other alg (including "none") are rejected.
      const { payload } = await jwtVerify(token, publicKey, {
        algorithms: [ALG],
        issuer: ISSUER,
        audience: AUDIENCE,
      });
      if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string' || typeof payload.exp !== 'number') {
        throw new AppError('TOKEN_INVALID');
      }
      return { sub: payload.sub, sid: payload.sid, exp: payload.exp };
    } catch (err) {
      if (err instanceof AppError) throw err;
      if (err instanceof errors.JWTExpired) throw new AppError('TOKEN_EXPIRED');
      throw new AppError('TOKEN_INVALID');
    }
  }
}
