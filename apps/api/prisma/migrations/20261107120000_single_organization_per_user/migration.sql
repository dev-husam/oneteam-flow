-- Phase 7a: an account belongs to at most one organization, and organizations hand out only owner, trainer and client.

-- AlterTable
ALTER TABLE `memberships` ADD COLUMN `active_user_key` CHAR(36) NULL;

-- Data: members and pending invitations holding a retired role (admin, manager) become trainers.
-- Joins only: on a fresh database the system roles are not seeded yet, so nothing matches.
UPDATE `memberships` m
  JOIN `roles` r ON r.`id` = m.`role_id`
  JOIN `roles` p ON p.`scope_key` = 'system' AND p.`key` = 'practitioner'
  SET m.`role_id` = p.`id`
  WHERE r.`scope_key` = 'system' AND r.`key` IN ('admin', 'manager');

UPDATE `invitations` i
  JOIN `roles` r ON r.`id` = i.`role_id`
  JOIN `roles` p ON p.`scope_key` = 'system' AND p.`key` = 'practitioner'
  SET i.`role_id` = p.`id`
  WHERE i.`status` = 'PENDING' AND r.`scope_key` = 'system' AND r.`key` IN ('admin', 'manager');

-- Data: an account that belongs to several organizations keeps its oldest live membership; the others end.
UPDATE `memberships` m
  JOIN (
    SELECT `id` FROM (
      SELECT `id`, ROW_NUMBER() OVER (PARTITION BY `user_id` ORDER BY `joined_at`, `id`) AS rn
      FROM `memberships` WHERE `status` <> 'REMOVED'
    ) ranked WHERE ranked.rn > 1
  ) extra ON extra.`id` = m.`id`
  SET m.`status` = 'REMOVED', m.`removed_at` = NOW(3);

UPDATE `member_assignments` a
  JOIN `memberships` m ON m.`id` IN (a.`practitioner_membership_id`, a.`participant_membership_id`)
  SET a.`ended_at` = NOW(3), a.`active_key` = NULL
  WHERE a.`ended_at` IS NULL AND m.`status` = 'REMOVED';

DELETE gm FROM `group_members` gm JOIN `memberships` m ON m.`id` = gm.`membership_id` WHERE m.`status` = 'REMOVED';

UPDATE `memberships` SET `active_user_key` = `user_id` WHERE `status` <> 'REMOVED';

-- CreateIndex
CREATE UNIQUE INDEX `memberships_active_user_key_key` ON `memberships`(`active_user_key`);
