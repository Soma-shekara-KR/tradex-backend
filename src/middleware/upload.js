'use strict';
const multer = require('multer');
const path   = require('path');
const { v4: uuidv4 } = require('uuid');

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const MAX_SIZE_MB   = 5;

function buildStorage(subfolder) {
  return multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, path.join(__dirname, `../../uploads/${subfolder}`));
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${uuidv4()}${ext}`);
    },
  });
}

function fileFilter(req, file, cb) {
  if (ALLOWED_TYPES.includes(file.mimetype)) return cb(null, true);
  cb(new Error(`Unsupported file type: ${file.mimetype}`));
}

const kycUpload = multer({
  storage:  buildStorage('kyc'),
  fileFilter,
  limits: { fileSize: MAX_SIZE_MB * 1024 * 1024 },
});

const avatarUpload = multer({
  storage:  buildStorage('avatars'),
  fileFilter,
  limits: { fileSize: 2 * 1024 * 1024 },
});

module.exports = { kycUpload, avatarUpload };
