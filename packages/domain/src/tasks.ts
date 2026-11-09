export type AssignmentState = 'PENDING' | 'IN_PROGRESS' | 'DONE';
export type TaskState = 'OPEN' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED';

/**
 * Task status derived from its assignees (cancelled tasks stay cancelled until reopened).
 * No assignees → OPEN. Everyone done → DONE. Anyone started or finished → IN_PROGRESS. Otherwise OPEN.
 */
export function deriveTaskStatus(assignments: readonly AssignmentState[]): Exclude<TaskState, 'CANCELLED'> {
  if (assignments.length === 0) return 'OPEN';
  if (assignments.every((a) => a === 'DONE')) return 'DONE';
  if (assignments.some((a) => a === 'IN_PROGRESS' || a === 'DONE')) return 'IN_PROGRESS';
  return 'OPEN';
}

export const TASK_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;

/** Overdue = has a due date in the past and is not finished or cancelled. */
export const isOverdue = (dueAt: Date | string | null, status: TaskState, now: Date = new Date()): boolean =>
  dueAt !== null && status !== 'DONE' && status !== 'CANCELLED' && new Date(dueAt).getTime() < now.getTime();
