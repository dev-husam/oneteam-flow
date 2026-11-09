export const QUEUES = {
  EMAIL: 'email',
  PUSH: 'push',
  /** Scheduled housekeeping: reminders and similar. */
  MAINTENANCE: 'maintenance',
  /** Coaching session reminders (a queue of its own, see the worker module). */
  COACHING: 'coaching',
} as const;

/**
 * Jobs carry ids, not personal data: the worker loads the user by id. One-time tokens are the single
 * exception (they must reach the e-mail); those jobs are removed on completion and expire in 1 hour on failure.
 */
export type EmailJob =
  | { template: 'verify-email'; userId: string; token: string }
  | { template: 'reset-password'; userId: string; token: string }
  | { template: 'email-exists'; userId: string }
  | { template: 'password-changed'; userId: string }
  | { template: 'invitation'; invitationId: string; token: string }
  | { template: 'notification'; userId: string; type: string; params?: Record<string, string>; data?: Record<string, string> };

/** Self-contained so a notification can be pushed or e-mailed even when the user turned the in-app inbox off. */
export interface PushJob {
  userId: string;
  type: string;
  params?: Record<string, string>;
  data?: Record<string, string>;
}

export const EMAIL_JOB_OPTIONS = {
  attempts: 5,
  backoff: { type: 'exponential' as const, delay: 5_000 },
  removeOnComplete: true,
  removeOnFail: { age: 3_600 },
};
