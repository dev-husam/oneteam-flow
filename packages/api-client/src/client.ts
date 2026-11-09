import { ApiError } from './error.js';
import { isMfaChallenge } from './types.js';
import type {
  ActivityFeedItem,
  Conversation,
  Message,
  MessageReport,
  ReportReasonKey,
  ReportStatusKey,
  MessagingContact,
  Checkin,
  CheckinComparison,
  CheckinSummary,
  CheckinWeek,
  MealLog,
  MealLogRange,
  NutritionAssignmentDetail,
  NutritionAssignmentItem,
  NutritionContentInput,
  NutritionToday,
  NutritionVersion,
  ProgressPhoto,
  SaveCheckinInput,
  PhotoAngleKey,
  PhotoKindKey,
  MealLogStatusKey,
  CheckinStatusKey,
  AssignmentDetail,
  AssignmentItem,
  ClientDetail,
  ClientSummary,
  CreateAssignmentsInput,
  CreateExerciseInput,
  Exercise,
  MuscleGroupKey,
  EquipmentKey,
  PlanContentInput,
  PlanDetail,
  PlanSummary,
  PlanVersion,
  SessionDetail,
  SessionSummary,
  TodayView,
  UpdateClientProfileInput,
  ActivityItem,
  AdminHealth,
  AdminOrganization,
  AdminOrganizationDetail,
  AdminStats,
  AdminUser,
  AdminUserDetail,
  AssignableRole,
  Assignment,
  AuditEntry,
  AppNotification,
  AuthSession,
  CatalogEntry,
  CategoryOption,
  ClientType,
  CreateGoalInput,
  CreateInvitationInput,
  CreateOrganizationInput,
  CreateTaskInput,
  Goal,
  Group,
  GroupDetail,
  GroupProgress,
  Invitation,
  InvitationPreview,
  ListMembersParams,
  ListTasksParams,
  Locale,
  LoginResult,
  Member,
  MetricDefinition,
  MetricPoint,
  MetricSummary,
  Milestone,
  MfaEnrollment,
  MyOrganization,
  NotificationChannel,
  NotificationPreference,
  OrgContext,
  Organization,
  Page,
  PermissionDefinition,
  PlatformAccess,
  PlatformRoleInfo,
  RegisterInput,
  RoleDetail,
  RoleInput,
  SessionInfo,
  StoredFile,
  Task,
  TaskComment,
  TaskDetail,
  UpdateOrganizationInput,
  UpdateProfileInput,
  UpdateTaskInput,
  UploadInput,
  UploadTarget,
  User,
  AdminDesign,
  MyDesign,
  MyDesignOptions,
  DesignPatch,
  AdminEmailTemplate,
  AdminEmailTemplateRow,
  AdminFeatureFlag,
  AdminOrgFeatureFlag,
  AdminSettings,
  IdentitySettings,
  MailBrandSettings,
  MailTemplateText,
  PublicConfig,
  RenderedEmail,
  AssessmentAnswers,
  AssessmentTemplate,
  CoachAssessment,
  CoachNote,
  CoachResource,
  CoachSession,
  CreateSessionInput,
  NoteVisibility,
  SessionStatus,
  TrendSeries,
  AssessmentQuestion,
} from './types.js';

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

export interface RefreshTokenStore {
  get(): Promise<string | null>;
  set(token: string | null): Promise<void>;
}

export interface ApiClientOptions {
  /** e.g. http://localhost:3001/api/v1 */
  baseUrl: string;
  clientType: ClientType;
  deviceName?: string;
  /** Native clients persist the refresh token here (SecureStore). Web leaves it out: it uses the HttpOnly cookie. */
  refreshTokenStore?: RefreshTokenStore;
  /** Called once when the session can no longer be recovered (refresh failed). */
  onAuthLost?: () => void;
  fetch?: typeof fetch;
}

interface RequestOptions {
  body?: unknown;
  /** Return the whole `{ data, meta }` envelope (paginated lists) instead of just `data`. */
  envelope?: boolean;
  /** Attach the access token and refresh once on expiry. Default true. */
  auth?: boolean;
}

const EXPIRED_CODES = new Set(['TOKEN_EXPIRED', 'TOKEN_INVALID', 'UNAUTHENTICATED']);

/** Builds a query string from defined values only. */
function qs(params: object | undefined): string {
  const entries = Object.entries(params ?? {}).filter(([, v]) => v !== undefined && v !== null && v !== '');
  return entries.length ? `?${new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString()}` : '';
}
const id = encodeURIComponent;

