import connection from '../database/connection.js';

export type ActivityAction =
  | 'LABEL_CREATED'
  | 'LABELS_CREATED'
  | 'LABEL_UPDATED'
  | 'LABEL_DELETED'
  | 'LABELS_DELETED'
  | 'LABEL_ZPL_GENERATED'
  | 'LABELS_ZPL_GENERATED'
  | 'LABELS_ZPL_RANGE_GENERATED'
  | 'PORT_LABELS_ZPL_GENERATED'
  | 'PDU_LABELS_ZPL_GENERATED'
  | 'LOCATION_CREATED'
  | 'LOCATION_UPDATED'
  | 'LOCATION_DELETED'
  | 'LOCATION_REASSIGNED_AND_DELETED'
  | 'SITE_CREATED'
  | 'SITE_UPDATED'
  | 'SITE_DELETED'
  | 'CABLE_TYPE_CREATED'
  | 'CABLE_TYPE_UPDATED'
  | 'CABLE_TYPE_DELETED'
  | 'CABLE_REPORT_DOWNLOADED'
  | 'USER_GLOBAL_ROLE_CHANGED'
  | 'USER_SITE_ACCESS_CHANGED'
  | 'USER_UPDATED'
  | 'USER_DELETED'
  | 'INVITATION_CREATED'
  | 'INVITATION_LINK_ROTATED'
  | 'INVITATION_RESENT'
  | 'INVITATION_CANCELLED'
  | 'INVITATION_ACCEPTED'
  | 'ADMIN_SETTINGS_UPDATED'
  | 'ADMIN_SETTINGS_TEST_EMAIL_SENT'
  | 'PROFILE_UPDATED'
  | 'PASSWORD_CHANGED'
  | 'LOGOUT';

export interface LogActivityParams {
  actorUserId: number;
  action: ActivityAction;
  summary: string;
  siteId?: number | null;
  metadata?: unknown;
}

export async function logActivity(params: LogActivityParams): Promise<void> {
  if (!Number.isFinite(params.actorUserId) || params.actorUserId <= 0) return;
  if (!connection.isConnected()) return;

  const metadataJson = params.metadata === undefined ? null : JSON.stringify(params.metadata);

  await connection.getAdapter().execute(
    `INSERT INTO activity_log (actor_user_id, site_id, action, summary, metadata_json)
     VALUES (?, ?, ?, ?, ?)`,
    [
      params.actorUserId,
      params.siteId ?? null,
      params.action,
      params.summary,
      metadataJson,
    ]
  );
}
