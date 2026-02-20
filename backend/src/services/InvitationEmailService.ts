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

const getLogoUrlFromEnv = (): string | null => {
  const raw = (process.env.LOGO_URL ?? process.env.SMTP_LOGO_URL ?? '').trim();
  if (!raw) return null;
  if (!raw.toLowerCase().startsWith('https://')) return null;
  return raw;
};

const safeGetDomainFromUrl = (urlString: string): string => {
  try {
    const url = new URL(urlString);
    return url.host;
  } catch {
    return '';
  }
};

export const formatExpiryUTC = (expiresAtIso: string): string => {
  try {
    const date = new Date(expiresAtIso);
    if (Number.isNaN(date.getTime())) return expiresAtIso;

    const formatted = date.toLocaleString('en-GB', {
      timeZone: 'UTC',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    return `${formatted} UTC`;
  } catch {
    return expiresAtIso;
  }
};

const buildBrandedEmailHtml = (params: {
  label: 'Invitation' | 'Password reset';
  greetingName: string;
  introLine: string;
  actionText: string;
  actionUrl: string;
  expiryLine: string;
  domainText: string;
}): string => {
  const logoUrl = getLogoUrlFromEnv();

  const headerLeft = logoUrl
    ? `<img src="${escapeHtmlAttr(logoUrl)}" alt="InfraDB" style="display:block; height:24px; max-height:24px; width:auto;" />`
    : `<span style="font-size:16px; font-weight:700; color:#ffffff; letter-spacing:0.2px;">InfraDB</span>`;

  const escapedActionUrlAttr = escapeHtmlAttr(params.actionUrl);
  const escapedActionUrlText = escapeHtml(params.actionUrl);

  const footerDomain = params.domainText ? escapeHtml(params.domainText) : '';
  const footerDomainLine = footerDomain
    ? `<p style="margin:0; font-size:12px; color:#64748b;">${footerDomain}</p>`
    : '';

  return `
  <!doctype html>
  <html lang="en">
    <head>
      <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>${escapeHtml(params.label)}</title>
    </head>
    <body style="margin:0; padding:0; background-color:#f6f8fb;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#f6f8fb; padding:24px 0;">
        <tr>
          <td align="center" style="padding:0 12px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:100%; max-width:600px;">
              <tr>
                <td style="background-color:#0b1020; padding:16px 20px; border-radius:12px 12px 0 0;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                    <tr>
                      <td align="left" style="vertical-align:middle;">${headerLeft}</td>
                      <td align="right" style="vertical-align:middle;">
                        <span style="display:inline-block; padding:4px 10px; border:1px solid rgba(255,255,255,0.25); border-radius:999px; font-size:12px; color:#e2e8f0;">${escapeHtml(
                          params.label
                        )}</span>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td style="background-color:#ffffff; padding:22px 20px; border-radius:0 0 12px 12px; box-shadow:0 8px 24px rgba(15,23,42,0.08);">
                  <p style="margin:0 0 12px 0; font-size:14px; color:#0f172a;">Hi ${escapeHtml(params.greetingName)},</p>
                  <p style="margin:0 0 16px 0; font-size:14px; color:#334155;">${escapeHtml(params.introLine)}</p>

                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0 18px 0;">
                    <tr>
                      <td align="center" bgcolor="#2563eb" style="border-radius:10px;">
                        <a href="${escapedActionUrlAttr}" style="display:inline-block; padding:12px 18px; font-size:14px; font-weight:600; color:#ffffff; text-decoration:none; border-radius:10px;">${escapeHtml(
                          params.actionText
                        )}</a>
                      </td>
                    </tr>
                  </table>

                  <p style="margin:0 0 10px 0; font-size:13px; color:#334155;">${escapeHtml(params.expiryLine)}</p>

                  <div style="margin-top:18px; padding-top:14px; border-top:1px solid #e2e8f0;">
                    <p style="margin:0 0 6px 0; font-size:12px; color:#475569;"><strong>Button not working?</strong> Copy and paste this URL into your browser:</p>
                    <p style="margin:0; font-size:12px; color:#2563eb; word-break:break-word;">
                      <a href="${escapedActionUrlAttr}" style="color:#2563eb; text-decoration:underline;">${escapedActionUrlText}</a>
                    </p>
                  </div>

                  <div style="margin-top:18px; padding-top:14px; border-top:1px solid #e2e8f0;">
                    <p style="margin:0 0 4px 0; font-size:12px; color:#475569;">— InfraDB Access Team</p>
                    ${footerDomainLine}
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
  </html>
  `;
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

    const subject = 'InfraDB password reset';
    const friendlyExpiry = formatExpiryUTC(params.expiresAtIso);

    const text =
      `Hi ${params.username},\n\n` +
      `A password reset was requested for your InfraDB account.\n\n` +
      `Reset password:\n${params.resetUrl}\n\n` +
      `This link expires at: ${friendlyExpiry}\n`;

    const html = buildBrandedEmailHtml({
      label: 'Password reset',
      greetingName: params.username,
      introLine: 'A password reset was requested for your InfraDB account.',
      actionText: 'Reset password',
      actionUrl: params.resetUrl,
      expiryLine: `This link expires at: ${friendlyExpiry}`,
      domainText: safeGetDomainFromUrl(params.resetUrl),
    });

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

    const subject = 'Complete your InfraDB registration';
    const friendlyExpiry = formatExpiryUTC(params.expiresAtIso);

    const text =
      `Hi ${params.inviteeName},\n\n` +
      `You’ve been granted access to InfraDB.\n\n` +
      `Complete registration:\n${params.inviteUrl}\n\n` +
      `This invitation expires at: ${friendlyExpiry}\n`;

    const html = buildBrandedEmailHtml({
      label: 'Invitation',
      greetingName: params.inviteeName,
      introLine: 'You’ve been granted access to InfraDB.',
      actionText: 'Complete registration',
      actionUrl: params.inviteUrl,
      expiryLine: `This invitation expires at: ${friendlyExpiry}`,
      domainText: safeGetDomainFromUrl(params.inviteUrl),
    });

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
      subject: 'InfraDB SMTP test email',
      text: 'This is a test email from InfraDB. Your SMTP settings appear to be working.',
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
