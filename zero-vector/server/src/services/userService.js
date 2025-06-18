const bcrypt = require('bcrypt');
const crypto = require('crypto');
const config = require('..__LITERAL_0__tils__LITERAL_1__ limit)
        }
      };
    } catch (error) {
      logger.error('Failed to list users', {
        error: error.message,
        page,
        limit
      });
      throw error;
    }
  }
  async handleFailedLogin(userId) {
    try {
      const user = await this.getUserById(userId);
      const newFailedAttempts = (user?.failedLoginAttempts || 0) + 1;
      let lockedUntil = null;
      if (newFailedAttempts >= config.auth.maxLoginAttempts) {
        lockedUntil = Date.now() + (config.auth.lockoutTimeMinutes * 60 * 1000);
      }
      const stmt = this.db.prepare(`
        UPDATE users
        SET failed_login_attempts = ?, locked_until = ?, updated_at = ?
        WHERE id = ?
      `);
      stmt.run(newFailedAttempts, lockedUntil, Date.now(), userId);
      if (lockedUntil) {
        logger.warn('User account locked due to failed login attempts', {
          userId,
          failedAttempts: newFailedAttempts,
          lockedUntil
        });
      }
    } catch (error) {
      logger.error('Failed to handle failed login', {
        error: error.message,
        userId
      });
    }
  }
  async resetFailedLoginAttempts(userId) {
    try {
      const stmt = this.db.prepare(`
        UPDATE users
        SET failed_login_attempts = 0, locked_until = NULL, updated_at = ?
        WHERE id = ?
      `);
      stmt.run(Date.now(), userId);
    } catch (error) {
      logger.error('Failed to reset failed login attempts', {
        error: error.message,
        userId
      });
    }
  }
  async updateLastLogin(userId) {
    try {
      const stmt = this.db.prepare(`
        UPDATE users
        SET last_login = ?, updated_at = ?
        WHERE id = ?
      `);
      stmt.run(Date.now(), Date.now(), userId);
    } catch (error) {
      logger.error('Failed to update last login', {
        error: error.message,
        userId
      });
    }
  }
  validateUserInput({ email, password, role }) {
    if (!email || !validator.isEmail(email)) {
      throw new Error('Valid email is required');
    }
    if (!password || password.length < 8) {
      throw new Error('Password must be at least 8 characters long');
    }
    if (!__LITERAL_2__.test(password)) {
      throw new Error('Password must contain at least one lowercase letter, one uppercase letter, and one number');
    }
    if (role && !['admin', 'user', 'readonly'].includes(role)) {
      throw new Error('Role must be one of: admin, user, readonly');
    }
  }
  async changePassword(userId, currentPassword, newPassword) {
    try {
      const user = await this.getUserById(userId);
      if (!user) {
        throw new Error('User not found');
      }
      const userWithPassword = await this.getUserByEmail(user.email);
      const isValidPassword = await bcrypt.compare(currentPassword, userWithPassword.passwordHash);
      if (!isValidPassword) {
        throw new Error('Current password is incorrect');
      }
      this.validateUserInput({ email: user.email, password: newPassword });
      const newPasswordHash = await bcrypt.hash(newPassword, config.auth.bcryptRounds);
      const stmt = this.db.prepare(`
        UPDATE users
        SET password_hash = ?, updated_at = ?
        WHERE id = ?
      `);
      stmt.run(newPasswordHash, Date.now(), userId);
      logger.info('Password changed successfully', { userId });
      return true;
    } catch (error) {
      logger.error('Failed to change password', {
        error: error.message,
        userId
      });
      throw error;
    }
  }
}
module.exports = UserService;
