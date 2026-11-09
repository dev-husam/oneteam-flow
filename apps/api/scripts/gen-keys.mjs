// Prints an ES256 key pair as .env lines (PEM with \n escapes). Run: pnpm --filter @pt/api gen:keys
import { generateKeyPairSync } from 'node:crypto';

const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const oneLine = (pem) => pem.trim().replace(/\n/g, '\\n');
console.log(`JWT_PRIVATE_KEY="${oneLine(privateKey.export({ type: 'pkcs8', format: 'pem' }))}"`);
console.log(`JWT_PUBLIC_KEY="${oneLine(publicKey.export({ type: 'spki', format: 'pem' }))}"`);
