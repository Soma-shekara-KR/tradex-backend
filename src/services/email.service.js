'use strict';
const nodemailer = require('nodemailer');
const logger = require('../utils/logger');

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.sendgrid.net',
    port: parseInt(process.env.SMTP_PORT, 10) || 587,
    secure: false,
    auth: {
      user: process.env.SMTP_USER || 'apikey',
      pass: process.env.SMTP_PASS || '',
    },
  });
  return transporter;
}

const FROM = `"${process.env.EMAIL_FROM_NAME || 'TradeX'}" <${process.env.EMAIL_FROM || 'noreply@tradex.com'}>`;
const APP_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

function wrapTemplate(title, bodyHtml) {
  return `
  <div style="font-family:Inter,Arial,sans-serif;background:#0a0a0a;padding:40px 20px;">
    <div style="max-width:480px;margin:0 auto;background:#16181f;border-radius:16px;overflow:hidden;border:1px solid #232530;">
      <div style="background:#111215;padding:28px 32px;border-bottom:1px solid #232530;">
        <span style="font-size:20px;font-weight:700;color:#fff;">Trade<span style="color:#ff6b35;">X</span></span>
      </div>
      <div style="padding:32px;color:#d0d0d8;">
        <h2 style="color:#fff;font-size:20px;margin:0 0 16px;">${title}</h2>
        ${bodyHtml}
      </div>
      <div style="padding:20px 32px;background:#111215;border-top:1px solid #232530;font-size:12px;color:#666;">
        © ${new Date().getFullYear()} TradeX. Trading CFDs involves significant risk of loss.
      </div>
    </div>
  </div>`;
}

async function send(to, subject, html) {
  try {
    await getTransporter().sendMail({ from: FROM, to, subject, html });
    logger.info(`Email sent to ${to}: ${subject}`);
  } catch (err) {
    // Don't crash the request if email fails — log and continue
    logger.error(`Failed to send email to ${to}: ${err.message}`);
  }
}

const EmailService = {

  async sendVerificationEmail(to, firstName, token) {
    const link = `${APP_URL}/verify-email?token=${token}`;
    const html = wrapTemplate('Verify your email', `
      <p>Hi ${firstName},</p>
      <p>Welcome to TradeX! Please verify your email address to activate your account.</p>
      <a href="${link}" style="display:inline-block;margin:20px 0;padding:12px 28px;background:#ff6b35;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">Verify Email</a>
      <p style="font-size:13px;color:#9a9aaa;">Or copy this link: ${link}</p>
    `);
    return send(to, 'Verify your TradeX account', html);
  },

  async sendPasswordResetEmail(to, firstName, token) {
    const link = `${APP_URL}/reset-password?token=${token}`;
    const html = wrapTemplate('Reset your password', `
      <p>Hi ${firstName},</p>
      <p>We received a request to reset your password. This link expires in 1 hour.</p>
      <a href="${link}" style="display:inline-block;margin:20px 0;padding:12px 28px;background:#ff6b35;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">Reset Password</a>
      <p style="font-size:13px;color:#9a9aaa;">If you didn't request this, you can safely ignore this email.</p>
    `);
    return send(to, 'Reset your TradeX password', html);
  },

  async sendDepositConfirmation(to, firstName, amount, reference) {
    const html = wrapTemplate('Deposit confirmed', `
      <p>Hi ${firstName},</p>
      <p>Your deposit of <strong style="color:#00c896;">$${amount.toFixed(2)}</strong> has been credited to your account.</p>
      <p style="font-size:13px;color:#9a9aaa;">Reference: ${reference}</p>
    `);
    return send(to, 'Deposit confirmed — TradeX', html);
  },

  async sendWithdrawalConfirmation(to, firstName, amount, reference) {
    const html = wrapTemplate('Withdrawal processed', `
      <p>Hi ${firstName},</p>
      <p>Your withdrawal of <strong>$${amount.toFixed(2)}</strong> has been processed and is on its way.</p>
      <p style="font-size:13px;color:#9a9aaa;">Reference: ${reference}</p>
    `);
    return send(to, 'Withdrawal processed — TradeX', html);
  },

  async sendKycApproved(to, firstName) {
    const html = wrapTemplate('Verification complete ✅', `
      <p>Hi ${firstName},</p>
      <p>Great news — your identity has been verified. You now have full access to deposits, withdrawals, and higher limits.</p>
    `);
    return send(to, 'Your account is verified — TradeX', html);
  },

  async sendKycRejected(to, firstName, reason) {
    const html = wrapTemplate('Document review update', `
      <p>Hi ${firstName},</p>
      <p>We were unable to verify one of your documents.</p>
      ${reason ? `<p style="color:#ff4d6a;">Reason: ${reason}</p>` : ''}
      <p>Please log in and re-upload a clearer document to continue verification.</p>
    `);
    return send(to, 'Action needed: document verification — TradeX', html);
  },

  async sendLoginAlert(to, firstName, ip, device) {
    const html = wrapTemplate('New sign-in detected', `
      <p>Hi ${firstName},</p>
      <p>Your account was just accessed from a new device or location.</p>
      <p style="font-size:13px;color:#9a9aaa;">IP: ${ip}<br/>Device: ${device}</p>
      <p>If this wasn't you, please reset your password immediately.</p>
    `);
    return send(to, 'New sign-in to your TradeX account', html);
  },
};

module.exports = EmailService;
