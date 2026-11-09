-- CreateTable
CREATE TABLE `fit_nutrition_plans` (
    `id` CHAR(36) NOT NULL,
    `organization_id` CHAR(36) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `description` VARCHAR(1000) NULL,
    `current_version_id` CHAR(36) NULL,
    `created_by_membership_id` CHAR(36) NOT NULL,
    `archived_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `fit_nutrition_plans_organization_id_archived_at_idx`(`organization_id`, `archived_at`),
    UNIQUE INDEX `fit_nutrition_plans_organization_id_id_key`(`organization_id`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fit_nutrition_plan_versions` (
    `id` CHAR(36) NOT NULL,
    `organization_id` CHAR(36) NOT NULL,
    `plan_id` CHAR(36) NOT NULL,
    `version_no` INTEGER NOT NULL,
    `published_at` DATETIME(3) NULL,
    `notes` VARCHAR(2000) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `fit_nutrition_plan_versions_plan_id_version_no_key`(`plan_id`, `version_no`),
    UNIQUE INDEX `fit_nutrition_plan_versions_organization_id_id_key`(`organization_id`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fit_nutrition_days` (
    `id` CHAR(36) NOT NULL,
    `organization_id` CHAR(36) NOT NULL,
    `version_id` CHAR(36) NOT NULL,
    `weekday` INTEGER NOT NULL,
    `notes` VARCHAR(1000) NULL,

    UNIQUE INDEX `fit_nutrition_days_version_id_weekday_key`(`version_id`, `weekday`),
    UNIQUE INDEX `fit_nutrition_days_organization_id_id_key`(`organization_id`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fit_meals` (
    `id` CHAR(36) NOT NULL,
    `organization_id` CHAR(36) NOT NULL,
    `day_id` CHAR(36) NOT NULL,
    `meal_type` VARCHAR(12) NOT NULL,
    `position` INTEGER NOT NULL,
    `time_of_day` VARCHAR(5) NULL,
    `notes` VARCHAR(500) NULL,

    UNIQUE INDEX `fit_meals_day_id_position_key`(`day_id`, `position`),
    UNIQUE INDEX `fit_meals_organization_id_id_key`(`organization_id`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fit_meal_items` (
    `id` CHAR(36) NOT NULL,
    `organization_id` CHAR(36) NOT NULL,
    `meal_id` CHAR(36) NOT NULL,
    `position` INTEGER NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `quantity` DECIMAL(10, 2) NULL,
    `unit` VARCHAR(20) NULL,
    `calories` INTEGER NULL,
    `protein_g` DECIMAL(6, 1) NULL,
    `carbs_g` DECIMAL(6, 1) NULL,
    `fat_g` DECIMAL(6, 1) NULL,
    `notes` VARCHAR(300) NULL,

    UNIQUE INDEX `fit_meal_items_meal_id_position_key`(`meal_id`, `position`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fit_nutrition_assignments` (
    `id` CHAR(36) NOT NULL,
    `organization_id` CHAR(36) NOT NULL,
    `version_id` CHAR(36) NOT NULL,
    `client_membership_id` CHAR(36) NOT NULL,
    `assigned_by_membership_id` CHAR(36) NOT NULL,
    `batch_id` CHAR(36) NULL,
    `start_date` DATE NOT NULL,
    `end_date` DATE NULL,
    `status` ENUM('ACTIVE', 'CANCELLED') NOT NULL DEFAULT 'ACTIVE',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `fit_nutrition_assignments_organization_id_client_membership__idx`(`organization_id`, `client_membership_id`, `status`),
    UNIQUE INDEX `fit_nutrition_assignments_organization_id_id_key`(`organization_id`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fit_meal_logs` (
    `id` CHAR(36) NOT NULL,
    `organization_id` CHAR(36) NOT NULL,
    `assignment_id` CHAR(36) NOT NULL,
    `meal_id` CHAR(36) NOT NULL,
    `client_membership_id` CHAR(36) NOT NULL,
    `log_date` DATE NOT NULL,
    `status` ENUM('COMPLETED', 'PARTIAL', 'SKIPPED') NOT NULL,
    `notes` VARCHAR(500) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `fit_meal_logs_organization_id_client_membership_id_log_date_idx`(`organization_id`, `client_membership_id`, `log_date`),
    UNIQUE INDEX `fit_meal_logs_assignment_id_meal_id_log_date_key`(`assignment_id`, `meal_id`, `log_date`),
    UNIQUE INDEX `fit_meal_logs_organization_id_id_key`(`organization_id`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fit_meal_log_photos` (
    `meal_log_id` CHAR(36) NOT NULL,
    `file_id` CHAR(36) NOT NULL,
    `organization_id` CHAR(36) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `fit_meal_log_photos_organization_id_file_id_idx`(`organization_id`, `file_id`),
    PRIMARY KEY (`meal_log_id`, `file_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fit_checkins` (
    `id` CHAR(36) NOT NULL,
    `organization_id` CHAR(36) NOT NULL,
    `client_membership_id` CHAR(36) NOT NULL,
    `week_start_date` DATE NOT NULL,
    `status` ENUM('DRAFT', 'SUBMITTED', 'REVIEWED') NOT NULL DEFAULT 'DRAFT',
    `draft_measurements` JSON NULL,
    `client_notes` VARCHAR(2000) NULL,
    `submitted_at` DATETIME(3) NULL,
    `workout_adherence_pct` INTEGER NULL,
    `nutrition_adherence_pct` INTEGER NULL,
    `reviewed_by_membership_id` CHAR(36) NULL,
    `reviewed_at` DATETIME(3) NULL,
    `trainer_feedback` VARCHAR(2000) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `fit_checkins_organization_id_status_submitted_at_idx`(`organization_id`, `status`, `submitted_at`),
    UNIQUE INDEX `fit_checkins_organization_id_client_membership_id_week_start_key`(`organization_id`, `client_membership_id`, `week_start_date`),
    UNIQUE INDEX `fit_checkins_organization_id_id_key`(`organization_id`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fit_checkin_comments` (
    `id` CHAR(36) NOT NULL,
    `organization_id` CHAR(36) NOT NULL,
    `checkin_id` CHAR(36) NOT NULL,
    `author_membership_id` CHAR(36) NOT NULL,
    `body` VARCHAR(2000) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `fit_checkin_comments_organization_id_checkin_id_created_at_idx`(`organization_id`, `checkin_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fit_progress_photos` (
    `id` CHAR(36) NOT NULL,
    `organization_id` CHAR(36) NOT NULL,
    `client_membership_id` CHAR(36) NOT NULL,
    `file_id` CHAR(36) NOT NULL,
    `kind` VARCHAR(10) NOT NULL,
    `angle` VARCHAR(10) NOT NULL,
    `taken_on` DATE NOT NULL,
    `checkin_id` CHAR(36) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `fit_progress_photos_organization_id_client_membership_id_tak_idx`(`organization_id`, `client_membership_id`, `taken_on`),
    UNIQUE INDEX `fit_progress_photos_organization_id_file_id_key`(`organization_id`, `file_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fit_reminder_marks` (
    `id` CHAR(36) NOT NULL,
    `organization_id` CHAR(36) NOT NULL,
    `key` VARCHAR(120) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `fit_reminder_marks_organization_id_key_key`(`organization_id`, `key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `fit_nutrition_plans` ADD CONSTRAINT `fit_nutrition_plans_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fit_nutrition_plans` ADD CONSTRAINT `fit_nutrition_plans_organization_id_created_by_membership_i_fkey` FOREIGN KEY (`organization_id`, `created_by_membership_id`) REFERENCES `memberships`(`organization_id`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fit_nutrition_plan_versions` ADD CONSTRAINT `fit_nutrition_plan_versions_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fit_nutrition_plan_versions` ADD CONSTRAINT `fit_nutrition_plan_versions_organization_id_plan_id_fkey` FOREIGN KEY (`organization_id`, `plan_id`) REFERENCES `fit_nutrition_plans`(`organization_id`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fit_nutrition_days` ADD CONSTRAINT `fit_nutrition_days_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fit_nutrition_days` ADD CONSTRAINT `fit_nutrition_days_organization_id_version_id_fkey` FOREIGN KEY (`organization_id`, `version_id`) REFERENCES `fit_nutrition_plan_versions`(`organization_id`, `id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fit_meals` ADD CONSTRAINT `fit_meals_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fit_meals` ADD CONSTRAINT `fit_meals_organization_id_day_id_fkey` FOREIGN KEY (`organization_id`, `day_id`) REFERENCES `fit_nutrition_days`(`organization_id`, `id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fit_meal_items` ADD CONSTRAINT `fit_meal_items_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fit_meal_items` ADD CONSTRAINT `fit_meal_items_organization_id_meal_id_fkey` FOREIGN KEY (`organization_id`, `meal_id`) REFERENCES `fit_meals`(`organization_id`, `id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fit_nutrition_assignments` ADD CONSTRAINT `fit_nutrition_assignments_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fit_nutrition_assignments` ADD CONSTRAINT `fit_nutrition_assignments_organization_id_version_id_fkey` FOREIGN KEY (`organization_id`, `version_id`) REFERENCES `fit_nutrition_plan_versions`(`organization_id`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fit_nutrition_assignments` ADD CONSTRAINT `fit_nutrition_assignments_organization_id_client_membership_fkey` FOREIGN KEY (`organization_id`, `client_membership_id`) REFERENCES `memberships`(`organization_id`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fit_nutrition_assignments` ADD CONSTRAINT `fit_nutrition_assignments_organization_id_assigned_by_membe_fkey` FOREIGN KEY (`organization_id`, `assigned_by_membership_id`) REFERENCES `memberships`(`organization_id`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fit_meal_logs` ADD CONSTRAINT `fit_meal_logs_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fit_meal_logs` ADD CONSTRAINT `fit_meal_logs_organization_id_assignment_id_fkey` FOREIGN KEY (`organization_id`, `assignment_id`) REFERENCES `fit_nutrition_assignments`(`organization_id`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fit_meal_logs` ADD CONSTRAINT `fit_meal_logs_organization_id_meal_id_fkey` FOREIGN KEY (`organization_id`, `meal_id`) REFERENCES `fit_meals`(`organization_id`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fit_meal_logs` ADD CONSTRAINT `fit_meal_logs_organization_id_client_membership_id_fkey` FOREIGN KEY (`organization_id`, `client_membership_id`) REFERENCES `memberships`(`organization_id`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fit_meal_log_photos` ADD CONSTRAINT `fit_meal_log_photos_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fit_meal_log_photos` ADD CONSTRAINT `fit_meal_log_photos_organization_id_meal_log_id_fkey` FOREIGN KEY (`organization_id`, `meal_log_id`) REFERENCES `fit_meal_logs`(`organization_id`, `id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fit_meal_log_photos` ADD CONSTRAINT `fit_meal_log_photos_organization_id_file_id_fkey` FOREIGN KEY (`organization_id`, `file_id`) REFERENCES `files`(`organization_id`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fit_checkins` ADD CONSTRAINT `fit_checkins_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fit_checkins` ADD CONSTRAINT `fit_checkins_organization_id_client_membership_id_fkey` FOREIGN KEY (`organization_id`, `client_membership_id`) REFERENCES `memberships`(`organization_id`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fit_checkins` ADD CONSTRAINT `fit_checkins_organization_id_reviewed_by_membership_id_fkey` FOREIGN KEY (`organization_id`, `reviewed_by_membership_id`) REFERENCES `memberships`(`organization_id`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fit_checkin_comments` ADD CONSTRAINT `fit_checkin_comments_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fit_checkin_comments` ADD CONSTRAINT `fit_checkin_comments_organization_id_checkin_id_fkey` FOREIGN KEY (`organization_id`, `checkin_id`) REFERENCES `fit_checkins`(`organization_id`, `id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fit_checkin_comments` ADD CONSTRAINT `fit_checkin_comments_organization_id_author_membership_id_fkey` FOREIGN KEY (`organization_id`, `author_membership_id`) REFERENCES `memberships`(`organization_id`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fit_progress_photos` ADD CONSTRAINT `fit_progress_photos_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fit_progress_photos` ADD CONSTRAINT `fit_progress_photos_organization_id_client_membership_id_fkey` FOREIGN KEY (`organization_id`, `client_membership_id`) REFERENCES `memberships`(`organization_id`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fit_progress_photos` ADD CONSTRAINT `fit_progress_photos_organization_id_file_id_fkey` FOREIGN KEY (`organization_id`, `file_id`) REFERENCES `files`(`organization_id`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fit_progress_photos` ADD CONSTRAINT `fit_progress_photos_organization_id_checkin_id_fkey` FOREIGN KEY (`organization_id`, `checkin_id`) REFERENCES `fit_checkins`(`organization_id`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fit_reminder_marks` ADD CONSTRAINT `fit_reminder_marks_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
