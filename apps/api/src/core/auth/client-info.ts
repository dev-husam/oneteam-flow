import type { Request } from 'express';
import { AppError } from '../../common/errors/app-error.js';

export type ClientTypeName = 'WEB' | 'IOS' | 'ANDROID';

export interface ClientInfo {
  clientType: ClientTypeName;
  ip?: string;
  userAgent?: string;
  deviceName?: string;
}

const CLIENT_TYPES: Record<string, ClientTypeName> = { web: 'WEB', ios: 'IOS', android: 'ANDROID' };

/** x-client-type is mandatory on login/refresh: it decides cookie (web) versus body (native) token delivery. */
export function readClientInfo(req: Request): ClientInfo {
  const raw = req.header('x-client-type')?.toLowerCase();
  const clientType = raw ? CLIENT_TYPES[raw] : undefined;
  if (!clientType) {
    throw new AppError('VALIDATION_FAILED', { fields: [{ field: 'x-client-type', rules: ['isIn'] }] });
  }
  return {
    clientType,
    ip: req.ip,
    userAgent: req.header('user-agent')?.slice(0, 255),
    deviceName: req.header('x-device-name')?.slice(0, 120),
  };
}
