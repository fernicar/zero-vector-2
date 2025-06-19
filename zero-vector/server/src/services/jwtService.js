const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const config = require('../config');
const { logger } = require('../utils/logger');

class JwtService {
  constructor(database) {
    this.db = database;
    this.jwtSecret = config.security.jwtSecret;
    this.accessTokenExpiry = config.auth.accessTokenExpiry;
    this.refreshTokenExpiry = config.auth.refreshTokenExpiry;
  }

  async generateTokens(user) {
    try {
      const payload = {
        userId: user.id,
        email: user.email,
        role: user.role
      };

      const accessToken = jwt.sign(payload, this.jwtSecret, {
        expiresIn: this.accessTokenExpiry,
        issuer: 'zero-vector-server',
        audience: 'zero-vector-client'
      });

      const refreshTokenId = crypto.randomUUID();
      const refreshToken = jwt.sign(
        {
          ...payload,
          tokenId: refreshTokenId,
          type: 'refresh'
        },
        this.jwtSecret,
        {
          expiresIn: this.refreshTokenExpiry,
          issuer: 'zero-vector-server',
          audience: 'zero-vector-client'
        }
      );

      await this.storeRefreshToken(refreshTokenId, user.id, refreshToken);

      logger.info('Tokens generated successfully', {
        userId: user.id,
        refreshTokenId
      });

      return {
        accessToken,
        refreshToken,
        tokenType: 'Bearer',
        expiresIn: this.parseExpiryToSeconds(this.accessTokenExpiry)
      };

    } catch (error) {
      logger.error('Token generation failed', {
        error: error.message,
        userId: user.id
      });
      throw error;
    }
  }

