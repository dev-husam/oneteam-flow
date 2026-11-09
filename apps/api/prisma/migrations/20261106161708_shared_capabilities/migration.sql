-- CreateTable
CREATE TABLE `tasks` (
    `id` CHAR(36) NOT NULL,
    `organization_id` CHAR(36) NOT NULL,
    `type_key` VARCHAR(60) NOT NULL DEFAULT 'general',
    `title` VARCHAR(200) NOT NULL,
    `description` TEXT NULL,
    `priority` ENUM('LOW', 'MEDIUM', 'HIGH', 'URGENT') NOT NULL DEFAULT 'MEDIUM',
    `status` ENUM('OPEN', 'IN_PROGRESS', 'DONE', 'CANCELLED') NOT NULL DEFAULT 'OPEN',
    `due_at` DATETIME(3) NULL,
    `completed_at` DATETIME(3) NULL,
    `created_by_membership_id` CHAR(36) NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `deleted_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `tasks_organization_id_status_due_at_idx`(`organization_id`, `status`, `due_at`),
    INDEX `tasks_organization_id_created_by_membership_id_idx`(`organization_id`, `created_by_membership_id`),
    UNIQUE INDEX `tasks_organization_id_id_key`(`organization_id`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `task_assignments` (
    `id` CHAR(36) NOT NULL,
    `organization_id` CHAR(36) NOT NULL,
    `task_id` CHAR(36) NOT NULL,
    `assignee_membership_id` CHAR(36) NOT NULL,
    `source_group_id` CHAR(36) NULL,
    `status` ENUM('PENDING', 'IN_PROGRESS', 'DONE') NOT NULL DEFAULT 'PENDING',
    `completed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `task_assignments_organization_id_assignee_membership_id_stat_idx`(`organization_id`, `assignee_membership_id`, `status`),
    UNIQUE INDEX `task_assignments_task_id_assignee_membership_id_key`(`task_id`, `assignee_membership_id`),
    UNIQUE INDEX `task_assignments_organization_id_id_key`(`organization_id`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `task_comments` (
    `id` CHAR(36) NOT NULL,
    `organization_id` CHAR(36) NOT NULL,
    `task_id` CHAR(36) NOT NULL,
    `author_membership_id` CHAR(36) NOT NULL,
    `body` TEXT NOT NULL,
    `edited_at` DATETIME(3) NULL,
    `deleted_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `task_comments_task_id_created_at_idx`(`task_id`, `created_at`),
    UNIQUE INDEX `task_comments_organization_id_id_key`(`organization_id`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `task_attachments` (
    `task_id` CHAR(36) NOT NULL,
    `file_id` CHAR(36) NOT NULL,
    `organization_id` CHAR(36) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `task_attachments_organization_id_file_id_idx`(`organization_id`, `file_id`),
    PRIMARY KEY (`task_id`, `file_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `files` (
    `id` CHAR(36) NOT NULL,
    `organization_id` CHAR(36) NOT NULL,
    `uploader_membership_id` CHAR(36) NOT NULL,
    `storage_key` VARCHAR(255) NOT NULL,
    `original_name` VARCHAR(255) NOT NULL,
    `mime_type` VARCHAR(100) NOT NULL,
    `size_bytes` BIGINT NOT NULL,
    `sensitivity` ENUM('STANDARD', 'SENSITIVE') NOT NULL DEFAULT 'STANDARD',
    `status` ENUM('PENDING_UPLOAD', 'READY', 'REJECTED') NOT NULL DEFAULT 'PENDING_UPLOAD',
    `reject_reason` VARCHAR(120) NULL,
    `deleted_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `files_storage_key_key`(`storage_key`),
    INDEX `files_organization_id_created_at_idx`(`organization_id`, `created_at`),
    UNIQUE INDEX `files_organization_id_id_key`(`organization_id`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `metric_definitions` (
    `id` CHAR(36) NOT NULL,
    `organization_id` CHAR(36) NULL,
    `scope_key` VARCHAR(40) NOT NULL,
    `key` VARCHAR(60) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `unit` VARCHAR(20) NOT NULL,
    `precision` INTEGER NOT NULL DEFAULT 2,
    `higher_is_better` BOOLEAN NULL,
    `module_key` VARCHAR(40) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `metric_definitions_scope_key_key_key`(`scope_key`, `key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `metric_records` (
    `id` CHAR(36) NOT NULL,
    `organization_id` CHAR(36) NOT NULL,
    `subject_membership_id` CHAR(36) NOT NULL,
    `metric_definition_id` CHAR(36) NOT NULL,
    `value` DECIMAL(14, 4) NOT NULL,
    `recorded_at` DATETIME(3) NOT NULL,
    `source_type` VARCHAR(60) NULL,
    `source_id` CHAR(36) NULL,
    `recorded_by_membership_id` CHAR(36) NOT NULL,
    `voided_at` DATETIME(3) NULL,
    `void_reason` VARCHAR(200) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `metric_records_organization_id_subject_membership_id_metric__idx`(`organization_id`, `subject_membership_id`, `metric_definition_id`, `recorded_at`),
    UNIQUE INDEX `metric_records_organization_id_id_key`(`organization_id`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `goals` (
    `id` CHAR(36) NOT NULL,
    `organization_id` CHAR(36) NOT NULL,
    `subject_membership_id` CHAR(36) NOT NULL,
    `metric_definition_id` CHAR(36) NULL,
    `title` VARCHAR(200) NOT NULL,
    `description` VARCHAR(1000) NULL,
    `baseline_value` DECIMAL(14, 4) NULL,
    `target_value` DECIMAL(14, 4) NULL,
    `direction` ENUM('INCREASE', 'DECREASE') NULL,
    `due_date` DATE NULL,
    `status` ENUM('ACTIVE', 'ACHIEVED', 'ABANDONED') NOT NULL DEFAULT 'ACTIVE',
    `achieved_at` DATETIME(3) NULL,
    `created_by_membership_id` CHAR(36) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `goals_organization_id_subject_membership_id_status_idx`(`organization_id`, `subject_membership_id`, `status`),
    UNIQUE INDEX `goals_organization_id_id_key`(`organization_id`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `goal_milestones` (
    `id` CHAR(36) NOT NULL,
    `organization_id` CHAR(36) NOT NULL,
    `goal_id` CHAR(36) NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `target_value` DECIMAL(14, 4) NULL,
    `due_date` DATE NULL,
    `achieved_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `goal_milestones_goal_id_idx`(`goal_id`),
    UNIQUE INDEX `goal_milestones_organization_id_id_key`(`organization_id`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `activity_events` (
    `id` CHAR(36) NOT NULL,
    `organization_id` CHAR(36) NOT NULL,
    `actor_membership_id` CHAR(36) NULL,
    `verb` VARCHAR(60) NOT NULL,
    `entity_type` VARCHAR(40) NOT NULL,
    `entity_id` CHAR(36) NOT NULL,
    `subject_membership_id` CHAR(36) NULL,
    `data` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `activity_events_organization_id_entity_type_entity_id_create_idx`(`organization_id`, `entity_type`, `entity_id`, `created_at`),
    INDEX `activity_events_organization_id_subject_membership_id_create_idx`(`organization_id`, `subject_membership_id`, `created_at`),
    INDEX `activity_events_organization_id_created_at_idx`(`organization_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `notifications` (
    `id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `organization_id` CHAR(36) NULL,
    `type_key` VARCHAR(60) NOT NULL,
    `params` JSON NULL,
    `data` JSON NULL,
    `read_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `notifications_user_id_read_at_created_at_idx`(`user_id`, `read_at`, `created_at`),
    INDEX `notifications_user_id_created_at_idx`(`user_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `notification_preferences` (
    `id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `scope_key` VARCHAR(40) NOT NULL,
    `category` VARCHAR(40) NOT NULL,
    `channel` ENUM('IN_APP', 'PUSH', 'EMAIL') NOT NULL,
    `enabled` BOOLEAN NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `notification_preferences_user_id_scope_key_category_channel_key`(`user_id`, `scope_key`, `category`, `channel`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `tasks` ADD CONSTRAINT `tasks_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tasks` ADD CONSTRAINT `tasks_organization_id_created_by_membership_id_fkey` FOREIGN KEY (`organization_id`, `created_by_membership_id`) REFERENCES `memberships`(`organization_id`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `task_assignments` ADD CONSTRAINT `task_assignments_organization_id_task_id_fkey` FOREIGN KEY (`organization_id`, `task_id`) REFERENCES `tasks`(`organization_id`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `task_assignments` ADD CONSTRAINT `task_assignments_organization_id_assignee_membership_id_fkey` FOREIGN KEY (`organization_id`, `assignee_membership_id`) REFERENCES `memberships`(`organization_id`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `task_comments` ADD CONSTRAINT `task_comments_organization_id_task_id_fkey` FOREIGN KEY (`organization_id`, `task_id`) REFERENCES `tasks`(`organization_id`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `task_comments` ADD CONSTRAINT `task_comments_organization_id_author_membership_id_fkey` FOREIGN KEY (`organization_id`, `author_membership_id`) REFERENCES `memberships`(`organization_id`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `task_attachments` ADD CONSTRAINT `task_attachments_organization_id_task_id_fkey` FOREIGN KEY (`organization_id`, `task_id`) REFERENCES `tasks`(`organization_id`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `task_attachments` ADD CONSTRAINT `task_attachments_organization_id_file_id_fkey` FOREIGN KEY (`organization_id`, `file_id`) REFERENCES `files`(`organization_id`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `files` ADD CONSTRAINT `files_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `files` ADD CONSTRAINT `files_organization_id_uploader_membership_id_fkey` FOREIGN KEY (`organization_id`, `uploader_membership_id`) REFERENCES `memberships`(`organization_id`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `metric_definitions` ADD CONSTRAINT `metric_definitions_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `metric_records` ADD CONSTRAINT `metric_records_organization_id_subject_membership_id_fkey` FOREIGN KEY (`organization_id`, `subject_membership_id`) REFERENCES `memberships`(`organization_id`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `metric_records` ADD CONSTRAINT `metric_records_organization_id_recorded_by_membership_id_fkey` FOREIGN KEY (`organization_id`, `recorded_by_membership_id`) REFERENCES `memberships`(`organization_id`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `metric_records` ADD CONSTRAINT `metric_records_metric_definition_id_fkey` FOREIGN KEY (`metric_definition_id`) REFERENCES `metric_definitions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `goals` ADD CONSTRAINT `goals_organization_id_subject_membership_id_fkey` FOREIGN KEY (`organization_id`, `subject_membership_id`) REFERENCES `memberships`(`organization_id`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `goals` ADD CONSTRAINT `goals_organization_id_created_by_membership_id_fkey` FOREIGN KEY (`organization_id`, `created_by_membership_id`) REFERENCES `memberships`(`organization_id`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `goals` ADD CONSTRAINT `goals_metric_definition_id_fkey` FOREIGN KEY (`metric_definition_id`) REFERENCES `metric_definitions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `goal_milestones` ADD CONSTRAINT `goal_milestones_organization_id_goal_id_fkey` FOREIGN KEY (`organization_id`, `goal_id`) REFERENCES `goals`(`organization_id`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `activity_events` ADD CONSTRAINT `activity_events_organization_id_actor_membership_id_fkey` FOREIGN KEY (`organization_id`, `actor_membership_id`) REFERENCES `memberships`(`organization_id`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `activity_events` ADD CONSTRAINT `activity_events_organization_id_subject_membership_id_fkey` FOREIGN KEY (`organization_id`, `subject_membership_id`) REFERENCES `memberships`(`organization_id`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notification_preferences` ADD CONSTRAINT `notification_preferences_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
