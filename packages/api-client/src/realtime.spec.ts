import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { connectRealtime } from './realtime.js';

class FakeSocket extends EventEmitter {
  closed = false;
  close() {
    this.closed = true;
  }
}
const flush = () => new Promise((r) => setTimeout(r, 0));

function setup(tokens: (string | null)[] = ['t1', 't2', 't3']) {
  const sockets: FakeSocket[] = [];
  const auths: string[] = [];
  const renews: boolean[] = [];
  const events: unknown[] = [];
  const statuses: string[] = [];
  const queue = [...tokens];
  const conn = connectRealtime({
    baseUrl: 'http://localhost:3001/api/v1',
    getToken: async (renew) => (renews.push(renew), queue.shift() ?? null),
    onEvent: (e) => events.push(e),
    onStatus: (s) => statuses.push(s),
    createSocket: ((url: string, auth: { token: string }) => {
      expect(url).toBe('http://localhost:3001'); // the origin only: no path, no token in the URL
      auths.push(auth.token);
      const s = new FakeSocket();
      sockets.push(s);
      return s;
    }) as never,
    backoff: () => 0,
  });
  return { conn, sockets, auths, renews, events, statuses };
}

describe('connectRealtime', () => {
  it('goes live on ready and hands events to the app with their type', async () => {
    const r = setup();
    await flush();
    r.sockets[0]!.emit('ready');
    r.sockets[0]!.emit('message:new', { organizationId: 'o', conversationId: 'c', message: { id: 'm' } });
    r.sockets[0]!.emit('conversation:read', { organizationId: 'o', conversationId: 'c', membershipId: 'x', messageId: 'm' });
    expect(r.statuses).toEqual(['connecting', 'live']);
    expect(r.events).toEqual([
      { type: 'message:new', organizationId: 'o', conversationId: 'c', message: { id: 'm' } },
      { type: 'conversation:read', organizationId: 'o', conversationId: 'c', membershipId: 'x', messageId: 'm' },
    ]);
    r.conn.close();
  });

  it('asks for a fresh token when the server refuses or expires the old one, and reports live again', async () => {
    const r = setup();
    await flush();
    r.sockets[0]!.emit('connect_error', Object.assign(new Error('UNAUTHENTICATED'), { data: { code: 'UNAUTHENTICATED' } }));
    await flush();
    await flush();
    expect(r.renews).toEqual([false, true]);
    expect(r.auths).toEqual(['t1', 't2']);
    r.sockets[1]!.emit('ready');
    r.sockets[1]!.emit('auth:expired');
    await flush();
    await flush();
    expect(r.renews).toEqual([false, true, true]);
    expect(r.auths).toEqual(['t1', 't2', 't3']);
    expect(r.sockets[0]!.closed).toBe(true);
    r.conn.close();
  });

  it('retries a plain network drop with the same session (no refresh), once per failure', async () => {
    const r = setup();
    await flush();
    r.sockets[0]!.emit('disconnect', 'transport close');
    r.sockets[0]!.emit('disconnect', 'transport close'); // a second signal for the same socket changes nothing
    await flush();
    await flush();
    expect(r.sockets).toHaveLength(2);
    expect(r.renews).toEqual([false, false]);
    r.conn.close();
  });

  it('stops for good when the person is signed out', async () => {
    const r = setup(['t1', null]);
    await flush();
    r.sockets[0]!.emit('auth:expired');
    await flush();
    await flush();
    expect(r.sockets).toHaveLength(1);
    expect(r.statuses.at(-1)).toBe('offline');
    r.conn.close();
  });

  it('does nothing after close, even when a late event arrives', async () => {
    const r = setup();
    await flush();
    r.conn.close();
    const spy = vi.fn();
    r.sockets[0]!.on('x', spy);
    r.sockets[0]!.emit('disconnect');
    await flush();
    expect(r.sockets).toHaveLength(1);
    expect(r.sockets[0]!.closed).toBe(true);
  });
});