export function createApiClient(options: ApiClientOptions) {
  const doFetch = options.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  let accessToken: string | null = null;
  let refreshing: Promise<AuthSession | null> | null = null;

  async function send<T>(method: string, path: string, opts: RequestOptions, token: string | null): Promise<T> {
    const headers: Record<string, string> = { 'x-client-type': options.clientType };
    if (options.deviceName) headers['x-device-name'] = options.deviceName;
    if (opts.body !== undefined) headers['content-type'] = 'application/json';
    if (token) headers.authorization = `Bearer ${token}`;

    let res: Response;
    try {
      res = await doFetch(`${options.baseUrl}${path}`, {
        method,
        headers,
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
        // Needed so the browser sends and stores the HttpOnly refresh cookie.
        credentials: options.clientType === 'web' ? 'include' : 'omit',
      });
    } catch {
      throw new ApiError('NETWORK_ERROR', 0);
    }

    if (res.status === 204) return undefined as T;
    let json: unknown;
    try {
      json = await res.json();
    } catch {
      json = undefined;
    }
    if (!res.ok) throw ApiError.fromBody(res.status, json);
    return opts.envelope ? (json as T) : (json as { data: T }).data;
  }

  /** Single-flight: concurrent 401s share one refresh, which also avoids racing the token rotation. */
  function refreshSession(): Promise<AuthSession | null> {
    refreshing ??= (async () => {
      try {
        const stored = options.refreshTokenStore ? await options.refreshTokenStore.get() : null;
        if (options.refreshTokenStore && !stored) return null;
        const session = await send<AuthSession>(
          'POST',
          '/auth/refresh',
          { body: stored ? { refreshToken: stored } : {} },
          null,
        );
        await acceptSession(session);
        return session;
      } catch {
        accessToken = null;
        return null;
      } finally {
        refreshing = null;
      }
    })();
    return refreshing;
  }

  async function acceptSession(session: AuthSession): Promise<void> {
    accessToken = session.accessToken;
    if (session.refreshToken && options.refreshTokenStore) {
      await options.refreshTokenStore.set(session.refreshToken);
    }
  }

  async function request<T>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
    const auth = opts.auth ?? true;
    try {
      return await send<T>(method, path, opts, auth ? accessToken : null);
    } catch (err) {
      if (!auth || !(err instanceof ApiError) || err.status !== 401 || !EXPIRED_CODES.has(err.code)) throw err;
      const session = await refreshSession();
      if (!session) {
        options.onAuthLost?.();
        throw err;
      }
      return send<T>(method, path, opts, accessToken);
    }
  }

  return {
    /** Restore a session on app start: refresh (cookie or stored token), then load the profile. */
    async restoreSession(): Promise<User | null> {
      const session = await refreshSession();
      return session ? session.user : null;
    },
    hasAccessToken: () => accessToken !== null,
    /** A token for the realtime connection. `renew` forces a refresh (the server said the token expired or was refused). Null = signed out. */
    async accessTokenForRealtime(renew = false): Promise<string | null> {
      if (renew || !accessToken) await refreshSession();
      return accessToken;
    },

    auth: {
      register: (input: RegisterInput) =>
        request<{ status: string }>('POST', '/auth/register', { body: input, auth: false }),
      /** Returns a session, or an MFA challenge when the account has two-factor authentication on. */
      async login(email: string, password: string): Promise<LoginResult> {
        const result = await request<LoginResult>('POST', '/auth/login', { body: { email, password }, auth: false });
        if (!isMfaChallenge(result)) await acceptSession(result);
        return result;
      },
      /** Step 2 of sign-in: authenticator code or recovery code. */
      async loginMfa(mfaToken: string, code: string): Promise<AuthSession> {
        const session = await request<AuthSession>('POST', '/auth/mfa/login', { body: { mfaToken, code }, auth: false });
        await acceptSession(session);
        return session;
      },
      async logout(): Promise<void> {
        const stored = options.refreshTokenStore ? await options.refreshTokenStore.get() : null;
        try {
          await request<void>('POST', '/auth/logout', { body: stored ? { refreshToken: stored } : {}, auth: false });
        } finally {
          accessToken = null;
          await options.refreshTokenStore?.set(null);
        }
      },
      async logoutAll(): Promise<void> {
        try {
          await request<void>('POST', '/auth/logout-all');
        } finally {
          accessToken = null;
          await options.refreshTokenStore?.set(null);
        }
      },
      verifyEmail: (token: string) =>
        request<{ status: string }>('POST', '/auth/verify-email', { body: { token }, auth: false }),
      resendVerification: (email: string) =>
        request<{ status: string }>('POST', '/auth/resend-verification', { body: { email }, auth: false }),
      requestPasswordReset: (email: string) =>
        request<{ status: string }>('POST', '/auth/request-password-reset', { body: { email }, auth: false }),
      resetPassword: (token: string, password: string) =>
        request<{ status: string }>('POST', '/auth/reset-password', { body: { token, password }, auth: false }),
    },

    me: {
      get: () => request<User>('GET', '/me'),
      update: (input: UpdateProfileInput) => request<User>('PATCH', '/me', { body: input }),
      sessions: () => request<SessionInfo[]>('GET', '/me/sessions'),
      revokeSession: (sessionId: string) => request<void>('DELETE', `/me/sessions/${id(sessionId)}`),
      platformAccess: () => request<PlatformAccess>('GET', '/me/platform-access'),
      registerDevice: (input: { expoPushToken: string; platform: 'IOS' | 'ANDROID'; locale: Locale }) => request<void>('POST', '/me/devices', { body: input }),
      unregisterDevice: (expoPushToken: string) => request<void>('DELETE', '/me/devices', { body: { expoPushToken } }),
      organizations: () => request<MyOrganization[]>('GET', '/me/organizations'),
      /** The person's own design choice (Profile → Appearance). `choose(null)` returns to the organization's or platform's design. */
      design: {
        current: () => request<MyDesign>('GET', '/me/design'),
        options: () => request<MyDesignOptions>('GET', '/me/designs'),
        choose: (key: string | null) => request<MyDesign>('PUT', '/me/design', { body: { key } }),
      },
      notifications: {
        list: (params: { unread?: boolean; cursor?: string; limit?: number } = {}) =>
          request<Page<AppNotification>>('GET', `/me/notifications${qs(params)}`, { envelope: true }),
        unreadCount: async () => (await request<{ count: number }>('GET', '/me/notifications/unread-count')).count,
        markRead: (notificationId: string) => request<void>('POST', `/me/notifications/${id(notificationId)}/read`),
        markAllRead: () => request<void>('POST', '/me/notifications/read-all'),
        preferences: (organizationId?: string) =>
          request<NotificationPreference[]>('GET', `/me/notification-preferences${qs({ organizationId })}`),
        setPreference: (input: { organizationId?: string; category: NotificationPreference['category']; channel: NotificationChannel; enabled: boolean }) =>
          request<void>('PUT', '/me/notification-preferences', { body: input }),
      },
      mfa: {
        enroll: () => request<MfaEnrollment>('POST', '/me/mfa/enroll'),
        confirm: (code: string) => request<{ recoveryCodes: string[] }>('POST', '/me/mfa/confirm', { body: { code } }),
        disable: (password: string, code: string) => request<void>('POST', '/me/mfa/disable', { body: { password, code } }),
      },
    },

    catalog: {
      categories: () => request<CategoryOption[]>('GET', '/catalog/categories'),
    },

    invitations: {
      preview: (token: string) => request<InvitationPreview>('POST', '/invitations/preview', { body: { token }, auth: false }),
      accept: (token: string) =>
        request<{ organizationId: string; slug: string; membershipId: string }>('POST', '/invitations/accept', { body: { token } }),
    },

    orgs: {
      create: (input: CreateOrganizationInput) =>
        request<{ organization: Organization; membershipId: string }>('POST', '/orgs', { body: input }),
    },

    /** Everything inside one organization: `api.org(orgId).members.list()`. The id only selects; the server verifies membership. */
    org(orgId: string) {
      const base = `/orgs/${id(orgId)}`;
      return {
        get: () => request<Organization>('GET', base),
        update: (input: UpdateOrganizationInput) => request<Organization>('PATCH', base, { body: input }),
        context: () => request<OrgContext>('GET', `${base}/context`),
        leave: () => request<void>('POST', `${base}/leave`),
        audit: (params: { action?: string; cursor?: string; limit?: number } = {}) =>
          request<Page<AuditEntry>>('GET', `${base}/audit-logs${qs(params)}`, { envelope: true }),

        members: {
          list: (params: ListMembersParams = {}) => request<Page<Member>>('GET', `${base}/members${qs(params)}`, { envelope: true }),
          get: (memberId: string) => request<Member>('GET', `${base}/members/${id(memberId)}`),
          changeRole: (memberId: string, roleId: string) => request<Member>('POST', `${base}/members/${id(memberId)}/role`, { body: { roleId } }),
          suspend: (memberId: string) => request<Member>('POST', `${base}/members/${id(memberId)}/suspend`),
          reactivate: (memberId: string) => request<Member>('POST', `${base}/members/${id(memberId)}/reactivate`),
          remove: (memberId: string) => request<void>('DELETE', `${base}/members/${id(memberId)}`),
        },

        invitations: {
          list: (params: { status?: Invitation['status']; cursor?: string; limit?: number } = {}) =>
            request<Page<Invitation>>('GET', `${base}/invitations${qs(params)}`, { envelope: true }),
          create: (input: CreateInvitationInput) => request<Invitation>('POST', `${base}/invitations`, { body: input }),
          resend: (invitationId: string) => request<Invitation>('POST', `${base}/invitations/${id(invitationId)}/resend`),
          revoke: (invitationId: string) => request<void>('DELETE', `${base}/invitations/${id(invitationId)}`),
        },

        groups: {
          list: (params: { cursor?: string; limit?: number } = {}) => request<Page<Group>>('GET', `${base}/groups${qs(params)}`, { envelope: true }),
          get: (groupId: string) => request<GroupDetail>('GET', `${base}/groups/${id(groupId)}`),
          create: (input: { name: string; description?: string; typeKey?: string }) => request<Group>('POST', `${base}/groups`, { body: input }),
          update: (groupId: string, input: { name?: string; description?: string }) => request<Group>('PATCH', `${base}/groups/${id(groupId)}`, { body: input }),
          archive: (groupId: string) => request<void>('DELETE', `${base}/groups/${id(groupId)}`),
          addMember: (groupId: string, membershipId: string) => request<GroupDetail>('POST', `${base}/groups/${id(groupId)}/members`, { body: { membershipId } }),
          removeMember: (groupId: string, membershipId: string) => request<void>('DELETE', `${base}/groups/${id(groupId)}/members/${id(membershipId)}`),
        },

        assignments: {
          list: (params: { practitionerMembershipId?: string; participantMembershipId?: string; active?: boolean; cursor?: string; limit?: number } = {}) =>
            request<Page<Assignment>>('GET', `${base}/assignments${qs(params)}`, { envelope: true }),
          create: (input: { practitionerMembershipId: string; participantMembershipId: string; kind?: Assignment['kind'] }) =>
            request<Assignment>('POST', `${base}/assignments`, { body: input }),
          end: (assignmentId: string) => request<Assignment>('POST', `${base}/assignments/${id(assignmentId)}/end`),
        },

        activity: {
          feed: (params: { cursor?: string; limit?: number } = {}) =>
            request<Page<ActivityFeedItem>>('GET', `${base}/activity${qs(params)}`, { envelope: true }),
        },

        tasks: {
          list: (params: ListTasksParams = {}) => request<Page<Task>>('GET', `${base}/tasks${qs(params)}`, { envelope: true }),
          get: (taskId: string) => request<TaskDetail>('GET', `${base}/tasks/${id(taskId)}`),
          create: (input: CreateTaskInput) => request<Task>('POST', `${base}/tasks`, { body: input }),
          update: (taskId: string, input: UpdateTaskInput) => request<Task>('PATCH', `${base}/tasks/${id(taskId)}`, { body: input }),
          remove: (taskId: string) => request<void>('DELETE', `${base}/tasks/${id(taskId)}`),
          /** Your own progress on a task you are assigned to. */
          setStatus: (taskId: string, status: 'PENDING' | 'IN_PROGRESS' | 'DONE') =>
            request<Task>('POST', `${base}/tasks/${id(taskId)}/status`, { body: { status } }),
          addAssignees: (taskId: string, input: { assigneeMembershipIds?: string[]; groupIds?: string[] }) =>
            request<Task>('POST', `${base}/tasks/${id(taskId)}/assignees`, { body: input }),
          removeAssignee: (taskId: string, membershipId: string) =>
            request<void>('DELETE', `${base}/tasks/${id(taskId)}/assignees/${id(membershipId)}`),
          history: (taskId: string) => request<ActivityItem[]>('GET', `${base}/tasks/${id(taskId)}/history`),
          comments: {
            list: (taskId: string, params: { cursor?: string; limit?: number } = {}) =>
              request<Page<TaskComment>>('GET', `${base}/tasks/${id(taskId)}/comments${qs(params)}`, { envelope: true }),
            add: (taskId: string, body: string) => request<TaskComment>('POST', `${base}/tasks/${id(taskId)}/comments`, { body: { body } }),
            edit: (taskId: string, commentId: string, body: string) =>
              request<TaskComment>('PATCH', `${base}/tasks/${id(taskId)}/comments/${id(commentId)}`, { body: { body } }),
            remove: (taskId: string, commentId: string) => request<void>('DELETE', `${base}/tasks/${id(taskId)}/comments/${id(commentId)}`),
          },
          attach: (taskId: string, fileId: string) => request<void>('POST', `${base}/tasks/${id(taskId)}/attachments`, { body: { fileId } }),
          detach: (taskId: string, fileId: string) => request<void>('DELETE', `${base}/tasks/${id(taskId)}/attachments/${id(fileId)}`),
        },

        files: {
          get: (fileId: string) => request<StoredFile>('GET', `${base}/files/${id(fileId)}`),
          /** A 60-second signed link; fetch it right away and never store it. */
          downloadUrl: (fileId: string) => request<{ url: string; expiresInSeconds: number }>('GET', `${base}/files/${id(fileId)}/download-url`),
          remove: (fileId: string) => request<void>('DELETE', `${base}/files/${id(fileId)}`),
          /** Request a signed URL, send the bytes straight to storage, then let the server verify them. */
          async upload(input: UploadInput): Promise<StoredFile> {
            const { file, upload } = await request<{ file: StoredFile; upload: UploadTarget }>('POST', `${base}/files/uploads`, {
              body: { fileName: input.fileName, mimeType: input.mimeType, sizeBytes: input.body.size, sensitivity: input.sensitivity },
            });
            let res: Response;
            try {
              // Storage is authorized by the signature alone: no cookies, no bearer token.
              res = await doFetch(upload.url, { method: upload.method, headers: upload.headers, body: input.body, credentials: 'omit' });
            } catch {
              throw new ApiError('NETWORK_ERROR', 0);
            }
            if (!res.ok) {
              let json: unknown;
              try {
                json = await res.json();
              } catch {
                json = undefined;
              }
              throw ApiError.fromBody(res.status, json);
            }
            return request<StoredFile>('POST', `${base}/files/${id(file.id)}/complete`);
          },
        },

        messaging: {
          contacts: (params: { q?: string; cursor?: string; limit?: number } = {}) => request<Page<MessagingContact>>('GET', `${base}/messaging/contacts${qs(params)}`, { envelope: true }),
          unreadCount: () => request<{ count: number }>('GET', `${base}/messaging/unread-count`),
          /** The moderation queue (needs `message.moderate`). */
          reports: {
            list: (params: { status?: ReportStatusKey; cursor?: string; limit?: number } = {}) => request<Page<MessageReport>>('GET', `${base}/messaging/reports${qs(params)}`, { envelope: true }),
            resolve: (reportId: string, input: { outcome: 'DISMISSED' | 'ACTIONED'; note?: string }) => request<MessageReport>('POST', `${base}/messaging/reports/${id(reportId)}/resolve`, { body: input }),
          },
          conversations: {
            list: () => request<Conversation[]>('GET', `${base}/messaging/conversations`),
            /** Find or create the conversation with one person. */
            start: (membershipId: string) => request<Conversation>('POST', `${base}/messaging/conversations`, { body: { membershipId } }),
            get: (conversationId: string) => request<Conversation>('GET', `${base}/messaging/conversations/${id(conversationId)}`),
            /** Newest first; page back with `meta.nextCursor`. */
            messages: (conversationId: string, params: { cursor?: string; limit?: number } = {}) =>
              request<Page<Message>>('GET', `${base}/messaging/conversations/${id(conversationId)}/messages${qs(params)}`, { envelope: true }),
            send: (conversationId: string, input: { body?: string; fileIds?: string[] }) =>
              request<Message>('POST', `${base}/messaging/conversations/${id(conversationId)}/messages`, { body: input }),
            read: (conversationId: string, messageId?: string) =>
              request<Conversation>('POST', `${base}/messaging/conversations/${id(conversationId)}/read`, { body: messageId ? { messageId } : {} }),
            mute: (conversationId: string, muted: boolean) => request<Conversation>('PUT', `${base}/messaging/conversations/${id(conversationId)}/mute`, { body: { muted } }),
            block: (conversationId: string, blocked: boolean) => request<Conversation>('PUT', `${base}/messaging/conversations/${id(conversationId)}/block`, { body: { blocked } }),
            /** Report a message you received. Only that message is shared with the people who review reports. */
            report: (conversationId: string, messageId: string, input: { reason: ReportReasonKey; note?: string }) =>
              request<{ id: string; status: 'OPEN' }>('POST', `${base}/messaging/conversations/${id(conversationId)}/messages/${id(messageId)}/report`, { body: input }),
            deleteMessage: (conversationId: string, messageId: string) => request<void>('DELETE', `${base}/messaging/conversations/${id(conversationId)}/messages/${id(messageId)}`),
          },
        },

        progress: {
          metrics: {
            list: () => request<MetricDefinition[]>('GET', `${base}/progress/metrics`),
            create: (input: { key: string; name: string; unit: string; precision?: number; higherIsBetter?: boolean }) =>
              request<MetricDefinition>('POST', `${base}/progress/metrics`, { body: input }),
          },
          records: {
            list: (params: { subjectMembershipId: string; metricId?: string; from?: string; to?: string; limit?: number }) =>
              request<MetricPoint[]>('GET', `${base}/progress/records${qs(params)}`),
            create: (input: { subjectMembershipId: string; metricId: string; value: number; recordedAt?: string }) =>
              request<{ id: string }>('POST', `${base}/progress/records`, { body: input }),
            void: (recordId: string, reason: string) => request<void>('POST', `${base}/progress/records/${id(recordId)}/void`, { body: { reason } }),
          },
          summary: (params: { subjectMembershipId: string; metricId: string; from?: string; to?: string }) =>
            request<MetricSummary>('GET', `${base}/progress/summary${qs(params)}`),
          goals: {
            list: (params: { subjectMembershipId: string; status?: Goal['status'] }) => request<Goal[]>('GET', `${base}/progress/goals${qs(params)}`),
            create: (input: CreateGoalInput) => request<Goal>('POST', `${base}/progress/goals`, { body: input }),
            update: (goalId: string, input: { title?: string; targetValue?: number; dueDate?: string; status?: 'ACTIVE' | 'ABANDONED' }) =>
              request<Goal>('PATCH', `${base}/progress/goals/${id(goalId)}`, { body: input }),
            addMilestone: (goalId: string, input: { title: string; targetValue?: number; dueDate?: string }) =>
              request<Milestone>('POST', `${base}/progress/goals/${id(goalId)}/milestones`, { body: input }),
            achieveMilestone: (goalId: string, milestoneId: string) =>
              request<void>('POST', `${base}/progress/goals/${id(goalId)}/milestones/${id(milestoneId)}/achieve`),
          },
          groupSummary: (groupId: string, metricId: string) =>
            request<GroupProgress>('GET', `${base}/progress/groups/${id(groupId)}/summary${qs({ metricId })}`),
        },

        /** The Fitness module: client profiles, exercise library, versioned workout plans, assignments and workout logs. */
        coaching: {
          sessions: {
            list: (params: { clientMembershipId?: string; status?: SessionStatus; from?: string; to?: string; order?: 'asc' | 'desc' } = {}) => request<CoachSession[]>('GET', `${base}/coaching/sessions${qs(params)}`),
            get: (sessionId: string) => request<CoachSession>('GET', `${base}/coaching/sessions/${id(sessionId)}`),
            create: (input: CreateSessionInput) => request<CoachSession>('POST', `${base}/coaching/sessions`, { body: input }),
            update: (sessionId: string, input: Partial<Omit<CreateSessionInput, 'clientMembershipId'>>) => request<CoachSession>('PATCH', `${base}/coaching/sessions/${id(sessionId)}`, { body: input }),
            cancel: (sessionId: string, reason?: string) => request<CoachSession>('POST', `${base}/coaching/sessions/${id(sessionId)}/cancel`, { body: { reason } }),
            complete: (sessionId: string) => request<CoachSession>('POST', `${base}/coaching/sessions/${id(sessionId)}/complete`),
          },
          notes: {
            list: (clientMembershipId: string, sessionId?: string) => request<CoachNote[]>('GET', `${base}/coaching/notes${qs({ clientMembershipId, sessionId })}`),
            create: (input: { clientMembershipId: string; sessionId?: string; visibility: NoteVisibility; body: string }) => request<CoachNote>('POST', `${base}/coaching/notes`, { body: input }),
            update: (noteId: string, input: { visibility?: NoteVisibility; body?: string }) => request<CoachNote>('PATCH', `${base}/coaching/notes/${id(noteId)}`, { body: input }),
            remove: (noteId: string) => request<void>('DELETE', `${base}/coaching/notes/${id(noteId)}`),
          },
          templates: {
            list: () => request<AssessmentTemplate[]>('GET', `${base}/coaching/assessment-templates`),
            create: (input: { name: string; description?: string; questions: AssessmentQuestion[] }) => request<AssessmentTemplate>('POST', `${base}/coaching/assessment-templates`, { body: input }),
            update: (templateId: string, input: { name?: string; description?: string; questions?: AssessmentQuestion[] }) => request<AssessmentTemplate>('PATCH', `${base}/coaching/assessment-templates/${id(templateId)}`, { body: input }),
            archive: (templateId: string) => request<void>('DELETE', `${base}/coaching/assessment-templates/${id(templateId)}`),
          },
          assessments: {
            list: (params: { clientMembershipId?: string; status?: CoachAssessment['status'] } = {}) => request<CoachAssessment[]>('GET', `${base}/coaching/assessments${qs(params)}`),
            get: (assessmentId: string) => request<CoachAssessment>('GET', `${base}/coaching/assessments/${id(assessmentId)}`),
            request: (input: { templateId: string; clientMembershipId: string; dueAt?: string; cadenceDays?: number }) => request<CoachAssessment>('POST', `${base}/coaching/assessments`, { body: input }),
            submit: (assessmentId: string, answers: AssessmentAnswers) => request<CoachAssessment>('POST', `${base}/coaching/assessments/${id(assessmentId)}/submit`, { body: { answers } }),
            cancel: (assessmentId: string) => request<CoachAssessment>('POST', `${base}/coaching/assessments/${id(assessmentId)}/cancel`),
            trends: (clientMembershipId: string) => request<TrendSeries[]>('GET', `${base}/coaching/assessments/trends${qs({ clientMembershipId })}`),
          },
          resources: {
            list: (clientMembershipId?: string) => request<CoachResource[]>('GET', `${base}/coaching/resources${qs({ clientMembershipId })}`),
            create: (input: { title: string; description?: string; url?: string; fileId?: string; clientMembershipId?: string }) => request<CoachResource>('POST', `${base}/coaching/resources`, { body: input }),
            archive: (resourceId: string) => request<void>('DELETE', `${base}/coaching/resources/${id(resourceId)}`),
          },
        },

        fitness: {
          exercises: {
            list: (params: { q?: string; muscleGroup?: MuscleGroupKey; equipment?: EquipmentKey; archived?: boolean } = {}) => request<Exercise[]>('GET', `${base}/fitness/exercises${qs(params)}`),
            create: (input: CreateExerciseInput) => request<Exercise>('POST', `${base}/fitness/exercises`, { body: input }),
            update: (exerciseId: string, input: Partial<CreateExerciseInput>) => request<Exercise>('PATCH', `${base}/fitness/exercises/${id(exerciseId)}`, { body: input }),
            archive: (exerciseId: string) => request<void>('DELETE', `${base}/fitness/exercises/${id(exerciseId)}`),
          },
          clients: {
            list: (params: { q?: string; cursor?: string; limit?: number } = {}) => request<Page<ClientSummary>>('GET', `${base}/fitness/clients${qs(params)}`, { envelope: true }),
            get: (membershipId: string) => request<ClientDetail>('GET', `${base}/fitness/clients/${id(membershipId)}`),
            updateProfile: (membershipId: string, input: UpdateClientProfileInput) => request<ClientDetail>('PUT', `${base}/fitness/clients/${id(membershipId)}/profile`, { body: input }),
          },
          plans: {
            list: (params: { q?: string; archived?: boolean; cursor?: string; limit?: number } = {}) => request<Page<PlanSummary>>('GET', `${base}/fitness/plans${qs(params)}`, { envelope: true }),
            get: (planId: string) => request<PlanDetail>('GET', `${base}/fitness/plans/${id(planId)}`),
            create: (input: { name: string; description?: string }) => request<PlanDetail>('POST', `${base}/fitness/plans`, { body: input }),
            update: (planId: string, input: { name?: string; description?: string }) => request<PlanDetail>('PATCH', `${base}/fitness/plans/${id(planId)}`, { body: input }),
            archive: (planId: string) => request<void>('DELETE', `${base}/fitness/plans/${id(planId)}`),
            getVersion: (planId: string, versionId: string) => request<PlanVersion>('GET', `${base}/fitness/plans/${id(planId)}/versions/${id(versionId)}`),
            /** Replaces the content of a draft version. Published versions are immutable (PLAN_VERSION_LOCKED). */
            saveContent: (planId: string, versionId: string, content: PlanContentInput) =>
              request<PlanVersion>('PUT', `${base}/fitness/plans/${id(planId)}/versions/${id(versionId)}/content`, { body: content }),
            publish: (planId: string, versionId: string) => request<PlanDetail>('POST', `${base}/fitness/plans/${id(planId)}/versions/${id(versionId)}/publish`),
            createVersion: (planId: string, fromVersionId?: string) => request<PlanVersion>('POST', `${base}/fitness/plans/${id(planId)}/versions`, { body: fromVersionId ? { fromVersionId } : {} }),
            discardDraft: (planId: string, versionId: string) => request<void>('DELETE', `${base}/fitness/plans/${id(planId)}/versions/${id(versionId)}`),
            assign: (planId: string, input: CreateAssignmentsInput) =>
              request<{ batchId: string; assignments: { id: string; clientMembershipId: string }[]; skipped: number }>('POST', `${base}/fitness/plans/${id(planId)}/assignments`, { body: input }),
          },
          assignments: {
            list: (params: { clientMembershipId?: string; status?: 'ACTIVE' | 'CANCELLED'; cursor?: string; limit?: number } = {}) =>
              request<Page<AssignmentItem>>('GET', `${base}/fitness/assignments${qs(params)}`, { envelope: true }),
            get: (assignmentId: string) => request<AssignmentDetail>('GET', `${base}/fitness/assignments/${id(assignmentId)}`),
            cancel: (assignmentId: string) => request<void>('POST', `${base}/fitness/assignments/${id(assignmentId)}/cancel`),
          },
          workouts: {
            today: () => request<TodayView>('GET', `${base}/fitness/workouts/today`),
          },
          nutrition: {
            plans: {
              list: (params: { q?: string; archived?: boolean; cursor?: string; limit?: number } = {}) => request<Page<PlanSummary>>('GET', `${base}/fitness/nutrition-plans${qs(params)}`, { envelope: true }),
              get: (planId: string) => request<PlanDetail>('GET', `${base}/fitness/nutrition-plans/${id(planId)}`),
              create: (input: { name: string; description?: string }) => request<PlanDetail>('POST', `${base}/fitness/nutrition-plans`, { body: input }),
              update: (planId: string, input: { name?: string; description?: string }) => request<PlanDetail>('PATCH', `${base}/fitness/nutrition-plans/${id(planId)}`, { body: input }),
              archive: (planId: string) => request<void>('DELETE', `${base}/fitness/nutrition-plans/${id(planId)}`),
              getVersion: (planId: string, versionId: string) => request<NutritionVersion>('GET', `${base}/fitness/nutrition-plans/${id(planId)}/versions/${id(versionId)}`),
              saveContent: (planId: string, versionId: string, content: NutritionContentInput) => request<NutritionVersion>('PUT', `${base}/fitness/nutrition-plans/${id(planId)}/versions/${id(versionId)}/content`, { body: content }),
              publish: (planId: string, versionId: string) => request<PlanDetail>('POST', `${base}/fitness/nutrition-plans/${id(planId)}/versions/${id(versionId)}/publish`),
              createVersion: (planId: string, fromVersionId?: string) => request<NutritionVersion>('POST', `${base}/fitness/nutrition-plans/${id(planId)}/versions`, { body: fromVersionId ? { fromVersionId } : {} }),
              discardDraft: (planId: string, versionId: string) => request<void>('DELETE', `${base}/fitness/nutrition-plans/${id(planId)}/versions/${id(versionId)}`),
              assign: (planId: string, input: { versionId?: string; clientMembershipIds?: string[]; groupIds?: string[]; startDate: string; endDate?: string }) =>
                request<{ batchId: string; assignments: { id: string; clientMembershipId: string }[]; skipped: number }>('POST', `${base}/fitness/nutrition-plans/${id(planId)}/assignments`, { body: input }),
            },
            assignments: {
              list: (params: { clientMembershipId?: string; status?: 'ACTIVE' | 'CANCELLED'; cursor?: string; limit?: number } = {}) =>
                request<Page<NutritionAssignmentItem>>('GET', `${base}/fitness/nutrition/assignments${qs(params)}`, { envelope: true }),
              get: (assignmentId: string) => request<NutritionAssignmentDetail>('GET', `${base}/fitness/nutrition/assignments/${id(assignmentId)}`),
              cancel: (assignmentId: string) => request<void>('POST', `${base}/fitness/nutrition/assignments/${id(assignmentId)}/cancel`),
            },
            today: (date?: string) => request<NutritionToday>('GET', `${base}/fitness/nutrition/today${qs({ date })}`),
            logMeal: (input: { assignmentId: string; mealId: string; logDate?: string; status: MealLogStatusKey; notes?: string | null }) => request<MealLog>('PUT', `${base}/fitness/nutrition/logs`, { body: input }),
            attachMealPhoto: (mealLogId: string, fileId: string) => request<MealLog>('POST', `${base}/fitness/nutrition/logs/${id(mealLogId)}/photos`, { body: { fileId } }),
            detachMealPhoto: (mealLogId: string, fileId: string) => request<MealLog>('DELETE', `${base}/fitness/nutrition/logs/${id(mealLogId)}/photos/${id(fileId)}`),
            logs: (params: { clientMembershipId?: string; from: string; to: string }) => request<MealLogRange>('GET', `${base}/fitness/nutrition/logs${qs(params)}`),
          },
          checkins: {
            /** The signed-in client's form for "current" or "previous" week. */
            week: (which: 'current' | 'previous') => request<CheckinWeek>('GET', `${base}/fitness/checkins/week/${which}`),
            saveWeek: (which: 'current' | 'previous', input: SaveCheckinInput) => request<Checkin>('PUT', `${base}/fitness/checkins/week/${which}`, { body: input }),
            submit: (checkinId: string) => request<Checkin>('POST', `${base}/fitness/checkins/${id(checkinId)}/submit`),
            list: (params: { clientMembershipId?: string; status?: CheckinStatusKey; cursor?: string; limit?: number } = {}) => request<Page<CheckinSummary>>('GET', `${base}/fitness/checkins${qs(params)}`, { envelope: true }),
            get: (checkinId: string) => request<Checkin>('GET', `${base}/fitness/checkins/${id(checkinId)}`),
            review: (checkinId: string, feedback?: string) => request<Checkin>('POST', `${base}/fitness/checkins/${id(checkinId)}/review`, { body: feedback ? { feedback } : {} }),
            comment: (checkinId: string, body: string) => request<Checkin>('POST', `${base}/fitness/checkins/${id(checkinId)}/comments`, { body: { body } }),
            compare: (from: string, to: string) => request<CheckinComparison>('GET', `${base}/fitness/checkins/compare${qs({ from, to })}`),
          },
          photos: {
            /** Attach an uploaded SENSITIVE image (upload it with `files.upload({ sensitivity: 'SENSITIVE' })` first). */
            add: (input: { fileId: string; angle: PhotoAngleKey; kind: PhotoKindKey; checkinId?: string; takenOn?: string }) => request<Checkin | ProgressPhoto[]>('POST', `${base}/fitness/photos`, { body: input }),
            remove: (photoId: string) => request<void>('DELETE', `${base}/fitness/photos/${id(photoId)}`),
            forClient: (membershipId: string) => request<ProgressPhoto[]>('GET', `${base}/fitness/clients/${id(membershipId)}/photos`),
          },
          sessions: {
            /** Starts or resumes the session for a plan day (idempotent per assignment, day and date). */
            start: (input: { assignmentId: string; dayId: string; scheduledDate?: string }) => request<SessionDetail>('POST', `${base}/fitness/sessions`, { body: input }),
            list: (params: { clientMembershipId?: string; cursor?: string; limit?: number } = {}) => request<Page<SessionSummary>>('GET', `${base}/fitness/sessions${qs(params)}`, { envelope: true }),
            get: (sessionId: string) => request<SessionDetail>('GET', `${base}/fitness/sessions/${id(sessionId)}`),
            logSet: (sessionId: string, input: { dayExerciseId: string; setNo: number; repsDone: number; weightKg?: number | null }) =>
              request<SessionDetail>('PUT', `${base}/fitness/sessions/${id(sessionId)}/sets`, { body: input }),
            removeSet: (sessionId: string, dayExerciseId: string, setNo: number) =>
              request<SessionDetail>('DELETE', `${base}/fitness/sessions/${id(sessionId)}/sets/${id(dayExerciseId)}/${setNo}`),
            complete: (sessionId: string, input: { rpe?: number; notes?: string } = {}) => request<SessionDetail>('POST', `${base}/fitness/sessions/${id(sessionId)}/complete`, { body: input }),
          },
        },

        roles: {
          list: () => request<RoleDetail[]>('GET', `${base}/roles`),
          assignable: () => request<AssignableRole[]>('GET', `${base}/assignable-roles`),
          permissions: () => request<PermissionDefinition[]>('GET', `${base}/permissions`),
          create: (input: RoleInput) => request<RoleDetail>('POST', `${base}/roles`, { body: input }),
          update: (roleId: string, input: Partial<RoleInput>) => request<RoleDetail>('PATCH', `${base}/roles/${id(roleId)}`, { body: input }),
          remove: (roleId: string) => request<void>('DELETE', `${base}/roles/${id(roleId)}`),
        },
      };
    },

    /** Platform administration (/admin): platform role + verified two-factor authentication required. */
    admin: {
      stats: () => request<AdminStats>('GET', '/admin/stats'),
      health: () => request<AdminHealth>('GET', '/admin/health'),
      users: {
        list: (params: { q?: string; status?: AdminUser['status']; cursor?: string; limit?: number } = {}) =>
          request<Page<AdminUser>>('GET', `/admin/users${qs(params)}`, { envelope: true }),
        get: (userId: string) => request<AdminUserDetail>('GET', `/admin/users/${id(userId)}`),
        suspend: (userId: string) => request<AdminUserDetail>('POST', `/admin/users/${id(userId)}/suspend`),
        activate: (userId: string) => request<AdminUserDetail>('POST', `/admin/users/${id(userId)}/activate`),
      },
      organizations: {
        list: (params: { q?: string; status?: Organization['status']; categoryKey?: string; cursor?: string; limit?: number } = {}) =>
          request<Page<AdminOrganization>>('GET', `/admin/organizations${qs(params)}`, { envelope: true }),
        get: (orgId: string) => request<AdminOrganizationDetail>('GET', `/admin/organizations/${id(orgId)}`),
        suspend: (orgId: string) => request<AdminOrganizationDetail>('POST', `/admin/organizations/${id(orgId)}/suspend`),
        activate: (orgId: string) => request<AdminOrganizationDetail>('POST', `/admin/organizations/${id(orgId)}/activate`),
      },
      categories: {
        list: () => request<CatalogEntry[]>('GET', '/admin/categories'),
        setStatus: (key: string, status: CatalogEntry['status']) => request<CatalogEntry>('PATCH', `/admin/categories/${id(key)}`, { body: { status } }),
      },
      modules: {
        list: () => request<CatalogEntry[]>('GET', '/admin/modules'),
        setStatus: (key: string, status: CatalogEntry['status']) => request<CatalogEntry>('PATCH', `/admin/modules/${id(key)}`, { body: { status } }),
      },
      platformRoles: {
        list: () => request<PlatformRoleInfo[]>('GET', '/admin/platform-roles'),
        grant: (userId: string) => request<PlatformRoleInfo[]>('POST', '/admin/platform-roles', { body: { userId, roleKey: 'super_admin' } }),
        revoke: (userId: string) => request<PlatformRoleInfo[]>('DELETE', '/admin/platform-roles', { body: { userId, roleKey: 'super_admin' } }),
      },
      audit: (params: { organizationId?: string; actorUserId?: string; action?: string; cursor?: string; limit?: number } = {}) =>
        request<Page<AuditEntry>>('GET', `/admin/audit-logs${qs(params)}`, { envelope: true }),
      flags: {
        list: () => request<AdminFeatureFlag[]>('GET', '/admin/flags'),
        set: (key: string, enabled: boolean) => request<AdminFeatureFlag>('PUT', `/admin/flags/${id(key)}`, { body: { enabled } }),
        forOrganization: (orgId: string) => request<AdminOrgFeatureFlag[]>('GET', `/admin/organizations/${id(orgId)}/flags`),
        /** `null` removes the override. */
        setForOrganization: (orgId: string, key: string, enabled: boolean | null) =>
          request<AdminOrgFeatureFlag>('PUT', `/admin/organizations/${id(orgId)}/flags/${id(key)}`, { body: { enabled } }),
      },
      settings: {
        get: () => request<AdminSettings>('GET', '/admin/settings'),
        saveIdentity: (body: DeepPartial<IdentitySettings>) => request<IdentitySettings>('PUT', '/admin/settings/identity', { body }),
        saveMail: (body: DeepPartial<MailBrandSettings>) => request<MailBrandSettings>('PUT', '/admin/settings/mail', { body }),
        setLogo: (mimeType: string, dataBase64: string) => request<AdminSettings['logo']>('PUT', '/admin/settings/logo', { body: { mimeType, data: dataBase64 } }),
        removeLogo: () => request<void>('DELETE', '/admin/settings/logo'),
      },
      designs: {
        list: () => request<AdminDesign[]>('GET', '/admin/designs'),
        get: (key: string) => request<AdminDesign>('GET', `/admin/designs/${id(key)}`),
        /** `basedOn` copies an existing design (the default when omitted); the patch changes what you name. */
        create: (input: DesignPatch & { basedOn?: string }) => request<AdminDesign>('POST', '/admin/designs', { body: input }),
        update: (key: string, patch: DesignPatch) => request<AdminDesign>('PATCH', `/admin/designs/${id(key)}`, { body: patch }),
        reset: (key: string) => request<AdminDesign>('POST', `/admin/designs/${id(key)}/reset`),
        remove: (key: string) => request<void>('DELETE', `/admin/designs/${id(key)}`),
        setDefault: (key: string) => request<AdminDesign[]>('PUT', '/admin/design-default', { body: { key } }),
        forOrganization: (orgId: string) => request<{ themeKey: string | null; default: string }>('GET', `/admin/organizations/${id(orgId)}/design`),
        /** `null` returns the organization to the platform default. */
        setForOrganization: (orgId: string, key: string | null) => request<{ themeKey: string | null; default: string }>('PUT', `/admin/organizations/${id(orgId)}/design`, { body: { key } }),
      },
      emailTemplates: {
        list: () => request<AdminEmailTemplateRow[]>('GET', '/admin/email-templates'),
        get: (key: string, locale: string) => request<AdminEmailTemplate>('GET', `/admin/email-templates/${id(key)}/${id(locale)}`),
        save: (key: string, locale: string, body: MailTemplateText) => request<AdminEmailTemplate>('PUT', `/admin/email-templates/${id(key)}/${id(locale)}`, { body }),
        reset: (key: string, locale: string) => request<AdminEmailTemplate>('DELETE', `/admin/email-templates/${id(key)}/${id(locale)}`),
        preview: (key: string, locale: string, body: MailTemplateText) => request<RenderedEmail>('POST', `/admin/email-templates/${id(key)}/${id(locale)}/preview`, { body }),
        test: (key: string, locale: string, body: MailTemplateText) => request<{ sentTo: string }>('POST', `/admin/email-templates/${id(key)}/${id(locale)}/test`, { body }),
      },
    },

    /** What anyone may know before signing in: name, theme, logo, whether sign-up is open. */
    config: {
      public: () => request<PublicConfig>('GET', '/config/public', { auth: false }),
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
