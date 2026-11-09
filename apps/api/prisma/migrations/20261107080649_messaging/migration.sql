-- CreateTable
CREATE TABLE `conversations` (
    `id` CHAR(36) NOT NULL,
    `organization_id` CHAR(36) NOT NULL,
    `type` VARCHAR(10) NOT NULL DEFAULT 'DIRECT',
    `direct_key` VARCHAR(73) NULL,
    `created_by_membership_id` CHAR(36) NOT NULL,
    `last_message_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `conversations_organization_id_last_message_at_idx`(`organization_id`, `last_message_at`),
    UNIQUE INDEX `conversations_organization_id_id_key`(`organization_id`, `id`),
    UNIQUE INDEX `conversations_organization_id_direct_key_key`(`organization_id`, `direct_key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `conversation_participants` (
    `conversation_id` CHAR(36) NOT NULL,
    `membership_id` CHAR(36) NOT NULL,
    `organization_id` CHAR(36) NOT NULL,
    `last_read_message_id` CHAR(36) NULL,
    `last_read_at` DATETIME(3) NULL,
    `muted_until` DATETIME(3) NULL,
    `joined_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `conversation_participants_organization_id_membership_id_idx`(`organization_id`, `membership_id`),
    PRIMARY KEY (`conversation_id`, `membership_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `messages` (
    `id` CHAR(36) NOT NULL,
    `organization_id` CHAR(36) NOT NULL,
    `conversation_id` CHAR(36) NOT NULL,
    `sender_membership_id` CHAR(36) NOT NULL,
    `kind` VARCHAR(10) NOT NULL DEFAULT 'TEXT',
    `body` VARCHAR(4000) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `deleted_at` DATETIME(3) NULL,

    INDEX `messages_organization_id_conversation_id_id_idx`(`organization_id`, `conversation_id`, `id`),
    UNIQUE INDEX `messages_organization_id_id_key`(`organization_id`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `message_attachments` (
    `message_id` CHAR(36) NOT NULL,
    `file_id` CHAR(36) NOT NULL,
    `organization_id` CHAR(36) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `message_attachments_organization_id_file_id_idx`(`organization_id`, `file_id`),
    PRIMARY KEY (`message_id`, `file_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `conversations` ADD CONSTRAINT `conversations_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `conversations` ADD CONSTRAINT `conversations_organization_id_created_by_membership_id_fkey` FOREIGN KEY (`organization_id`, `created_by_membership_id`) REFERENCES `memberships`(`organization_id`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `conversation_participants` ADD CONSTRAINT `conversation_participants_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `conversation_participants` ADD CONSTRAINT `conversation_participants_organization_id_conversation_id_fkey` FOREIGN KEY (`organization_id`, `conversation_id`) REFERENCES `conversations`(`organization_id`, `id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `conversation_participants` ADD CONSTRAINT `conversation_participants_organization_id_membership_id_fkey` FOREIGN KEY (`organization_id`, `membership_id`) REFERENCES `memberships`(`organization_id`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `messages` ADD CONSTRAINT `messages_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `messages` ADD CONSTRAINT `messages_organization_id_conversation_id_fkey` FOREIGN KEY (`organization_id`, `conversation_id`) REFERENCES `conversations`(`organization_id`, `id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `messages` ADD CONSTRAINT `messages_organization_id_sender_membership_id_fkey` FOREIGN KEY (`organization_id`, `sender_membership_id`) REFERENCES `memberships`(`organization_id`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `message_attachments` ADD CONSTRAINT `message_attachments_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `message_attachments` ADD CONSTRAINT `message_attachments_organization_id_message_id_fkey` FOREIGN KEY (`organization_id`, `message_id`) REFERENCES `messages`(`organization_id`, `id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `message_attachments` ADD CONSTRAINT `message_attachments_organization_id_file_id_fkey` FOREIGN KEY (`organization_id`, `file_id`) REFERENCES `files`(`organization_id`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;
