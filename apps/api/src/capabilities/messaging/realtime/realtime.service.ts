import { Injectable, Logger } from '@nestjs/common';
import type { Server } from 'socket.io';

export const memberRoom = (orgId: string, membershipId: string) => `org:${orgId}:member:${membershipId}`;
export const userRoom = (userId: string) => `user:${userId}`;
export const sessionRoom = (sessionId: string) => `session:${sessionId}`;

/** Events the server pushes. Clients never send events: every write goes through the REST API. */
export type RealtimeEvent = 'message:new' | 'message:deleted' | 'conversation:read';

/**
 * Pushes events to people. A socket only ever joins the private rooms of ITS OWN active memberships (decided by the
 * server at connection time, never by the client), so a payload addressed to `org:A:member:X` cannot reach anyone else.
 */
@Injectable()
export class RealtimeService {
  private readonly logger = new Logger(RealtimeService.name);
  private server?: Server;

  attach(server: Server): void {
    this.server = server;
  }

  get io(): Server | undefined {
    return this.server;
  }

  /** Deliver to specific members of one organization (all of their connected devices). */
  emitToMembers(orgId: string, membershipIds: string[], event: RealtimeEvent, payload: Record<string, unknown>): void {
    if (!this.server || membershipIds.length === 0) return;
    const rooms = [...new Set(membershipIds)].map((id) => memberRoom(orgId, id));
    this.server.to(rooms).emit(event, payload);
  }
}
