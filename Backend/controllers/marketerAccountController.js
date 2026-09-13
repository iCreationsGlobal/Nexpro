const crypto = require('crypto');
const { Marketer } = require('../models');
const { sequelize } = require('../config/database');
const emailService = require('../services/emailService');
const hash = value => crypto.createHash('sha256').update(String(value)).digest('hex');
const reply = (res, data) => res.json({ success: true, data });
const invalid = (res, message) => res.status(400).json({ success: false, message });

exports.forgotPassword = async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const code = String(crypto.randomInt(100000, 1000000));
    let recipient;
    await sequelize.transaction(async transaction => {
      const m = await Marketer.findOne({ where: { email, isActive: true }, transaction, lock: transaction.LOCK.UPDATE });
      if (!m || Date.now() - (m.metadata?.reset?.sentAt || 0) < 60000) return;
      await m.update({ metadata: { ...m.metadata, reset: { hash: hash(code), expires: Date.now() + 15 * 60000, attempts: 0, sentAt: Date.now() } } }, { transaction });
      recipient = m.email;
    });
    if (recipient) {
      await emailService.sendPlatformMessage(recipient, 'Reset your Sabito password', `<p>Your Sabito reset code is <strong>${code}</strong>.</p><p>It expires in 15 minutes.</p>`, `Your Sabito reset code is ${code}. It expires in 15 minutes.`);
    }
    reply(res, { message: 'If an active account exists, a reset code has been sent.' });
  } catch (e) { next(e); }
};
exports.resetPassword = async (req, res, next) => {
  try {
    const password = String(req.body.password || '');
    if (password.length < 8 || password.length > 128) return invalid(res, 'Use a password between 8 and 128 characters.');
    let changed = false;
    await sequelize.transaction(async transaction => {
      const m = await Marketer.findOne({ where: { email: String(req.body.email || '').trim().toLowerCase(), isActive: true }, transaction, lock: transaction.LOCK.UPDATE });
      const reset = m?.metadata?.reset;
      if (!reset || reset.expires < Date.now() || reset.attempts >= 5) return;
      if (hash(req.body.code) !== reset.hash) {
        await m.update({ metadata: { ...m.metadata, reset: { ...reset, attempts: reset.attempts + 1 } } }, { transaction });
        return;
      }
      const metadata = { ...m.metadata, authVersion: (m.metadata?.authVersion || 0) + 1 };
      delete metadata.reset;
      await m.update({ password, metadata }, { transaction });
      changed = true;
    });
    if (!changed) return invalid(res, 'Invalid or expired reset code.');
    reply(res, { message: 'Password reset. Sign in with your new password.' });
  } catch (e) { next(e); }
};
exports.changePassword = async (req, res, next) => {
  try {
    const password = String(req.body.password || '');
    if (password.length < 8 || password.length > 128) return invalid(res, 'Use a password between 8 and 128 characters.');
    let changed = false;
    await sequelize.transaction(async transaction => {
      const m = await Marketer.findByPk(req.marketer.id, { transaction, lock: transaction.LOCK.UPDATE });
      if (!(await m.comparePassword(req.body.currentPassword))) return;
      const metadata = { ...m.metadata, authVersion: (m.metadata?.authVersion || 0) + 1 };
      delete metadata.reset;
      await m.update({ password, metadata }, { transaction });
      changed = true;
    });
    if (!changed) return invalid(res, 'Current password is incorrect.');
    reply(res, { message: 'Password changed. Sign in again.' });
  } catch (e) { next(e); }
};
exports.closeAccount = async (req, res, next) => {
  try {
    let closed = false;
    await sequelize.transaction(async transaction => {
      const m = await Marketer.findByPk(req.marketer.id, { transaction, lock: transaction.LOCK.UPDATE });
      if (!(await m.comparePassword(req.body.password))) return;
      // Keep the identity referenced by financial records; revoke access immediately.
      await m.update({ isActive: false, metadata: { ...m.metadata, closedAt: new Date().toISOString(), authVersion: (m.metadata?.authVersion || 0) + 1, reset: null, pushTokens: [] } }, { transaction });
      closed = true;
    });
    if (!closed) return invalid(res, 'Password is incorrect.');
    reply(res, { message: 'Account closed. Financial records are retained for outstanding settlements.' });
  } catch (e) { next(e); }
};
