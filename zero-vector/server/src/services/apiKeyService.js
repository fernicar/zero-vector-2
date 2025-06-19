const crypto = require('crypto');
const bcrypt = require('bcrypt');
const config = require('../config');
const { logger } = require('../utils/logger');

class ApiKeyService {
  constructor(database) {
    this.database = database;
    this.db = database.db;
  }

  async createApiKey(userId, keyData = {}) {
    try {
      const {
        name = 'Default API Key',
        permissions = ['read'],
        rateLimit = 1000,
        expiresInDays = 365
      } = keyData;

      this.validatePermissions(permissions);

      const rawKey = crypto.randomBytes(32).toString('hex');
      const keyPrefix = 'vdb_';
      const fullKey = `${keyPrefix}${rawKey}`;

      const hashedKey = await bcrypt.hash(fullKey, config.security.apiKeySaltRounds);

      const keyId = crypto.randomUUID();

      const expiresAt = Date.now() + (expiresInDays * 24 * 60 * 60 * 1000);

      const stmt = this.db.prepare(`
        INSERT INTO api_keys (
          id, user_id, key_hash, name, permissions, rate_limit,
          expires_at, created_at, last_used, is_active, usage_count
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const now = Date.now();
      stmt.run(
        keyId,
        userId,
        hashedKey,
        name,
        JSON.stringify(permissions),
        rateLimit,
        expiresAt,
        now,
        null,
        1,
        0
      );

      logger.info('API key created successfully', {
        keyId,
        userId,
        name,
        permissions,
        rateLimit,
        expiresAt
      });

      return {
        id: keyId,
        key: fullKey,
        name,
        permissions,
        rateLimit,
        expiresAt,
        createdAt: now
      };

    } catch (error) {
      logger.error('API key creation failed', {
        error: error.message,
        userId,
        keyData
      });
      throw error;
    }
  }

  async validateApiKey(providedKey) {
    try {
      if (!providedKey || !providedKey.startsWith('vdb_')) {
        return null;
      }

      const stmt = this.db.prepare(`
        SELECT ak.*, u.id as user_id, u.email, u.role, u.is_active as user_active
        FROM api_keys ak
        JOIN users u ON ak.user_id = u.id
        WHERE ak.is_active = 1
      `);

      const keys = stmt.all();

      for (const keyRecord of keys) {
        if (keyRecord.expires_at < Date.now()) {
          await this.deactivateApiKey(keyRecord.id);
          continue;
        }

        if (!keyRecord.user_active) {
          continue;
        }

        const isValid = await bcrypt.compare(providedKey, keyRecord.key_hash);
        if (isValid) {
          await this.updateKeyUsage(keyRecord.id);

          logger.info('API key validated successfully', {
            keyId: keyRecord.id,
            userId: keyRecord.user_id
          });

          return {
            id: keyRecord.id,
            userId: keyRecord.user_id,
            name: keyRecord.name,
            permissions: JSON.parse(keyRecord.permissions),
            rateLimit: keyRecord.rate_limit,
            user: {
              id: keyRecord.user_id,
              email: keyRecord.email,
              role: keyRecord.role
            }
          };
        }
      }

      return null;

    } catch (error) {
      logger.error('API key validation failed', {
        error: error.message
      });
      return null;
    }
  }

  async listApiKeys(userId, includeInactive = false) {
    try {
      const whereClause = includeInactive
        ? 'WHERE user_id = ?'
        : 'WHERE user_id = ? AND is_active = 1';

      const stmt = this.db.prepare(`
        SELECT id, name, permissions, rate_limit, expires_at, created_at,
               last_used, is_active, usage_count
        FROM api_keys
        ${whereClause}
        ORDER BY created_at DESC
      `);

      const rows = stmt.all(userId);

      const keys = rows.map(row => ({
        id: row.id,
        name: row.name,
        permissions: JSON.parse(row.permissions),
        rateLimit: row.rate_limit,
        expiresAt: row.expires_at,
        createdAt: row.created_at,
        lastUsed: row.last_used,
        isActive: row.is_active === 1,
        usageCount: row.usage_count,
        isExpired: row.expires_at < Date.now()
      }));

      return keys;

    } catch (error) {
      logger.error('Failed to list API keys', {
        error: error.message,
        userId
      });
      throw error;
    }
  }

  async updateApiKey(keyId, userId, updates) {
    try {
      const {
        name,
        permissions,
        rateLimit,
        isActive
      } = updates;

      if (permissions) {
        this.validatePermissions(permissions);
      }

      const updateFields = [];
      const values = [];

      if (name !== undefined) {
        updateFields.push('name = ?');
        values.push(name);
      }

      if (permissions !== undefined) {
        updateFields.push('permissions = ?');
        values.push(JSON.stringify(permissions));
      }

      if (rateLimit !== undefined) {
        updateFields.push('rate_limit = ?');
        values.push(rateLimit);
      }

      if (isActive !== undefined) {
        updateFields.push('is_active = ?');
        values.push(isActive ? 1 : 0);
      }

      if (updateFields.length === 0) {
        throw new Error('No valid fields to update');
      }

      updateFields.push('updated_at = ?');
      values.push(Date.now());

      values.push(keyId, userId);

      const stmt = this.db.prepare(`
        UPDATE api_keys
        SET ${updateFields.join(', ')}
        WHERE id = ? AND user_id = ?
      `);

      const result = stmt.run(...values);

      if (result.changes === 0) {
        throw new Error('API key not found or not owned by user');
      }

      logger.info('API key updated successfully', {
        keyId,
        userId,
        updates
      });

      return true;

    } catch (error) {
      logger.error('Failed to update API key', {
        error: error.message,
        keyId,
        userId,
        updates
      });
      throw error;
    }
  }

  async deleteApiKey(keyId, userId) {
    try {
      const stmt = this.db.prepare(`
        DELETE FROM api_keys
        WHERE id = ? AND user_id = ?
      `);

      const result = stmt.run(keyId, userId);

      if (result.changes === 0) {
        throw new Error('API key not found or not owned by user');
      }

      logger.info('API key deleted successfully', {
        keyId,
        userId
      });

      return true;

    } catch (error) {
      logger.error('Failed to delete API key', {
        error: error.message,
        keyId,
        userId
      });
      throw error;
    }
  }

  async deactivateApiKey(keyId) {
    try {
      const stmt = this.db.prepare(`
        UPDATE api_keys
        SET is_active = 0, updated_at = ?
        WHERE id = ?
      `);

      stmt.run(Date.now(), keyId);

      logger.info('API key deactivated', { keyId });

    } catch (error) {
      logger.error('Failed to deactivate API key', {
        error: error.message,
        keyId
      });
    }
  }

  async updateKeyUsage(keyId) {
    try {
      const stmt = this.db.prepare(`
        UPDATE api_keys
        SET last_used = ?, usage_count = usage_count + 1
        WHERE id = ?
      `);

      stmt.run(Date.now(), keyId);

    } catch (error) {
      logger.error('Failed to update key usage', {
        error: error.message,
        keyId
      });
    }
  }

  async cleanupExpiredKeys() {
    try {
      const stmt = this.db.prepare(`
        UPDATE api_keys
        SET is_active = 0, updated_at = ?
        WHERE expires_at < ? AND is_active = 1
      `);

      const now = Date.now();
      const result = stmt.run(now, now);

      if (result.changes > 0) {
        logger.info('Expired API keys cleaned up', {
          deactivatedCount: result.changes
        });
      }

      return result.changes;

    } catch (error) {
      logger.error('Failed to cleanup expired keys', {
        error: error.message
      });
      throw error;
    }
  }

  async getApiKeyStats(userId = null) {
    try {
      const whereClause = userId ? 'WHERE user_id = ?' : '';
      const params = userId ? [userId] : [];

      const stmt = this.db.prepare(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as active,
          SUM(CASE WHEN expires_at < ? THEN 1 ELSE 0 END) as expired,
          SUM(usage_count) as total_usage
        FROM api_keys
        ${whereClause}
      `);

      const result = stmt.get(Date.now(), ...params);

      return {
        total: result.total || 0,
        active: result.active || 0,
        expired: result.expired || 0,
        inactive: (result.total || 0) - (result.active || 0),
        totalUsage: result.total_usage || 0
      };

    } catch (error) {
      logger.error('Failed to get API key stats', {
        error: error.message,
        userId
      });
      throw error;
    }
  }

  validatePermissions(permissions) {
    if (!Array.isArray(permissions)) {
      throw new Error('Permissions must be an array');
    }

    const validPermissions = [
      'read', 'write', 'delete', 'admin',
      'vectors:read', 'vectors:write', 'vectors:delete',
      'personas:read', 'personas:write', 'personas:delete'
    ];

    for (const permission of permissions) {
      if (!validPermissions.includes(permission)) {
        throw new Error(`Invalid permission: ${permission}`);
      }
    }

    if (permissions.length === 0) {
      throw new Error('At least one permission must be specified');
    }
  }

  hasPermission(apiKeyData, requiredPermission) {
    if (!apiKeyData || !apiKeyData.permissions) {
      return false;
    }

    const permissions = apiKeyData.permissions;

    if (permissions.includes('admin')) {
      return true;
    }

    if (permissions.includes(requiredPermission)) {
      return true;
    }

    if (requiredPermission.includes(':')) {
      const [resource, action] = requiredPermission.split(':');
      if (permissions.includes(action)) {
        return true;
      }
    }

    return false;
  }
}

module.exports = ApiKeyService;
