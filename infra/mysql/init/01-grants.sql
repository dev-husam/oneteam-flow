-- The app user may create/drop its own databases (pt_dev, pt_test, Prisma shadow DBs, restore-test scratch DBs).
CREATE DATABASE IF NOT EXISTS pt_test CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE DATABASE IF NOT EXISTS pt_shadow CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
GRANT ALL PRIVILEGES ON `pt\_%`.* TO 'pt'@'%';
FLUSH PRIVILEGES;
