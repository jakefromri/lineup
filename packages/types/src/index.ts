// ─── Tenants / Teams ─────────────────────────────────────────────────────────

export type TenantStatus = 'active' | 'inactive';

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  joinToken: string;
  status: TenantStatus;
  createdAt: string;
}

export interface TenantSummary {
  id: string;
  name: string;
  slug: string;
  status: TenantStatus;
  managerCount: number;
  parentCount: number;
}

// ─── Memberships (managers) ─────────────────────────────────────────────────

export type MembershipRole = 'manager';

export interface Membership {
  id: string;
  tenantId: string;
  userId: string | null;
  role: MembershipRole;
  inviteToken: string | null;
  invitedAt: string;
  acceptedAt: string | null;
}

export interface ManagerSummary {
  id: string;
  email: string;
  acceptedAt: string | null;
}

// ─── Parents & Kids ──────────────────────────────────────────────────────────

export interface Parent {
  id: string;
  tenantId: string;
  name: string;
  contactEmail: string | null;
  contactPhone: string | null;
  createdAt: string;
}

export interface Kid {
  id: string;
  tenantId: string;
  parentId: string;
  name: string;
  archivedAt: string | null;
  createdAt: string;
}

export interface RosterEntry {
  id: string;
  name: string;
  contactEmail: string | null;
  contactPhone: string | null;
  kids: { id: string; name: string }[];
}

// ─── Sessions & Attendance ───────────────────────────────────────────────────

export interface Session {
  id: string;
  tenantId: string;
  name: string;
  date: string; // YYYY-MM-DD, local wall-clock, no timezone conversion
  time: string; // HH:MM:SS, local wall-clock, no timezone conversion
  endTime: string | null; // HH:MM:SS, optional
  location: string;
  createdAt: string;
  updatedAt: string;
}

export type AttendanceStatus = 'attending' | 'not_attending' | 'no_response';

export interface AttendanceEntry {
  kidId: string;
  kidName: string;
  status: AttendanceStatus;
}

export interface SessionWithAttendance {
  id: string;
  name: string;
  date: string;
  time: string;
  endTime: string | null;
  location: string;
  attendance: AttendanceEntry[];
}

// ─── Announcements ───────────────────────────────────────────────────────────

export interface AnnouncementReaction {
  emoji: string;
  count: number;
  reactedByMe: boolean;
}

export interface Announcement {
  id: string;
  authorName: string;
  bodyHtml: string;
  createdAt: string;
  updatedAt: string;
  reactions: AnnouncementReaction[];
}

// ─── Co-parents & Families ──────────────────────────────────────────────────

export interface CoParentInvite {
  id: string;
  tenantId: string;
  familyId: string;
  inviteToken: string;
  invitedByParentId: string | null;
  acceptedAt: string | null;
  createdAt: string;
}

// ─── API Keys ────────────────────────────────────────────────────────────────

export interface ApiKeyInfo {
  exists: boolean;
  createdAt?: string;
  revokedAt?: string;
}

// ─── Auth Contexts ───────────────────────────────────────────────────────────
// Produced by the api's resolveAuthContext middleware. Every handler derives
// tenant_id from this context — never from the request body/query/params
// (except the public join/invite-accept endpoints, which resolve tenant_id
// from the token in the URL path).

export interface ManagerAuthContext {
  type: 'manager';
  tenantId: string;
  userId: string;
  membershipId: string;
}

export interface SuperadminAuthContext {
  type: 'superadmin';
  userId: string;
}

export interface ParentAuthContext {
  type: 'parent';
  tenantId: string;
  parentId: string;
}

export interface ApiKeyAuthContext {
  type: 'apikey';
  tenantId: string;
}

export type AuthContext =
  | ManagerAuthContext
  | SuperadminAuthContext
  | ParentAuthContext
  | ApiKeyAuthContext;

export type AuthContextType = AuthContext['type'];

// ─── JWT claims (Supabase app_metadata) ─────────────────────────────────────
// IDs/role only — no slugs or names.

export type JwtRole = 'manager' | 'superadmin';

export interface JwtClaims {
  role: JwtRole;
  tenant_id?: string;
}

// ─── Errors ──────────────────────────────────────────────────────────────────

export const ErrorCode = {
  VALIDATION: 'validation_error',
  UNAUTHORIZED: 'unauthorized',
  FORBIDDEN: 'forbidden',
  ROLE_MISMATCH: 'role_mismatch',
  NOT_FOUND: 'not_found',
  CONFLICT: 'conflict',
  TEAM_INACTIVE: 'team_inactive',
  INTERNAL: 'internal_error',
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];

export interface ApiError {
  error: {
    code: ErrorCodeValue;
    message: string;
  };
}
