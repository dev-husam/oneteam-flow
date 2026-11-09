
-- CreateTable
CREATE TABLE `design_themes` (
    `key` VARCHAR(40) NOT NULL,
    `name` VARCHAR(60) NOT NULL,
    `description` VARCHAR(200) NOT NULL DEFAULT '',
    `built_in_key` VARCHAR(40) NULL,
    `definition` JSON NOT NULL,
    `updated_by_user_id` CHAR(36) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `organization_designs` (
    `organization_id` CHAR(36) NOT NULL,
    `theme_key` VARCHAR(40) NOT NULL,
    `updated_by_user_id` CHAR(36) NULL,
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `organization_designs_theme_key_idx`(`theme_key`),
    PRIMARY KEY (`organization_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `organization_designs` ADD CONSTRAINT `organization_designs_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `organization_designs` ADD CONSTRAINT `organization_designs_theme_key_fkey` FOREIGN KEY (`theme_key`) REFERENCES `design_themes`(`key`) ON DELETE RESTRICT ON UPDATE CASCADE;


-- The earlier three-colour theme setting is replaced by designs: drop it so the default design applies.
DELETE FROM `platform_settings` WHERE `key` = 'theme';
