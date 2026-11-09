
-- CreateTable
CREATE TABLE `feature_flags` (
    `key` VARCHAR(60) NOT NULL,
    `enabled` BOOLEAN NOT NULL,
    `updated_by_user_id` CHAR(36) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `organization_feature_overrides` (
    `organization_id` CHAR(36) NOT NULL,
    `flag_key` VARCHAR(60) NOT NULL,
    `enabled` BOOLEAN NOT NULL,
    `updated_by_user_id` CHAR(36) NULL,
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`organization_id`, `flag_key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `platform_settings` (
    `key` VARCHAR(60) NOT NULL,
    `value` JSON NOT NULL,
    `updated_by_user_id` CHAR(36) NULL,
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `platform_assets` (
    `key` VARCHAR(40) NOT NULL,
    `mime_type` VARCHAR(40) NOT NULL,
    `data` LONGBLOB NOT NULL,
    `sha256` CHAR(64) NOT NULL,
    `updated_by_user_id` CHAR(36) NULL,
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `email_templates` (
    `template_key` VARCHAR(40) NOT NULL,
    `locale` VARCHAR(8) NOT NULL,
    `subject` VARCHAR(200) NOT NULL,
    `body` TEXT NOT NULL,
    `action_label` VARCHAR(60) NOT NULL DEFAULT '',
    `updated_by_user_id` CHAR(36) NULL,
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`template_key`, `locale`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `organization_feature_overrides` ADD CONSTRAINT `organization_feature_overrides_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `organization_feature_overrides` ADD CONSTRAINT `organization_feature_overrides_flag_key_fkey` FOREIGN KEY (`flag_key`) REFERENCES `feature_flags`(`key`) ON DELETE CASCADE ON UPDATE CASCADE;

