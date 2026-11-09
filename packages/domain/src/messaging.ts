/** Rules of private messaging that both the API and the apps rely on. */

export const MESSAGE_MAX_LENGTH = 4000;
export const MESSAGE_MAX_ATTACHMENTS = 5;
export const CONVERSATION_TYPES = ['DIRECT'] as const;
export type ConversationType = (typeof CONVERSATION_TYPES)[number];

/** Stable key of a pair of people: the same two members always give the same key, in either order. */
export function directKey(a: string, b: string): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

/**
 * May a member with this `message.send` grant START a conversation with another member?
 * ORG/ALL: anyone in the organization. ASSIGNED: only the people they are assigned to or who are assigned to them.
 * Replying inside an existing conversation does not use this rule: being in the conversation is enough.
 */
export function mayStartConversation(grant: string | undefined, relation: { assigned: boolean }): boolean {
  if (grant === 'ORG' || grant === 'ALL') return true;
  if (grant === 'ASSIGNED') return relation.assigned;
  return false;
}

/** Trim and bound a message body; null when there is nothing left to send. */
export function normalizeBody(raw: string): string {
  return raw.replace(/\r\n/g, '\n').trim();
}

// ---------------------------------------------------------------- abuse handling

export const REPORT_REASONS = ['HARASSMENT', 'SPAM', 'INAPPROPRIATE', 'OTHER'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];
export const REPORT_STATUSES = ['OPEN', 'DISMISSED', 'ACTIONED'] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];
export const REPORT_NOTE_MAX = 500;
