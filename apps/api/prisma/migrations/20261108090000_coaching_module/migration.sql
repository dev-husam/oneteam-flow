
-- CreateTable
CREATE TABLE `coach_sessions` (
    `id` CHAR(36) NOT NULL,
    `organization_id` CHAR(36) NOT NULL,
    `coach_membership_id` CHAR(36) NOT NULL,
    `client_membership_id` CHAR(36) NOT NULL,
    `starts_at` DATETIME(3) NOT NULL,
    `duration_minutes` INTEGER NOT NULL,
    `location` VARCHAR(255) NULL,
    `agenda` VARCHAR(1000) NULL,
    `status` ENUM('PLANNED', 'HELD', 'CANCELLED') NOT NULL DEFAULT 'PLANNED',
    `cancel_reason` VARCHAR(300) NULL,
    `reminder_day_sent_at` DATETIME(3) NULL,
    `reminder_soon_sent_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `coach_sessions_organization_id_client_membership_id_starts_a_idx`(`organization_id`, `client_membership_id`, `starts_at`),
    INDEX `coach_sessions_organization_id_coach_membership_id_starts_at_idx`(`organization_id`, `coach_membership_id`, `starts_at`),
    INDEX `coach_sessions_organization_id_status_starts_at_idx`(`organization_id`, `status`, `starts_at`),
    UNIQUE INDEX `coach_sessions_organization_id_id_key`(`organization_id`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `coach_notes` (
    `id` CHAR(36) NOT NULL,
    `organization_id` CHAR(36) NOT NULL,
    `client_membership_id` CHAR(36) NOT NULL,
    `author_membership_id` CHAR(36) NOT NULL,
    `session_id` CHAR(36) NULL,
    `visibility` ENUM('PRIVATE', 'SHARED') NOT NULL,
    `body` TEXT NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `coach_notes_organization_id_client_membership_id_created_at_idx`(`organization_id`, `client_membership_id`, `created_at`),
    INDEX `coach_notes_organization_id_session_id_idx`(`organization_id`, `session_id`),
    UNIQUE INDEX `coach_notes_organization_id_id_key`(`organization_id`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `coach_assessment_templates` (
    `id` CHAR(36) NOT NULL,
    `organization_id` CHAR(36) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `description` VARCHAR(500) NULL,
    `questions` JSON NOT NULL,
    `created_by_membership_id` CHAR(36) NOT NULL,
    `archived_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `coach_assessment_templates_organization_id_archived_at_idx`(`organization_id`, `archived_at`),
    UNIQUE INDEX `coach_assessment_templates_organization_id_id_key`(`organization_id`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `coach_assessments` (
    `id` CHAR(36) NOT NULL,
    `organization_id` CHAR(36) NOT NULL,
    `template_id` CHAR(36) NOT NULL,
    `client_membership_id` CHAR(36) NOT NULL,
    `requested_by_membership_id` CHAR(36) NOT NULL,
    `title` VARCHAR(120) NOT NULL,
    `questions` JSON NOT NULL,
    `answers` JSON NULL,
    `status` ENUM('REQUESTED', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'REQUESTED',
    `cadence_days` INTEGER NULL,
    `due_at` DATETIME(3) NULL,
    `requested_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `completed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `coach_assessments_organization_id_client_membership_id_statu_idx`(`organization_id`, `client_membership_id`, `status`, `requested_at`),
    INDEX `coach_assessments_organization_id_template_id_idx`(`organization_id`, `template_id`),
    UNIQUE INDEX `coach_assessments_organization_id_id_key`(`organization_id`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `coach_resources` (
    `id` CHAR(36) NOT NULL,
    `organization_id` CHAR(36) NOT NULL,
    `created_by_membership_id` CHAR(36) NOT NULL,
    `client_membership_id` CHAR(36) NULL,
    `title` VARCHAR(160) NOT NULL,
    `description` VARCHAR(500) NULL,
    `url` VARCHAR(500) NULL,
    `file_id` CHAR(36) NULL,
    `archived_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `coach_resources_file_id_key`(`file_id`),
    INDEX `coach_resources_organization_id_created_by_membership_id_arc_idx`(`organization_id`, `created_by_membership_id`, `archived_at`),
    INDEX `coach_resources_organization_id_client_membership_id_archive_idx`(`organization_id`, `client_membership_id`, `archived_at`),
    UNIQUE INDEX `coach_resources_organization_id_id_key`(`organization_id`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `coach_sessions` ADD CONSTRAINT `coach_sessions_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `coach_sessions` ADD CONSTRAINT `coach_sessions_organization_id_coach_membership_id_fkey` FOREIGN KEY (`organization_id`, `coach_membership_id`) REFERENCES `memberships`(`organization_id`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `coach_sessions` ADD CONSTRAINT `coach_sessions_organization_id_client_membership_id_fkey` FOREIGN KEY (`organization_id`, `client_membership_id`) REFERENCES `memberships`(`organization_id`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `coach_notes` ADD CONSTRAINT `coach_notes_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `coach_notes` ADD CONSTRAINT `coach_notes_organization_id_client_membership_id_fkey` FOREIGN KEY (`organization_id`, `client_membership_id`) REFERENCES `memberships`(`organization_id`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `coach_notes` ADD CONSTRAINT `coach_notes_organization_id_author_membership_id_fkey` FOREIGN KEY (`organization_id`, `author_membership_id`) REFERENCES `memberships`(`organization_id`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `coach_notes` ADD CONSTRAINT `coach_notes_organization_id_session_id_fkey` FOREIGN KEY (`organization_id`, `session_id`) REFERENCES `coach_sessions`(`organization_id`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `coach_assessment_templates` ADD CONSTRAINT `coach_assessment_templates_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `coach_assessment_templates` ADD CONSTRAINT `coach_assessment_templates_organization_id_created_by_membe_fkey` FOREIGN KEY (`organization_id`, `created_by_membership_id`) REFERENCES `memberships`(`organization_id`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `coach_assessments` ADD CONSTRAINT `coach_assessments_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `coach_assessments` ADD CONSTRAINT `coach_assessments_organization_id_template_id_fkey` FOREIGN KEY (`organization_id`, `template_id`) REFERENCES `coach_assessment_templates`(`organization_id`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `coach_assessments` ADD CONSTRAINT `coach_assessments_organization_id_client_membership_id_fkey` FOREIGN KEY (`organization_id`, `client_membership_id`) REFERENCES `memberships`(`organization_id`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `coach_assessments` ADD CONSTRAINT `coach_assessments_organization_id_requested_by_membership_i_fkey` FOREIGN KEY (`organization_id`, `requested_by_membership_id`) REFERENCES `memberships`(`organization_id`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `coach_resources` ADD CONSTRAINT `coach_resources_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `coach_resources` ADD CONSTRAINT `coach_resources_organization_id_created_by_membership_id_fkey` FOREIGN KEY (`organization_id`, `created_by_membership_id`) REFERENCES `memberships`(`organization_id`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `coach_resources` ADD CONSTRAINT `coach_resources_organization_id_client_membership_id_fkey` FOREIGN KEY (`organization_id`, `client_membership_id`) REFERENCES `memberships`(`organization_id`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `coach_resources` ADD CONSTRAINT `coach_resources_organization_id_file_id_fkey` FOREIGN KEY (`organization_id`, `file_id`) REFERENCES `files`(`organization_id`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

