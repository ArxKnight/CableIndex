import nodemailer from 'nodemailer';
import connection from '../database/connection.js';

export type InviteEmailSendResult = {
  email_sent: boolean;
  email_error?: string;
};

type SmtpConfig = {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
  secure: boolean;
  source: 'env' | 'db';
};

const parseBool = (value: unknown): boolean | undefined => {
  if (value === undefined || value === null) return undefined;
  const trimmed = String(value).trim().toLowerCase();
  if (trimmed === '') return undefined;
  if (trimmed === 'true' || trimmed === '1' || trimmed === 'yes') return true;
  if (trimmed === 'false' || trimmed === '0' || trimmed === 'no') return false;
  return undefined;
};

const loadSmtpConfig = async (): Promise<SmtpConfig | null> => {
  // 1) Prefer environment variables when present (production-friendly)
  const envHost = process.env.SMTP_HOST && String(process.env.SMTP_HOST).trim();
  const envPortRaw = process.env.SMTP_PORT && String(process.env.SMTP_PORT).trim();
  const envUser = process.env.SMTP_USER && String(process.env.SMTP_USER).trim();
  const envPass = process.env.SMTP_PASS && String(process.env.SMTP_PASS).trim();
  const envFrom = process.env.SMTP_FROM && String(process.env.SMTP_FROM).trim();
  const envSecure = parseBool(process.env.SMTP_SECURE);

  if (envHost && envPortRaw && envUser && envPass && envFrom) {
    const port = Number(envPortRaw);
    if (Number.isFinite(port) && port > 0) {
      const secure = envSecure ?? port === 465;
      return { host: envHost, port, user: envUser, pass: envPass, from: envFrom, secure, source: 'env' };
    }
  }

  // 2) Fall back to DB settings (Admin Settings UI)
  const keyCol = '`key`';

  const keys = ['smtp_host', 'smtp_port', 'smtp_username', 'smtp_password', 'smtp_from', 'smtp_secure'] as const;
  const placeholders = keys.map(() => '?').join(', ');

  try {
    const adapter = connection.getAdapter();
    const rows = await adapter.query(
      `SELECT ${keyCol} AS setting_key, value AS setting_value
       FROM app_settings
       WHERE ${keyCol} IN (${placeholders})`,
      [...keys]
    );

    const map = new Map<string, string>();
    for (const row of rows as any[]) {
      if (row?.setting_key) {
        map.set(String(row.setting_key), String(row.setting_value ?? ''));
      }
    }

    const host = (map.get('smtp_host') || '').trim();
    const port = Number((map.get('smtp_port') || '').trim());
    const user = (map.get('smtp_username') || '').trim();
    const pass = (map.get('smtp_password') || '').trim();
    const from = (map.get('smtp_from') || '').trim();
    const secureFromDb = parseBool(map.get('smtp_secure'));

    if (!host || !Number.isFinite(port) || port <= 0 || !user || !pass || !from) {
      return null;
    }

    const secure = secureFromDb ?? port === 465;
    return { host, port, user, pass, from, secure, source: 'db' };
  } catch {
    return null;
  }
};

export const isSmtpConfigured = async (): Promise<boolean> => {
  return (await loadSmtpConfig()) !== null;
};

export const buildInviteUrl = (token: string, baseUrl: string): string => {
  const trimmedBase = (baseUrl || '').trim().replace(/\/+$/, '');
  return `${trimmedBase}/auth/register?token=${encodeURIComponent(token)}`;
};

export const buildPasswordResetUrl = (token: string, baseUrl: string): string => {
  const trimmedBase = (baseUrl || '').trim().replace(/\/+$/, '');
  return `${trimmedBase}/auth/reset-password?token=${encodeURIComponent(token)}`;
};

export const sendPasswordResetEmailIfConfigured = async (params: {
  to: string;
  username: string;
  requesterName: string;
  resetUrl: string;
  expiresAtIso: string;
}): Promise<InviteEmailSendResult> => {
  const smtp = await loadSmtpConfig();
  if (!smtp) {
    return { email_sent: false, email_error: 'SMTP not configured' };
  }

  try {
    const transport = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: { user: smtp.user, pass: smtp.pass },
    });

    const subject = 'CableIndex password reset';
    const text =
      `Hi ${params.username},\n\n` +
      `${params.requesterName} requested a password reset for your CableIndex account.\n\n` +
      `Reset your password here:\n${params.resetUrl}\n\n` +
      `This link expires at: ${params.expiresAtIso}\n`;

    const html = `
      <p>Hi ${escapeHtml(params.username)},</p>
      <p><strong>${escapeHtml(params.requesterName)}</strong> requested a password reset for your CableIndex account.</p>
      <p>
        Reset your password here:<br />
        <a href="${escapeHtmlAttr(params.resetUrl)}">${escapeHtml(params.resetUrl)}</a>
      </p>
      <p>This link expires at: ${escapeHtml(params.expiresAtIso)}</p>
    `;

    await transport.sendMail({
      from: smtp.from,
      to: params.to,
      subject,
      text,
      html,
    });

    return { email_sent: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown SMTP error';
    return { email_sent: false, email_error: message };
  }
};

export const sendInviteEmailIfConfigured = async (params: {
  to: string;
  inviteeName: string;
  inviterName: string;
  inviteUrl: string;
  expiresAtIso: string;
}): Promise<InviteEmailSendResult> => {
  const smtp = await loadSmtpConfig();
  if (!smtp) {
    return { email_sent: false, email_error: 'SMTP not configured' };
  }

  try {
    const transport = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: { user: smtp.user, pass: smtp.pass },
    });

    const subject = 'You have been invited to CableIndex';
    const text =
      `Hi ${params.inviteeName},\n\n` +
      `${params.inviterName} invited you to CableIndex.\n\n` +
      `Complete your invitation here:\n${params.inviteUrl}\n\n` +
      `This invitation expires at: ${params.expiresAtIso}\n`;

    const html = `
      <p>Hi ${escapeHtml(params.inviteeName)},</p>
      <p><strong>${escapeHtml(params.inviterName)}</strong> invited you to CableIndex.</p>
      <p>
        Complete your invitation here:<br />
        <a href="${escapeHtmlAttr(params.inviteUrl)}">${escapeHtml(params.inviteUrl)}</a>
      </p>
      <p>This invitation expires at: ${escapeHtml(params.expiresAtIso)}</p>
    `;

    await transport.sendMail({
      from: smtp.from,
      to: params.to,
      subject,
      text,
      html,
    });

    return { email_sent: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown SMTP error';
    return { email_sent: false, email_error: message };
  }
};

export const sendTestEmailIfConfigured = async (params: {
  to: string;
}): Promise<InviteEmailSendResult> => {
  const smtp = await loadSmtpConfig();
  if (!smtp) {
    return { email_sent: false, email_error: 'SMTP not configured' };
  }

  try {
    const transport = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: { user: smtp.user, pass: smtp.pass },
    });

    await transport.sendMail({
      from: smtp.from,
      to: params.to,
      subject: 'CableIndex SMTP test email',
      text: 'This is a test email from CableIndex. Your SMTP settings appear to be working.',
    });

    return { email_sent: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown SMTP error';
    return { email_sent: false, email_error: message };
  }
};

const escapeHtml = (value: string): string => {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

const escapeHtmlAttr = (value: string): string => {
  return escapeHtml(value).replace(/`/g, '&#096;');
};
