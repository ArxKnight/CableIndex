import nodemailer from 'nodemailer';

export type InviteEmailSendResult = {
  email_sent: boolean;
  email_error?: string;
};

const requiredEnv = [
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_USER',
  'SMTP_PASS',
  'SMTP_FROM',
  'APP_URL',
] as const;

export const isSmtpConfigured = (): boolean => {
  return requiredEnv.every((key) => Boolean(process.env[key] && String(process.env[key]).trim()));
};

export const buildInviteUrl = (token: string, baseUrl: string): string => {
  const trimmedBase = (baseUrl || '').trim().replace(/\/+$/, '');
  return `${trimmedBase}/auth/register?token=${encodeURIComponent(token)}`;
};

export const sendInviteEmailIfConfigured = async (params: {
  to: string;
  inviteeName: string;
  inviterName: string;
  inviteUrl: string;
  expiresAtIso: string;
}): Promise<InviteEmailSendResult> => {
  if (!isSmtpConfigured()) {
    return { email_sent: false, email_error: 'SMTP not configured' };
  }

  const host = String(process.env.SMTP_HOST);
  const port = Number(process.env.SMTP_PORT);
  const user = String(process.env.SMTP_USER);
  const pass = String(process.env.SMTP_PASS);
  const from = String(process.env.SMTP_FROM);

  if (!Number.isFinite(port) || port <= 0) {
    return { email_sent: false, email_error: 'SMTP not configured' };
  }

  const secure = port === 465;

  try {
    const transport = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
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
      from,
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
