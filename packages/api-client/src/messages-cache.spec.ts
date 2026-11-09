import { describe, expect, it } from 'vitest';
import { withDeleted, withMessage, type MessagePagesLike } from './messages-cache.js';
import type { Message } from './types.js';

const msg = (id: string, over: Partial<Message> = {}): Message => ({ id, conversationId: 'c', senderMembershipId: 'm', senderName: 'Sara', kind: 'TEXT', body: id, deleted: false, createdAt: '2026-11-07T10:00:00Z', attachments: [], ...over });
const pages = (...groups: Message[][]): MessagePagesLike => ({ pageParams: groups.map(() => undefined), pages: groups.map((data) => ({ data, meta: { nextCursor: null } })) });

describe('message cache updates', () => {
  it('adds a new message once, at the top of the newest page', () => {
    const before = pages([msg('b'), msg('a')], [msg('z')]);
    const after = withMessage(before, msg('c'))!;
    expect(after.pages[0]!.data.map((m) => m.id)).toEqual(['c', 'b', 'a']);
    expect(after.pages[1]!.data.map((m) => m.id)).toEqual(['z']);
    expect(withMessage(after, msg('c'))).toBe(after); // the socket and the send response both deliver it
    expect(withMessage(after, msg('z'))).toBe(after); // already on an older page
    expect(before.pages[0]!.data).toHaveLength(2); // never mutates what it was given
  });

  it('leaves an unloaded thread alone', () => {
    expect(withMessage(undefined, msg('a'))).toBeUndefined();
    expect(withMessage({ pages: [], pageParams: [] }, msg('a'))!.pages).toEqual([]);
  });

  it('turns a message into a tombstone without touching the others', () => {
    const after = withDeleted(pages([msg('b'), msg('a', { attachments: [{ fileId: 'f', fileName: 'x.pdf', mimeType: 'application/pdf', sizeBytes: 1 }] })]), 'a')!;
    expect(after.pages[0]!.data[1]).toMatchObject({ id: 'a', deleted: true, body: '', attachments: [] });
    expect(after.pages[0]!.data[0]).toMatchObject({ id: 'b', deleted: false, body: 'b' });
  });
});
