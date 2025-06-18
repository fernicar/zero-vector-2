const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { logger } = require('..__LITERAL_0__logger');
const config = require('..__LITERAL_1__${indexes.length}: ${indexSQL}`);
        this.db.exec(indexSQL);
      } catch (error) {
        logger.error(`Failed to create index: ${indexSQL}`, { error: error.message });
        throw error;
      }
    }
    logger.info('Database indexes created successfully');
  }
  async insertUser(userData) {
    const stmt = this.db.prepare(`
      INSERT INTO users (id, email, password_hash, role, created_at, updated_at, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const now = Date.now();
    return stmt.run(
      userData.id,
      userData.email,
      userData.passwordHash,
      userData.role || 'user',
      now,
      now,
      userData.isActive !== false ? 1 : 0
    );
  }
  async getUserByEmail(email) {
    const stmt = this.db.prepare('SELECT * FROM users WHERE email = ? AND is_active = 1');
    return stmt.get(email);
  }
  async getUserById(id) {
    const stmt = this.db.prepare('SELECT * FROM users WHERE id = ? AND is_active = 1');
    return stmt.get(id);
  }
  async updateUser(id, updates) {
    const fields = [];
    const values = [];
    Object.keys(updates).forEach(key => {
      if (key !== 'id') {
        fields.push(`${key} = ?`);
        values.push(updates[key]);
      }
    });
    if (fields.length === 0) return;
    fields.push('updated_at = ?');
    values.push(Date.now());
    values.push(id);
    const stmt = this.db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`);
    return stmt.run(...values);
  }
  async updateFailedLoginAttempts(email, attempts, lockUntil = null) {
    const stmt = this.db.prepare(`
      UPDATE users
      SET failed_login_attempts = ?, locked_until = ?, updated_at = ?
      WHERE email = ?
    `);
    return stmt.run(attempts, lockUntil, Date.now(), email);
  }
  async updateLastLogin(id) {
    const stmt = this.db.prepare('UPDATE users SET last_login = ?, updated_at = ? WHERE id = ?');
    const now = Date.now();
    return stmt.run(now, now, id);
  }
  async insertRefreshToken(tokenData) {
    const stmt = this.db.prepare(`
      INSERT INTO refresh_tokens (id, user_id, token, expires_at, created_at, last_used)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const now = Date.now();
    return stmt.run(
      tokenData.id,
      tokenData.userId,
      tokenData.token,
      tokenData.expiresAt,
      now,
      now
    );
  }
  async getRefreshToken(token) {
    const stmt = this.db.prepare('SELECT * FROM refresh_tokens WHERE token = ?');
    return stmt.get(token);
  }
  async updateRefreshTokenLastUsed(id) {
    const stmt = this.db.prepare('UPDATE refresh_tokens SET last_used = ? WHERE id = ?');
    return stmt.run(Date.now(), id);
  }
  async deleteRefreshToken(token) {
    const stmt = this.db.prepare('DELETE FROM refresh_tokens WHERE token = ?');
    return stmt.run(token);
  }
  async deleteAllUserRefreshTokens(userId) {
    const stmt = this.db.prepare('DELETE FROM refresh_tokens WHERE user_id = ?');
    return stmt.run(userId);
  }
  async cleanupExpiredRefreshTokens() {
    const stmt = this.db.prepare('DELETE FROM refresh_tokens WHERE expires_at < ?');
    return stmt.run(Date.now());
  }
  async insertApiKey(keyData) {
    const stmt = this.db.prepare(`
      INSERT INTO api_keys (id, user_id, key_hash, name, permissions, rate_limit, created_at, updated_at, expires_at, is_active, usage_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const now = Date.now();
    return stmt.run(
      keyData.id,
      keyData.userId,
      keyData.keyHash,
      keyData.name,
      JSON.stringify(keyData.permissions),
      keyData.rateLimit || 1000,
      now,
      now,
      keyData.expiresAt,
      keyData.isActive !== false ? 1 : 0,
      0
    );
  }
  async getApiKeyByHash(keyHash) {
    const stmt = this.db.prepare(`
      SELECT ak.*, u.email, u.role as user_role
      FROM api_keys ak
      JOIN users u ON ak.user_id = u.id
      WHERE ak.key_hash = ? AND ak.is_active = 1 AND u.is_active = 1
      AND (ak.expires_at IS NULL OR ak.expires_at > ?)
    `);
    const result = stmt.get(keyHash, Date.now());
    if (result && result.permissions) {
      result.permissions = JSON.parse(result.permissions);
    }
    return result;
  }
  async listApiKeys(userId, includeInactive = false) {
    const whereClause = includeInactive ? 'user_id = ?' : 'user_id = ? AND is_active = 1';
    const stmt = this.db.prepare(`
      SELECT id, user_id, name, permissions, rate_limit, created_at, updated_at, expires_at, last_used, is_active, usage_count
      FROM api_keys
      WHERE ${whereClause}
      ORDER BY created_at DESC
    `);
    const results = stmt.all(userId);
    return results.map(key => ({
      ...key,
      permissions: JSON.parse(key.permissions)
    }));
  }
  async updateApiKey(id, updates) {
    const fields = [];
    const values = [];
    Object.keys(updates).forEach(key => {
      if (key !== 'id' && key !== 'key_hash') {
        if (key === 'permissions') {
          fields.push(`${key} = ?`);
          values.push(JSON.stringify(updates[key]));
        } else {
          fields.push(`${key} = ?`);
          values.push(updates[key]);
        }
      }
    });
    if (fields.length === 0) return;
    fields.push('updated_at = ?');
    values.push(Date.now());
    values.push(id);
    const stmt = this.db.prepare(`UPDATE api_keys SET ${fields.join(', ')} WHERE id = ?`);
    return stmt.run(...values);
  }
  async updateApiKeyLastUsed(id) {
    const stmt = this.db.prepare(`
      UPDATE api_keys
      SET last_used = ?, usage_count = usage_count + 1, updated_at = ?
      WHERE id = ?
    `);
    const now = Date.now();
    return stmt.run(now, now, id);
  }
  async deleteApiKey(id) {
    const stmt = this.db.prepare('DELETE FROM api_keys WHERE id = ?');
    return stmt.run(id);
  }
  async findVectorMetadataById(id) {
    const stmt = this.db.prepare('SELECT * FROM vector_metadata WHERE id = ?');
    const result = stmt.get(id);
    if (result) {
      result.tags = JSON.parse(result.tags);
      result.customMetadata = JSON.parse(result.custom_metadata);
    }
    return result;
  }
  async insertVectorMetadata(metadata) {
    try {
      const existing = await this.findVectorMetadataById(metadata.id);
      if (existing) {
        logger.warn('Vector metadata with this ID already exists, returning existing record', {
          service: 'zero-vector-server',
          version: '1.0.0',
          vectorId: metadata.id,
          personaId: metadata.personaId
        });
        return existing;
      }
      const stmt = this.db.prepare(`
        INSERT INTO vector_metadata (id, dimensions, persona_id, content_type, source, tags, custom_metadata, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const now = Date.now();
      const result = stmt.run(
        metadata.id,
        metadata.dimensions,
        metadata.personaId,
        metadata.contentType,
        metadata.source,
        JSON.stringify(metadata.tags || []),
        JSON.stringify(metadata.customMetadata || {}),
        now,
        now
      );
      logger.info('Vector metadata inserted successfully', {
        service: 'zero-vector-server',
        version: '1.0.0',
        vectorId: metadata.id,
        personaId: metadata.personaId,
        dimensions: metadata.dimensions
      });
      return result;
    } catch (error) {
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE' && error.message.includes('vector_metadata.id')) {
        logger.warn('UNIQUE constraint violation, finding existing vector metadata', {
          service: 'zero-vector-server',
          version: '1.0.0',
          vectorId: metadata.id,
          personaId: metadata.personaId,
          error: error.message
        });
        const existing = await this.findVectorMetadataById(metadata.id);
        if (existing) {
          logger.info('Found existing vector metadata after UNIQUE constraint violation', {
            service: 'zero-vector-server',
            version: '1.0.0',
            vectorId: existing.id,
            personaId: existing.persona_id
          });
          return existing;
        }
      }
      logger.error('Failed to insert vector metadata', {
        service: 'zero-vector-server',
        version: '1.0.0',
        vectorId: metadata.id,
        personaId: metadata.personaId,
        error: error.message
      });
      throw error;
    }
  }
  async getVectorMetadata(id) {
    const stmt = this.db.prepare('SELECT * FROM vector_metadata WHERE id = ?');
    const result = stmt.get(id);
    if (result) {
      result.tags = JSON.parse(result.tags);
      result.customMetadata = JSON.parse(result.custom_metadata);
    }
    return result;
  }
  async updateVectorMetadata(id, updates) {
    const fields = [];
    const values = [];
    Object.keys(updates).forEach(key => {
      if (key !== 'id') {
        if (key === 'tags' || key === 'customMetadata') {
          const dbKey = key === 'customMetadata' ? 'custom_metadata' : key;
          fields.push(`${dbKey} = ?`);
          values.push(JSON.stringify(updates[key]));
        } else {
          fields.push(`${key} = ?`);
          values.push(updates[key]);
        }
      }
    });
    if (fields.length === 0) return;
    fields.push('updated_at = ?');
    values.push(Date.now());
    values.push(id);
    const stmt = this.db.prepare(`UPDATE vector_metadata SET ${fields.join(', ')} WHERE id = ?`);
    return stmt.run(...values);
  }
  async deleteVectorMetadata(id) {
    const stmt = this.db.prepare('DELETE FROM vector_metadata WHERE id = ?');
    return stmt.run(id);
  }
  async searchVectorMetadata(filters = {}) {
    let query = 'SELECT * FROM vector_metadata WHERE 1=1';
    const params = [];
    if (filters.personaId) {
      query += ' AND persona_id = ?';
      params.push(filters.personaId);
    }
    if (filters.contentType) {
      query += ' AND content_type = ?';
      params.push(filters.contentType);
    }
    if (filters.source) {
      query += ' AND source = ?';
      params.push(filters.source);
    }
    query += ' ORDER BY created_at DESC';
    if (filters.limit) {
      query += ' LIMIT ?';
      params.push(filters.limit);
    }
    const stmt = this.db.prepare(query);
    const results = stmt.all(...params);
    return results.map(result => ({
      ...result,
      tags: JSON.parse(result.tags),
      customMetadata: JSON.parse(result.custom_metadata)
    }));
  }
  async insertPersona(personaData) {
    const stmt = this.db.prepare(`
      INSERT INTO personas (id, user_id, name, description, system_prompt, config, max_memory_size, memory_decay_time, created_at, updated_at, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const now = Date.now();
    return stmt.run(
      personaData.id,
      personaData.userId,
      personaData.name,
      personaData.description,
      personaData.systemPrompt,
      JSON.stringify(personaData.config || {}),
      personaData.maxMemorySize || 1000,
      personaData.memoryDecayTime || 604800000,
      now,
      now,
      personaData.isActive !== false ? 1 : 0
    );
  }
  async getPersonaById(id) {
    const stmt = this.db.prepare('SELECT * FROM personas WHERE id = ? AND is_active = 1');
    const result = stmt.get(id);
    if (result && result.config) {
      result.config = JSON.parse(result.config);
    }
    return result;
  }
  async listPersonas(userId, includeInactive = false) {
    const whereClause = includeInactive ? 'user_id = ?' : 'user_id = ? AND is_active = 1';
    const stmt = this.db.prepare(`
      SELECT * FROM personas
      WHERE ${whereClause}
      ORDER BY created_at DESC
    `);
    const results = stmt.all(userId);
    return results.map(persona => ({
      ...persona,
      config: JSON.parse(persona.config)
    }));
  }
  async updatePersona(id, updates) {
    const fields = [];
    const values = [];
    const fieldMapping = {
      'systemPrompt': 'system_prompt',
      'maxMemorySize': 'max_memory_size',
      'memoryDecayTime': 'memory_decay_time'
    };
    Object.keys(updates).forEach(key => {
      if (key !== 'id') {
        const dbField = fieldMapping[key] || key;
        if (key === 'config') {
          fields.push(`${dbField} = ?`);
          values.push(JSON.stringify(updates[key]));
        } else {
          fields.push(`${dbField} = ?`);
          values.push(updates[key]);
        }
      }
    });
    if (fields.length === 0) return;
    fields.push('updated_at = ?');
    values.push(Date.now());
    values.push(id);
    const stmt = this.db.prepare(`UPDATE personas SET ${fields.join(', ')} WHERE id = ?`);
    return stmt.run(...values);
  }
  async deletePersona(id) {
    const stmt = this.db.prepare('UPDATE personas SET is_active = 0, updated_at = ? WHERE id = ?');
    return stmt.run(Date.now(), id);
  }
  async insertAuditLog(logData) {
    const stmt = this.db.prepare(`
      INSERT INTO audit_logs (id, user_id, api_key_id, action, resource_type, resource_id, details, ip_address, user_agent, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    return stmt.run(
      logData.id,
      logData.userId,
      logData.apiKeyId,
      logData.action,
      logData.resourceType,
      logData.resourceId,
      JSON.stringify(logData.details || {}),
      logData.ipAddress,
      logData.userAgent,
      Date.now()
    );
  }
  async getAuditLogs(filters = {}) {
    let query = 'SELECT * FROM audit_logs WHERE 1=1';
    const params = [];
    if (filters.userId) {
      query += ' AND user_id = ?';
      params.push(filters.userId);
    }
    if (filters.action) {
      query += ' AND action = ?';
      params.push(filters.action);
    }
    if (filters.resourceType) {
      query += ' AND resource_type = ?';
      params.push(filters.resourceType);
    }
    if (filters.startDate) {
      query += ' AND created_at >= ?';
      params.push(filters.startDate);
    }
    if (filters.endDate) {
      query += ' AND created_at <= ?';
      params.push(filters.endDate);
    }
    query += ' ORDER BY created_at DESC';
    if (filters.limit) {
      query += ' LIMIT ?';
      params.push(filters.limit);
    }
    const stmt = this.db.prepare(query);
    const results = stmt.all(...params);
    return results.map(log => ({
      ...log,
      details: JSON.parse(log.details)
    }));
  }
  async insertEntity(entityData) {
    const stmt = this.db.prepare(`
      INSERT INTO entities (id, persona_id, vector_id, type, name, normalized_name, properties, confidence, content_hash, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const now = Date.now();
    return stmt.run(
      entityData.id,
      entityData.personaId,
      entityData.vectorId || null,
      entityData.type,
      entityData.name,
      entityData.normalizedName || entityData.name.toLowerCase(),
      JSON.stringify(entityData.properties || {}),
      entityData.confidence || 1.0,
      entityData.contentHash || null,
      now,
      now
    );
  }
  async getEntityById(id) {
    const stmt = this.db.prepare('SELECT * FROM entities WHERE id = ?');
    const result = stmt.get(id);
    if (result && result.properties) {
      result.properties = JSON.parse(result.properties);
    }
    return result;
  }
  async getEntitiesByPersona(personaId, filters = {}) {
    let query = 'SELECT * FROM entities WHERE persona_id = ?';
    const params = [personaId];
    if (filters.type) {
      query += ' AND type = ?';
      params.push(filters.type);
    }
    if (filters.minConfidence) {
      query += ' AND confidence >= ?';
      params.push(filters.minConfidence);
    }
    query += ' ORDER BY created_at DESC';
    if (filters.limit) {
      query += ' LIMIT ?';
      params.push(filters.limit);
    }
    const stmt = this.db.prepare(query);
    const results = stmt.all(...params);
    return results.map(result => ({
      ...result,
      properties: JSON.parse(result.properties)
    }));
  }
  async searchEntitiesByName(personaId, searchTerm, limit = 10) {
    const stmt = this.db.prepare(`
      SELECT * FROM entities
      WHERE persona_id = ? AND name LIKE ?
      ORDER BY confidence DESC, created_at DESC
      LIMIT ?
    `);
    const results = stmt.all(personaId, `%${searchTerm}%`, limit);
    return results.map(result => ({
      ...result,
      properties: JSON.parse(result.properties)
    }));
  }
  async updateEntity(id, updates) {
    const fields = [];
    const values = [];
    Object.keys(updates).forEach(key => {
      if (key !== 'id') {
        if (key === 'properties') {
          fields.push(`${key} = ?`);
          values.push(JSON.stringify(updates[key]));
        } else {
          fields.push(`${key} = ?`);
          values.push(updates[key]);
        }
      }
    });
    if (fields.length === 0) return;
    fields.push('updated_at = ?');
    values.push(Date.now());
    values.push(id);
    const stmt = this.db.prepare(`UPDATE entities SET ${fields.join(', ')} WHERE id = ?`);
    return stmt.run(...values);
  }
  async deleteEntity(id) {
    const stmt = this.db.prepare('DELETE FROM entities WHERE id = ?');
    return stmt.run(id);
  }
  async insertRelationship(relationshipData) {
    const stmt = this.db.prepare(`
      INSERT INTO relationships (id, persona_id, source_entity_id, target_entity_id, relationship_type, strength, context, properties, content_hash, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const now = Date.now();
    return stmt.run(
      relationshipData.id,
      relationshipData.personaId,
      relationshipData.sourceEntityId,
      relationshipData.targetEntityId,
      relationshipData.relationshipType,
      relationshipData.strength || 1.0,
      relationshipData.context || null,
      JSON.stringify(relationshipData.properties || {}),
      relationshipData.contentHash || null,
      now,
      now
    );
  }
  async getRelationshipById(id) {
    const stmt = this.db.prepare('SELECT * FROM relationships WHERE id = ?');
    const result = stmt.get(id);
    if (result && result.properties) {
      result.properties = JSON.parse(result.properties);
    }
    return result;
  }
  async findRelationshipByFields(personaId, sourceEntityId, targetEntityId, relationshipType) {
    const stmt = this.db.prepare(`
      SELECT * FROM relationships
      WHERE persona_id = ? AND source_entity_id = ? AND target_entity_id = ? AND relationship_type = ?
    `);
    const result = stmt.get(personaId, sourceEntityId, targetEntityId, relationshipType);
    if (result && result.properties) {
      result.properties = JSON.parse(result.properties);
    }
    return result;
  }
  async getEntityRelationships(entityId, direction = 'both', limit = 50) {
    let query;
    let params;
    if (direction === 'outgoing') {
      query = 'SELECT * FROM relationships WHERE source_entity_id = ? ORDER BY strength DESC, created_at DESC';
      params = [entityId];
    } else if (direction === 'incoming') {
      query = 'SELECT * FROM relationships WHERE target_entity_id = ? ORDER BY strength DESC, created_at DESC';
      params = [entityId];
    } else {
      query = 'SELECT * FROM relationships WHERE source_entity_id = ? OR target_entity_id = ? ORDER BY strength DESC, created_at DESC';
      params = [entityId, entityId];
    }
    if (limit) {
      query += ' LIMIT ?';
      params.push(limit);
    }
    const stmt = this.db.prepare(query);
    const results = stmt.all(...params);
    return results.map(result => ({
      ...result,
      properties: JSON.parse(result.properties)
    }));
  }
  async findRelatedEntities(entityId, maxDepth = 2, limit = 100) {
    const stmt = this.db.prepare(`
      WITH RECURSIVE entity_path(entity_id, source_id, depth, path) AS (
        -- Base case: start with the given entity
        SELECT ?, ?, 0, ?
        UNION
        -- Recursive case: find connected entities
        SELECT
          CASE
            WHEN r.source_entity_id = ep.entity_id THEN r.target_entity_id
            ELSE r.source_entity_id
          END as entity_id,
          ep.entity_id as source_id,
          ep.depth + 1,
          ep.path || ',' || (CASE
            WHEN r.source_entity_id = ep.entity_id THEN r.target_entity_id
            ELSE r.source_entity_id
          END)
        FROM entity_path ep
        JOIN relationships r ON (r.source_entity_id = ep.entity_id OR r.target_entity_id = ep.entity_id)
        WHERE ep.depth < ?
          AND (CASE
            WHEN r.source_entity_id = ep.entity_id THEN r.target_entity_id
            ELSE r.source_entity_id
          END) NOT IN (
            SELECT value FROM (
              SELECT TRIM(value) as value FROM (
                SELECT ep.path as text
                UNION ALL
                SELECT ',' || ep.entity_id
              ), json_each('["' || REPLACE(text, ',', '","') || '"]')
              WHERE value != ''
            )
          )
      )
      SELECT DISTINCT ep.entity_id, ep.depth, e.name, e.type, e.confidence
      FROM entity_path ep
      JOIN entities e ON e.id = ep.entity_id
      WHERE ep.entity_id != ?
      ORDER BY ep.depth, e.confidence DESC
      LIMIT ?
    `);
    const results = stmt.all(entityId, entityId, entityId, maxDepth, entityId, limit);
    return results;
  }
  async getRelationshipsByPersona(personaId, filters = {}) {
    let query = 'SELECT * FROM relationships WHERE persona_id = ?';
    const params = [personaId];
    if (filters.relationshipType) {
      query += ' AND relationship_type = ?';
      params.push(filters.relationshipType);
    }
    if (filters.minStrength) {
      query += ' AND strength >= ?';
      params.push(filters.minStrength);
    }
    query += ' ORDER BY strength DESC, created_at DESC';
    if (filters.limit) {
      query += ' LIMIT ?';
      params.push(filters.limit);
    }
    const stmt = this.db.prepare(query);
    const results = stmt.all(...params);
    return results.map(result => ({
      ...result,
      properties: JSON.parse(result.properties)
    }));
  }
  async updateRelationship(id, updates) {
    const fields = [];
    const values = [];
    Object.keys(updates).forEach(key => {
      if (key !== 'id') {
        if (key === 'properties') {
          fields.push(`${key} = ?`);
          values.push(JSON.stringify(updates[key]));
        } else {
          fields.push(`${key} = ?`);
          values.push(updates[key]);
        }
      }
    });
    if (fields.length === 0) return;
    fields.push('updated_at = ?');
    values.push(Date.now());
    values.push(id);
    const stmt = this.db.prepare(`UPDATE relationships SET ${fields.join(', ')} WHERE id = ?`);
    return stmt.run(...values);
  }
  async deleteRelationship(id) {
    const stmt = this.db.prepare('DELETE FROM relationships WHERE id = ?');
    return stmt.run(id);
  }
  async getGraphStats(personaId) {
    const entityStats = this.db.prepare(`
      SELECT type, COUNT(*) as count, AVG(confidence) as avg_confidence
      FROM entities
      WHERE persona_id = ?
      GROUP BY type
      ORDER BY count DESC
    `).all(personaId);
    const relationshipStats = this.db.prepare(`
      SELECT relationship_type, COUNT(*) as count, AVG(strength) as avg_strength
      FROM relationships
      WHERE persona_id = ?
      GROUP BY relationship_type
      ORDER BY count DESC
    `).all(personaId);
    const totalEntities = this.db.prepare('SELECT COUNT(*) as count FROM entities WHERE persona_id = ?').get(personaId);
    const totalRelationships = this.db.prepare('SELECT COUNT(*) as count FROM relationships WHERE persona_id = ?').get(personaId);
    return {
      totalEntities: totalEntities.count,
      totalRelationships: totalRelationships.count,
      entityTypes: entityStats,
      relationshipTypes: relationshipStats
    };
  }
  async getStats() {
    const stats = {};
    const tables = ['users', 'api_keys', 'vector_metadata', 'personas', 'refresh_tokens', 'audit_logs'];
    for (const table of tables) {
      const stmt = this.db.prepare(`SELECT COUNT(*) as count FROM ${table}`);
      stats[table] = stmt.get().count;
    }
    return stats;
  }
  async healthCheck() {
    try {
      const result = this.db.prepare('SELECT 1 as test').get();
      return result.test === 1;
    } catch (error) {
      logger.error('Database health check failed', { error: error.message });
      return false;
    }
  }
  async close() {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.isInitialized = false;
      logger.info('Database connection closed');
    }
  }
}
module.exports = DatabaseRepository;
