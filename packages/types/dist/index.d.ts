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
    kids: {
        id: string;
        name: string;
    }[];
}
export interface Session {
    id: string;
    tenantId: string;
    name: string;
    date: string;
    time: string;
    endTime: string | null;
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
export interface CoParentInvite {
    id: string;
    tenantId: string;
    familyId: string;
    inviteToken: string;
    invitedByParentId: string | null;
    acceptedAt: string | null;
    createdAt: string;
}
export interface ApiKeyInfo {
    exists: boolean;
    createdAt?: string;
    revokedAt?: string;
}
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
export type AuthContext = ManagerAuthContext | SuperadminAuthContext | ParentAuthContext | ApiKeyAuthContext;
export type AuthContextType = AuthContext['type'];
export type JwtRole = 'manager' | 'superadmin';
export interface JwtClaims {
    role: JwtRole;
    tenant_id?: string;
}
export declare const ErrorCode: {
    readonly VALIDATION: "validation_error";
    readonly UNAUTHORIZED: "unauthorized";
    readonly FORBIDDEN: "forbidden";
    readonly ROLE_MISMATCH: "role_mismatch";
    readonly NOT_FOUND: "not_found";
    readonly CONFLICT: "conflict";
    readonly TEAM_INACTIVE: "team_inactive";
    readonly INTERNAL: "internal_error";
};
export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];
export interface ApiError {
    error: {
        code: ErrorCodeValue;
        message: string;
    };
}
