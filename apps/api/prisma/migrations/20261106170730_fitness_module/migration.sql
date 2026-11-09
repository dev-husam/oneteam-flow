-- CreateTable
CREATE TABLE `fit_client_profiles` (
    `id` CHAR(36) NOT NULL,
    `organization_id` CHAR(36) NOT NULL,
    `membership_id` CHAR(36) NOT NULL,
    `date_of_birth` DATE NULL,
    `sex` VARCHAR(10) NULL,
    `height_cm` DECIMAL(5, 1) NULL,
    `goal_type` VARCHAR(30) NULL,
    `goals_text` VARCHAR(2000) NULL,
    `activity_level` VARCHAR(20) NULL,
    `injuries_notes_enc` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `fit_client_profiles_organization_id_membership_id_key`(`organization_id`, `membership_id`),
    UNIQUE INDEX `fit_client_profiles_organization_id_id_key`(`organization_id`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fit_exercises` (
    `id` CHAR(36) NOT NULL,
    `organization_id` CHAR(36) NULL,
    `scope_key` VARCHAR(40) NOT NULL,
    `key` VARCHAR(80) NULL,
    `name_i18n` JSON NOT NULL,
    `muscle_group` VARCHAR(20) NOT NULL,
    `equipment` VARCHAR(20) NOT NULL,
    `instructions_i18n` JSON NULL,
    `video_url` VARCHAR(500) NULL,
    `created_by_membership_id` CHAR(36) NULL,
    `archived_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `fit_exercises_scope_key_muscle_group_idx`(`scope_key`, `muscle_group`),
    UNIQUE INDEX `fit_exercises_scope_key_key_key`(`scope_key`, `key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fit_workout_plans` (
    `id` CHAR(36) NOT NULL,
    `organization_id` CHAR(36) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `description` VARCHAR(1000) NULL,
    `current_version_id` CHAR(36) NULL,
    `created_by_membership_id` CHAR(36) NOT NULL,
    `archived_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `fit_workout_plans_organization_id_archived_at_idx`(`organization_id`, `archived_at`),
    UNIQUE INDEX `fit_workout_plans_organization_id_id_key`(`organization_id`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fit_workout_plan_versions` (
    `id` CHAR(36) NOT NULL,
    `organization_id` CHAR(36) NOT NULL,
    `plan_id` CHAR(36) NOT NULL,
    `version_no` INTEGER NOT NULL,
    `published_at` DATETIME(3) NULL,
    `notes` VARCHAR(2000) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `fit_workout_plan_versions_plan_id_version_no_key`(`plan_id`, `version_no`),
    UNIQUE INDEX `fit_workout_plan_versions_organization_id_id_key`(`organization_id`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fit_workout_days` (
    `id` CHAR(36) NOT NULL,
    `organization_id` CHAR(36) NOT NULL,
    `version_id` CHAR(36) NOT NULL,
    `day_index` INTEGER NOT NULL,
    `name` VARCHAR(80) NOT NULL,
    `notes` VARCHAR(1000) NULL,

    UNIQUE INDEX `fit_workout_days_version_id_day_index_key`(`version_id`, `day_index`),
    UNIQUE INDEX `fit_workout_days_organization_id_id_key`(`organization_id`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fit_workout_day_exercises` (
    `id` CHAR(36) NOT NULL,
    `organization_id` CHAR(36) NOT NULL,
    `day_id` CHAR(36) NOT NULL,
    `exercise_id` CHAR(36) NOT NULL,
    `position` INTEGER NOT NULL,
    `sets` INTEGER NOT NULL,
    `reps_min` INTEGER NOT NULL,
    `reps_max` INTEGER NOT NULL,
    `target_weight_kg` DECIMAL(6, 2) NULL,
    `rest_seconds` INTEGER NOT NULL,
    `tempo` VARCHAR(20) NULL,
    `superset_group` INTEGER NULL,
    `notes` VARCHAR(500) NULL,

    UNIQUE INDEX `fit_workout_day_exercises_day_id_position_key`(`day_id`, `position`),
    UNIQUE INDEX `fit_workout_day_exercises_organization_id_id_key`(`organization_id`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fit_workout_assignments` (
    `id` CHAR(36) NOT NULL,
    `organization_id` CHAR(36) NOT NULL,
    `version_id` CHAR(36) NOT NULL,
    `client_membership_id` CHAR(36) NOT NULL,
    `assigned_by_membership_id` CHAR(36) NOT NULL,
    `batch_id` CHAR(36) NULL,
    `start_date` DATE NOT NULL,
    `end_date` DATE NULL,
    `weekly_schedule` JSON NOT NULL,
    `status` ENUM('ACTIVE', 'CANCELLED') NOT NULL DEFAULT 'ACTIVE',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `fit_workout_assignments_organization_id_client_membership_id_idx`(`organization_id`, `client_membership_id`, `status`),
    INDEX `fit_workout_assignments_organization_id_version_id_idx`(`organization_id`, `version_id`),
    UNIQUE INDEX `fit_workout_assignments_organization_id_id_key`(`organization_id`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fit_workout_sessions` (
    `id` CHAR(36) NOT NULL,
    `organization_id` CHAR(36) NOT NULL,
    `assignment_id` CHAR(36) NOT NULL,
    `day_id` CHAR(36) NOT NULL,
    `client_membership_id` CHAR(36) NOT NULL,
    `scheduled_date` DATE NOT NULL,
    `started_at` DATETIME(3) NULL,
    `completed_at` DATETIME(3) NULL,
    `rpe` INTEGER NULL,
    `notes` VARCHAR(1000) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `fit_workout_sessions_organization_id_client_membership_id_sc_idx`(`organization_id`, `client_membership_id`, `scheduled_date`),
    UNIQUE INDEX `fit_workout_sessions_assignment_id_day_id_scheduled_date_key`(`assignment_id`, `day_id`, `scheduled_date`),
    UNIQUE INDEX `fit_workout_sessions_organization_id_id_key`(`organization_id`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fit_workout_set_logs` (
    `id` CHAR(36) NOT NULL,
    `organization_id` CHAR(36) NOT NULL,
    `session_id` CHAR(36) NOT NULL,
    `day_exercise_id` CHAR(36) NOT NULL,
    `set_no` INTEGER NOT NULL,
    `reps_done` INTEGER NOT NULL,
    `weight_kg` DECIMAL(6, 2) NULL,
    `completed_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `fit_workout_set_logs_organization_id_day_exercise_id_idx`(`organization_id`, `day_exercise_id`),
    UNIQUE INDEX `fit_workout_set_logs_session_id_day_exercise_id_set_no_key`(`session_id`, `day_exercise_id`, `set_no`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `fit_client_profiles` ADD CONSTRAINT `fit_client_profiles_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fit_client_profiles` ADD CONSTRAINT `fit_client_profiles_organization_id_membership_id_fkey` FOREIGN KEY (`organization_id`, `membership_id`) REFERENCES `memberships`(`organization_id`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fit_exercises` ADD CONSTRAINT `fit_exercises_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fit_workout_plans` ADD CONSTRAINT `fit_workout_plans_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fit_workout_plans` ADD CONSTRAINT `fit_workout_plans_organization_id_created_by_membership_id_fkey` FOREIGN KEY (`organization_id`, `created_by_membership_id`) REFERENCES `memberships`(`organization_id`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fit_workout_plan_versions` ADD CONSTRAINT `fit_workout_plan_versions_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fit_workout_plan_versions` ADD CONSTRAINT `fit_workout_plan_versions_organization_id_plan_id_fkey` FOREIGN KEY (`organization_id`, `plan_id`) REFERENCES `fit_workout_plans`(`organization_id`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fit_workout_days` ADD CONSTRAINT `fit_workout_days_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fit_workout_days` ADD CONSTRAINT `fit_workout_days_organization_id_version_id_fkey` FOREIGN KEY (`organization_id`, `version_id`) REFERENCES `fit_workout_plan_versions`(`organization_id`, `id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fit_workout_day_exercises` ADD CONSTRAINT `fit_workout_day_exercises_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fit_workout_day_exercises` ADD CONSTRAINT `fit_workout_day_exercises_organization_id_day_id_fkey` FOREIGN KEY (`organization_id`, `day_id`) REFERENCES `fit_workout_days`(`organization_id`, `id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fit_workout_day_exercises` ADD CONSTRAINT `fit_workout_day_exercises_exercise_id_fkey` FOREIGN KEY (`exercise_id`) REFERENCES `fit_exercises`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fit_workout_assignments` ADD CONSTRAINT `fit_workout_assignments_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fit_workout_assignments` ADD CONSTRAINT `fit_workout_assignments_organization_id_version_id_fkey` FOREIGN KEY (`organization_id`, `version_id`) REFERENCES `fit_workout_plan_versions`(`organization_id`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fit_workout_assignments` ADD CONSTRAINT `fit_workout_assignments_organization_id_client_membership_i_fkey` FOREIGN KEY (`organization_id`, `client_membership_id`) REFERENCES `memberships`(`organization_id`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fit_workout_assignments` ADD CONSTRAINT `fit_workout_assignments_organization_id_assigned_by_members_fkey` FOREIGN KEY (`organization_id`, `assigned_by_membership_id`) REFERENCES `memberships`(`organization_id`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fit_workout_sessions` ADD CONSTRAINT `fit_workout_sessions_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fit_workout_sessions` ADD CONSTRAINT `fit_workout_sessions_organization_id_assignment_id_fkey` FOREIGN KEY (`organization_id`, `assignment_id`) REFERENCES `fit_workout_assignments`(`organization_id`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fit_workout_sessions` ADD CONSTRAINT `fit_workout_sessions_organization_id_day_id_fkey` FOREIGN KEY (`organization_id`, `day_id`) REFERENCES `fit_workout_days`(`organization_id`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fit_workout_sessions` ADD CONSTRAINT `fit_workout_sessions_organization_id_client_membership_id_fkey` FOREIGN KEY (`organization_id`, `client_membership_id`) REFERENCES `memberships`(`organization_id`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fit_workout_set_logs` ADD CONSTRAINT `fit_workout_set_logs_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fit_workout_set_logs` ADD CONSTRAINT `fit_workout_set_logs_organization_id_session_id_fkey` FOREIGN KEY (`organization_id`, `session_id`) REFERENCES `fit_workout_sessions`(`organization_id`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fit_workout_set_logs` ADD CONSTRAINT `fit_workout_set_logs_organization_id_day_exercise_id_fkey` FOREIGN KEY (`organization_id`, `day_exercise_id`) REFERENCES `fit_workout_day_exercises`(`organization_id`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;
