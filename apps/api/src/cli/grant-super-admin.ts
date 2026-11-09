import '../config/load-env.js';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '../generated/prisma/client.js';
import { loadConfig } from '../config/env.js';

/**
 * Bootstrap for the very first platform administrator (there is no API to create one by design).
 *   node dist/cli/grant-super-admin.js someone@example.com
 * The account must exist, be active and have a verified e-mail. MFA enrollment is required at first use.
 */
const email = process.argv[2]?.trim().toLowerCase();
if (!email) {
  console.error('Usage: grant-super-admin <email>');
  process.exit(1);
}
const url = new URL(loadConfig().DATABASE_URL);
const prisma = new PrismaClient({
  adapter: new PrismaMariaDb({ host: url.hostname, port: Number(url.port || 3306), user: decodeURIComponent(url.username), password: decodeURIComponent(url.password), database: url.pathname.slice(1) }),
});
try {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.status !== 'ACTIVE' || !user.emailVerifiedAt) throw new Error('User not found, not active, or e-mail not verified');
  const role = await prisma.role.findUnique({ where: { scopeKey_key: { scopeKey: 'platform', key: 'super_admin' } } });
  if (!role) throw new Error('Platform roles missing: start the API once so the catalog is synchronized');
  await prisma.platformRoleAssignment.upsert({ where: { userId_roleId: { userId: user.id, roleId: role.id } }, create: { userId: user.id, roleId: role.id }, update: {} });
  await prisma.auditLog.create({ data: { action: 'platform.role_granted', actorType: 'SYSTEM', targetType: 'user', targetId: user.id, metadata: { roleKey: 'super_admin', via: 'cli' } } });
  console.log(`Granted super_admin to ${email}. They must enable two-factor authentication before using /admin.`);
} finally {
  await prisma.$disconnect();
}
