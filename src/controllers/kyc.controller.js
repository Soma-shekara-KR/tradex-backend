'use strict';
const { query }  = require('../config/database');
const User       = require('../models/user.model');
const { success, created, badRequest, notFound, forbidden } = require('../utils/response');
const { emitToUser } = require('../config/socket');
const logger = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');

async function uploadDocument(req, res) {
  const { docType } = req.body;
  if (!req.file) return badRequest(res, 'No file uploaded');

  const validTypes = ['passport','national_id','drivers_license','utility_bill','bank_statement','selfie'];
  if (!validTypes.includes(docType)) return badRequest(res, 'Invalid document type');

  const fileUrl = `/uploads/kyc/${req.file.filename}`;

  const { rows } = await query(
    `INSERT INTO kyc_documents (id, user_id, doc_type, file_url, file_name, file_size, mime_type, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'pending') RETURNING *`,
    [uuidv4(), req.user.userId, docType, fileUrl, req.file.originalname, req.file.size, req.file.mimetype]
  );

  // Update user kyc_status to pending if not already approved
  const user = await User.findById(req.user.userId);
  if (user.kyc_status === 'not_submitted') {
    await User.update(req.user.userId, { kyc_status: 'pending' });
  }

  logger.info(`KYC document uploaded: ${docType} by user ${req.user.userId}`);
  return created(res, rows[0], 'Document uploaded. Under review (usually within 15 minutes).');
}

async function getMyDocuments(req, res) {
  const { rows } = await query(
    `SELECT id, doc_type, file_name, status, rejection_reason, created_at, reviewed_at
     FROM kyc_documents WHERE user_id=$1 ORDER BY created_at DESC`,
    [req.user.userId]
  );
  const user = await User.findById(req.user.userId);
  return success(res, { documents: rows, kycStatus: user.kyc_status });
}

// ── Admin: list all pending KYC ───────────────────────
async function getPendingKYC(req, res) {
  const { page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;
  const { rows } = await query(
    `SELECT kd.*, u.email, u.first_name, u.last_name, u.country
     FROM kyc_documents kd JOIN users u ON u.id=kd.user_id
     WHERE kd.status='pending'
     ORDER BY kd.created_at ASC LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  const { rows: cnt } = await query(`SELECT COUNT(*) FROM kyc_documents WHERE status='pending'`);
  return success(res, { documents: rows, total: parseInt(cnt[0].count, 10) });
}

// ── Admin: approve / reject document ─────────────────
async function reviewDocument(req, res) {
  const { id } = req.params;
  const { action, rejectionReason } = req.body;

  if (!['approve','reject'].includes(action)) return badRequest(res, 'Action must be approve or reject');

  const { rows } = await query(
    `UPDATE kyc_documents
     SET status=$1, rejection_reason=$2, reviewed_by=$3, reviewed_at=NOW()
     WHERE id=$4 RETURNING *`,
    [action === 'approve' ? 'approved' : 'rejected', rejectionReason || null, req.user.userId, id]
  );
  if (!rows.length) return notFound(res, 'Document not found');

  const doc = rows[0];

  // Check if all required docs approved → set user KYC approved
  if (action === 'approve') {
    const { rows: pending } = await query(
      `SELECT COUNT(*) FROM kyc_documents WHERE user_id=$1 AND status='pending'`, [doc.user_id]
    );
    const { rows: approved } = await query(
      `SELECT COUNT(*) FROM kyc_documents WHERE user_id=$1 AND status='approved'`, [doc.user_id]
    );
    if (parseInt(pending[0].count, 10) === 0 && parseInt(approved[0].count, 10) >= 2) {
      await User.update(doc.user_id, { kyc_status: 'approved', status: 'active' });
      emitToUser(doc.user_id, 'kyc:approved', { message: 'Your account has been fully verified!' });
    }
  } else {
    await User.update(doc.user_id, { kyc_status: 'rejected' });
    emitToUser(doc.user_id, 'kyc:rejected', { reason: rejectionReason });
  }

  return success(res, doc, `Document ${action}d`);
}

module.exports = { uploadDocument, getMyDocuments, getPendingKYC, reviewDocument };
