-- CreateTable
CREATE TABLE `message_blocks` (
    `blocker_membership_id` CHAR(36) NOT NULL,
    `blocked_membership_id` CHAR(36) NOT NULL,
    `organization_id` CHAR(36) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `message_blocks_organization_id_blocked_membership_id_idx`(`organization_id`, `blocked_membership_id`),
    PRIMARY KEY (`blocker_membership_id`, `blocked_membership_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `message_reports` (
    `id` CHAR(36) NOT NULL,
    `organization_id` CHAR(36) NOT NULL,
    `conversation_id` CHAR(36) NOT NULL,
    `message_id` CHAR(36) NOT NULL,
    `reporter_membership_id` CHAR(36) NOT NULL,
    `reported_membership_id` CHAR(36) NOT NULL,
    `reason` VARCHAR(20) NOT NULL,
    `note` VARCHAR(500) NULL,
    `snapshot_body` VARCHAR(4000) NOT NULL,
    `snapshot_attachments` JSON NULL,
    `status` VARCHAR(10) NOT NULL DEFAULT 'OPEN',
    `resolved_by_membership_id` CHAR(36) NULL,
    `resolved_at` DATETIME(3) NULL,
    `resolution_note` VARCHAR(500) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `message_reports_organization_id_status_created_at_idx`(`organization_id`, `status`, `created_at`),
    UNIQUE INDEX `message_reports_message_id_reporter_membership_id_key`(`message_id`, `reporter_membership_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `message_blocks` ADD CONSTRAINT `message_blocks_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `message_blocks` ADD CONSTRAINT `message_blocks_organization_id_blocker_membership_id_fkey` FOREIGN KEY (`organization_id`, `blocker_membership_id`) REFERENCES `memberships`(`organization_id`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `message_blocks` ADD CONSTRAINT `message_blocks_organization_id_blocked_membership_id_fkey` FOREIGN KEY (`organization_id`, `blocked_membership_id`) REFERENCES `memberships`(`organization_id`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `message_reports` ADD CONSTRAINT `message_reports_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `message_reports` ADD CONSTRAINT `message_reports_organization_id_conversation_id_fkey` FOREIGN KEY (`organization_id`, `conversation_id`) REFERENCES `conversations`(`organization_id`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `message_reports` ADD CONSTRAINT `message_reports_organization_id_message_id_fkey` FOREIGN KEY (`organization_id`, `message_id`) REFERENCES `messages`(`organization_id`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `message_reports` ADD CONSTRAINT `message_reports_organization_id_reporter_membership_id_fkey` FOREIGN KEY (`organization_id`, `reporter_membership_id`) REFERENCES `memberships`(`organization_id`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `message_reports` ADD CONSTRAINT `message_reports_organization_id_reported_membership_id_fkey` FOREIGN KEY (`organization_id`, `reported_membership_id`) REFERENCES `memberships`(`organization_id`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `message_reports` ADD CONSTRAINT `message_reports_organization_id_resolved_by_membership_id_fkey` FOREIGN KEY (`organization_id`, `resolved_by_membership_id`) REFERENCES `memberships`(`organization_id`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;
