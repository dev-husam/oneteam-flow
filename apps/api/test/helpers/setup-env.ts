// Runs before every integration test file. CI provides real values; locally the docker compose defaults apply.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ??= 'mysql://pt:pt_dev_password@localhost:3307/pt_test';
process.env.REDIS_URL ??= 'redis://localhost:6380/1';
process.env.WEB_BASE_URL ??= 'http://localhost:3000';
process.env.CORS_ORIGINS ??= 'http://localhost:3000';
process.env.MAIL_TRANSPORT = 'memory';
process.env.CONFIG_CACHE_SECONDS = '0';
process.env.PUSH_TRANSPORT = 'memory';
process.env.STORAGE_DRIVER = 'local';
process.env.STORAGE_LOCAL_DIR = `${process.env.TMPDIR ?? '/tmp'}/pt-test-uploads`;
process.env.STORAGE_SIGNING_SECRET = 'test-signing-secret';
process.env.API_PUBLIC_URL = 'http://localhost:3001';
process.env.LOG_LEVEL = 'silent';
process.env.RATE_LIMIT_ENABLED ??= 'false';
process.env.SWAGGER_ENABLED = 'true';
process.env.HEALTH_TOKEN ??= 'test-health-token';

// Safety net: tests delete data, so they may only ever touch a database whose name ends in _test.
const dbName = new URL(process.env.DATABASE_URL).pathname.slice(1);
if (!dbName.endsWith('_test')) {
  throw new Error(`Refusing to run integration tests against database "${dbName}" (name must end with _test)`);
}
