'use strict';
const { query, transaction } = require('../config/database');
const { v4: uuidv4 } = require('uuid');

const User = {

  async findById(id) {
    const { rows } = await query(
      `SELECT id, email, first_name, last_name, phone, phone_verified, email_verified,
              country, address, date_of_birth, avatar_url, role, status, kyc_status,
              two_fa_enabled, referral_code, referred_by, last_login_at, created_at, updated_at
       FROM users WHERE id = $1`, [id]
    );
    return rows[0] || null;
  },

  async findByIdFull(id) {
    const { rows } = await query(`SELECT * FROM users WHERE id = $1`, [id]);
    return rows[0] || null;
  },

  async findByEmail(email) {
    const { rows } = await query(`SELECT * FROM users WHERE email = $1`, [email.toLowerCase()]);
    return rows[0] || null;
  },

  async create({ email, passwordHash, firstName, lastName, phone, country, referredBy }) {
    const referralCode = `REF${Date.now().toString().slice(-7)}`;
    const { rows } = await query(
      `INSERT INTO users (id, email, password_hash, first_name, last_name, phone, country, referral_code, referred_by, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending') RETURNING *`,
      [uuidv4(), email.toLowerCase(), passwordHash, firstName, lastName, phone, country, referralCode, referredBy || null]
    );
    return rows[0];
  },

  async update(id, fields) {
    const allowed = ['first_name','last_name','phone','country','address','date_of_birth','avatar_url','status','kyc_status','two_fa_enabled','two_fa_secret','last_login_at','last_login_ip','email_verified','phone_verified'];
    const sets    = [];
    const values  = [];
    let   i       = 1;
    for (const [k, v] of Object.entries(fields)) {
      if (allowed.includes(k)) { sets.push(`${k} = $${i++}`); values.push(v); }
    }
    if (!sets.length) return null;
    values.push(id);
    const { rows } = await query(
      `UPDATE users SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`, values
    );
    return rows[0];
  },

  async setPassword(id, passwordHash) {
    await query(`UPDATE users SET password_hash=$1, password_reset_token=NULL, password_reset_expires=NULL WHERE id=$2`, [passwordHash, id]);
  },

  async setResetToken(id, token, expires) {
    await query(`UPDATE users SET password_reset_token=$1, password_reset_expires=$2 WHERE id=$3`, [token, expires, id]);
  },

  async findByResetToken(token) {
    const { rows } = await query(
      `SELECT * FROM users WHERE password_reset_token=$1 AND password_reset_expires > NOW()`, [token]
    );
    return rows[0] || null;
  },

  async setEmailVerifyToken(id, token) {
    await query(`UPDATE users SET email_verify_token=$1 WHERE id=$2`, [token, id]);
  },

  async verifyEmail(token) {
    const { rows } = await query(
      `UPDATE users SET email_verified=true, email_verify_token=NULL, status='active'
       WHERE email_verify_token=$1 RETURNING id`, [token]
    );
    return rows[0] || null;
  },

  async updateLastLogin(id, ip) {
    await query(`UPDATE users SET last_login_at=NOW(), last_login_ip=$1 WHERE id=$2`, [ip, id]);
  },

  async getAll({ page = 1, limit = 20, status, kyc_status, role, search }) {
    const offset = (page - 1) * limit;
    const conditions = ['1=1'];
    const values = [];
    let i = 1;
    if (status)     { conditions.push(`status=$${i++}`);     values.push(status); }
    if (kyc_status) { conditions.push(`kyc_status=$${i++}`); values.push(kyc_status); }
    if (role)       { conditions.push(`role=$${i++}`);       values.push(role); }
    if (search) {
      conditions.push(`(email ILIKE $${i} OR first_name ILIKE $${i} OR last_name ILIKE $${i})`);
      values.push(`%${search}%`); i++;
    }
    const where = conditions.join(' AND ');
    const { rows }  = await query(
      `SELECT id,email,first_name,last_name,phone,country,role,status,kyc_status,created_at
       FROM users WHERE ${where} ORDER BY created_at DESC LIMIT $${i} OFFSET $${i+1}`,
      [...values, limit, offset]
    );
    const { rows: cnt } = await query(`SELECT COUNT(*) FROM users WHERE ${where}`, values);
    return { users: rows, total: parseInt(cnt[0].count, 10) };
  },

};

module.exports = User;
