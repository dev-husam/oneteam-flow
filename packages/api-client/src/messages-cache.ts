import type { Message, Page } from './types.js';

/** The shape of a paged message list in an infinite-query cache (newest message first). */
export interface MessagePagesLike {
  pages: Page<Message>[];
  pageParams: unknown[];
}

/** Put a message at the top of the newest-first list, once: the same message arrives by socket and by the send response. */
export function withMessage<T extends MessagePagesLike>(data: T | undefined, message: Message): T | undefined {
  if (!data || data.pages.length === 0) return data;
  if (data.pages.some((p) => p.data.some((m) => m.id === message.id))) return data;
  const [first, ...rest] = data.pages;
  return { ...data, pages: [{ ...first!, data: [message, ...first!.data] }, ...rest] };
}

/** Turn a message into its tombstone in place. */
export function withDeleted<T extends MessagePagesLike>(data: T | undefined, messageId: string): T | undefined {
  if (!data) return data;
  return { ...data, pages: data.pages.map((p) => ({ ...p, data: p.data.map((m) => (m.id === messageId ? { ...m, body: '', deleted: true, attachments: [] } : m)) })) };
}
