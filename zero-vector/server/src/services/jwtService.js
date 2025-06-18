const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const config = require('..__LITERAL_0__tils__LITERAL_1__^(\d+)([smhd])$/);
    if (!match) {
      throw new Error('Invalid expiry format');
    }
    const [, amount, unit] = match;
    return parseInt(amount) * units[unit];
  }
  parseExpiryToMilliseconds(expiry) {
    return this.parseExpiryToSeconds(expiry) * 1000;
  }
  async generatePasswordResetToken(userId) {
    try {
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = Date.now() + (60 * 60 * 1000);
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO password_reset_tokens (user_id, token, expires_at, created_at)
        VALUES (?, ?, ?, ?)
      `);
      stmt.run(userId, token, expiresAt, Date.now());
      logger.info('Password reset token generated', {
        userId,
        expiresAt
      });
      return token;
    } catch (error) {
      logger.error('Failed to generate password reset token', {
        error: error.message,
        userId
      });
      throw error;
    }
  }
  async verifyPasswordResetToken(token) {
    try {
      const stmt = this.db.prepare(`
        SELECT user_id, expires_at
        FROM password_reset_tokens
        WHERE token = ?
      `);
      const row = stmt.get(token);
      if (!row) {
        throw new Error('Invalid reset token');
      }
      if (row.expires_at < Date.now()) {
        await this.deletePasswordResetToken(token);
        throw new Error('Reset token expired');
      }
      return row.user_id;
    } catch (error) {
      logger.error('Password reset token verification failed', {
        error: error.message
      });
      throw error;
    }
  }
  async deletePasswordResetToken(token) {
    try {
      const stmt = this.db.prepare(`
        DELETE FROM password_reset_tokens
        WHERE token = ?
      `);
      stmt.run(token);
    } catch (error) {
      logger.error('Failed to delete password reset token', {
        error: error.message
      });
    }
  }
}
module.exports = JwtService;