  async verifyAccessToken(token) {
    try {
      const decoded = jwt.verify(token, this.jwtSecret, {
        issuer: 'zero-vector-server',
        audience: 'zero-vector-client'
      });

      if (decoded.type === 'refresh') {
        throw new Error('Invalid token type');
      }

      logger.debug('Access token verified successfully', {
        userId: decoded.userId
      });

      return {
        userId: decoded.userId,
        email: decoded.email,
        role: decoded.role,
        iat: decoded.iat,
        exp: decoded.exp
      };

    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        logger.warn('Access token expired', { token: token.substring(0, 20) + '...' });
        throw new Error('Token expired');
      } else if (error.name === 'JsonWebTokenError') {
        logger.warn('Invalid access token', { error: error.message });
        throw new Error('Invalid token');
      }

      logger.error('Access token verification failed', {
        error: error.message
      });
      throw error;
    }
  }

  async refreshToken(refreshToken) {
    try {
      const decoded = jwt.verify(refreshToken, this.jwtSecret, {
        issuer: 'zero-vector-server',
        audience: 'zero-vector-client'
      });

      if (decoded.type !== 'refresh') {
        throw new Error('Invalid token type');
      }

      const storedToken = await this.getRefreshToken(decoded.tokenId);
      if (!storedToken || storedToken.token !== refreshToken) {
        throw new Error('Invalid refresh token');
      }

      if (storedToken.expiresAt < Date.now()) {
        await this.deleteRefreshToken(decoded.tokenId);
        throw new Error('Refresh token expired');
      }

      const user = {
        id: decoded.userId,
        email: decoded.email,
        role: decoded.role
      };

      const accessToken = jwt.sign(
        {
          userId: user.id,
          email: user.email,
          role: user.role
        },
        this.jwtSecret,
        {
          expiresIn: this.accessTokenExpiry,
          issuer: 'zero-vector-server',
          audience: 'zero-vector-client'
        }
      );

      await this.updateRefreshTokenUsage(decoded.tokenId);

      logger.info('Token refreshed successfully', {
        userId: decoded.userId,
        tokenId: decoded.tokenId
      });

      return {
        accessToken,
        tokenType: 'Bearer',
        expiresIn: this.parseExpiryToSeconds(this.accessTokenExpiry)
      };

    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        logger.warn('Refresh token expired');
        throw new Error('Refresh token expired');
      } else if (error.name === 'JsonWebTokenError') {
        logger.warn('Invalid refresh token', { error: error.message });
        throw new Error('Invalid refresh token');
      }

      logger.error('Token refresh failed', {
        error: error.message
      });
      throw error;
    }
  }

  async revokeRefreshToken(refreshToken) {
    try {
      const decoded = jwt.verify(refreshToken, this.jwtSecret, {
        ignoreExpiration: true
      });

      if (decoded.type !== 'refresh' || !decoded.tokenId) {
        throw new Error('Invalid token type');
      }

      await this.deleteRefreshToken(decoded.tokenId);

      logger.info('Refresh token revoked successfully', {
        userId: decoded.userId,
        tokenId: decoded.tokenId
      });

      return true;

    } catch (error) {
      logger.error('Token revocation failed', {
        error: error.message
      });
      throw error;
    }
  }

  async revokeAllUserTokens(userId) {
    try {
      const stmt = this.db.prepare(`
        DELETE FROM refresh_tokens
        WHERE user_id = ?
      `);

      const result = stmt.run(userId);

      logger.info('All user tokens revoked', {
        userId,
        revokedCount: result.changes
      });

      return result.changes;

    } catch (error) {
      logger.error('Failed to revoke all user tokens', {
        error: error.message,
        userId
      });
      throw error;
    }
  }

  async storeRefreshToken(tokenId, userId, token) {
    try {
      const expiresAt = Date.now() + this.parseExpiryToMilliseconds(this.refreshTokenExpiry);

      const stmt = this.db.prepare(`
        INSERT INTO refresh_tokens (id, user_id, token, expires_at, created_at, last_used)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      const now = Date.now();
      stmt.run(tokenId, userId, token, expiresAt, now, now);

    } catch (error) {
      logger.error('Failed to store refresh token', {
        error: error.message,
        tokenId,
        userId
      });
      throw error;
    }
  }

  async getRefreshToken(tokenId) {
    try {
      const stmt = this.db.prepare(`
        SELECT id, user_id, token, expires_at, created_at, last_used
        FROM refresh_tokens
        WHERE id = ?
      `);

      const row = stmt.get(tokenId);
      if (!row) return null;

      return {
        id: row.id,
        userId: row.user_id,
        token: row.token,
        expiresAt: row.expires_at,
        createdAt: row.created_at,
        lastUsed: row.last_used
      };

    } catch (error) {
      logger.error('Failed to get refresh token', {
        error: error.message,
        tokenId
      });
      throw error;
    }
  }

  async updateRefreshTokenUsage(tokenId) {
    try {
      const stmt = this.db.prepare(`
        UPDATE refresh_tokens
        SET last_used = ?
        WHERE id = ?
      `);

      stmt.run(Date.now(), tokenId);

    } catch (error) {
      logger.error('Failed to update refresh token usage', {
        error: error.message,
        tokenId
      });
    }
  }

  async deleteRefreshToken(tokenId) {
    try {
      const stmt = this.db.prepare(`
        DELETE FROM refresh_tokens
        WHERE id = ?
      `);

      stmt.run(tokenId);

    } catch (error) {
      logger.error('Failed to delete refresh token', {
        error: error.message,
        tokenId
      });
      throw error;
    }
  }

  async cleanupExpiredTokens() {
    try {
      const stmt = this.db.prepare(`
        DELETE FROM refresh_tokens
        WHERE expires_at < ?
      `);

      const result = stmt.run(Date.now());

      if (result.changes > 0) {
        logger.info('Expired refresh tokens cleaned up', {
          deletedCount: result.changes
        });
      }

      return result.changes;

    } catch (error) {
      logger.error('Failed to cleanup expired tokens', {
        error: error.message
      });
      throw error;
    }
  }

  async getTokenStats(userId = null) {
    try {
      const whereClause = userId ? 'WHERE user_id = ?' : '';
      const params = userId ? [userId] : [];

      const stmt = this.db.prepare(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN expires_at > ? THEN 1 ELSE 0 END) as active,
          SUM(CASE WHEN expires_at <= ? THEN 1 ELSE 0 END) as expired
        FROM refresh_tokens
        ${whereClause}
      `);

      const now = Date.now();
      const result = stmt.get(now, now, ...params);

      return {
        total: result.total || 0,
        active: result.active || 0,
        expired: result.expired || 0
      };

    } catch (error) {
      logger.error('Failed to get token stats', {
        error: error.message,
        userId
      });
      throw error;
    }
  }

  parseExpiryToSeconds(expiry) {
    const units = {
      's': 1,
      'm': 60,
      'h': 3600,
      'd': 86400
    };

    const match = expiry.match(/^(\d+)([smhd])$/);
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
