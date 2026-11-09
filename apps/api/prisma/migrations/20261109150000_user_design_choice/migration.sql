
-- AlterTable
ALTER TABLE `design_themes` ADD COLUMN `user_selectable` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE `users` ADD COLUMN `design_key` VARCHAR(40) NULL;

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_design_key_fkey` FOREIGN KEY (`design_key`) REFERENCES `design_themes`(`key`) ON DELETE SET NULL ON UPDATE CASCADE;


-- The built-in designs are offered to people from the start.
UPDATE `design_themes` SET `user_selectable` = 1 WHERE `built_in_key` IS NOT NULL;
