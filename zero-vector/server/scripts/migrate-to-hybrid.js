const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { v4: uuidv4 } = require('uuid');
const config = require('..__LITERAL_0__config');
const logger = require('..__LITERAL_1__tils__LITERAL_2__${batches.length}`, {
        batchSize: batch.length,
        progress: ((i __LITERAL_3__rc__LITERAL_4__EntityExtractor');
    const entityExtractor = new EntityExtractor();
    for (const memory of memories) {
      try {
        const metadata = JSON.parse(memory.metadata || '{}');
        const content = metadata.originalContent || metadata.content;
        if (!content || typeof content !== 'string' || content.trim().length === 0) {
          continue;
        }
        const entities = await entityExtractor.extractEntities(content, memory.persona_id);
        for (const entity of entities) {
          await this.createEntity(memory.persona_id, memory.id, entity);
        }
        if (entities.length > 1) {
          await this.createCooccurrenceRelationships(memory.persona_id, entities);
        }
        this.migrationStats.memoriesProcessed++;
      } catch (error) {
        logger.warn('Error processing memory for entity extraction', {
          memoryId: memory.id,
          error: error.message
        });
        this.migrationStats.errors.push({
          memoryId: memory.id,
          error: error.message,
          timestamp: Date.now()
        });
      }
    }
  }
  async createEntity(personaId, vectorId, entityData) {
    const entityId = uuidv4();
    const now = Date.now();
    const insertEntity = this.db.prepare(`
      INSERT INTO entities (
        id, persona_id, vector_id, type, name, properties,
        confidence, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    try {
      insertEntity.run(
        entityId,
        personaId,
        vectorId,
        entityData.type,
        entityData.name,
        JSON.stringify(entityData.properties || {}),
        entityData.confidence,
        now,
        now
      );
      this.migrationStats.entitiesCreated++;
      return entityId;
    } catch (error) {
      if (error.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
        logger.debug('Entity already exists', { name: entityData.name, type: entityData.type });
        return null;
      }
      throw error;
    }
  }
  async createCooccurrenceRelationships(personaId, entities) {
    const insertRelationship = this.db.prepare(`
      INSERT OR IGNORE INTO relationships (
        id, persona_id, source_entity_id, target_entity_id,
        relationship_type, strength, context, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const now = Date.now();
    for (let i = 0; i < entities.length; i++) {
      for (let j = i + 1; j < entities.length; j++) {
        const sourceEntity = entities[i];
        const targetEntity = entities[j];
        const relationshipId = uuidv4();
        const relationshipType = this.inferRelationshipType(sourceEntity, targetEntity);
        const strength = this.calculateCooccurrenceStrength(sourceEntity, targetEntity);
        try {
          insertRelationship.run(
            relationshipId,
            personaId,
            sourceEntity.id,
            targetEntity.id,
            relationshipType,
            strength,
            'Co-occurrence in memory',
            now,
            now
          );
          this.migrationStats.relationshipsCreated++;
        } catch (error) {
          if (error.code !== 'SQLITE_CONSTRAINT_UNIQUE') {
            logger.warn('Error creating relationship', {
              sourceEntity: sourceEntity.name,
              targetEntity: targetEntity.name,
              error: error.message
            });
          }
        }
      }
    }
  }
  inferRelationshipType(entity1, entity2) {
    if (entity1.type === 'PERSON' && entity2.type === 'PERSON') {
      return 'KNOWS';
    }
    if (entity1.type === 'PERSON' && entity2.type === 'ORGANIZATION') {
      return 'WORKS_FOR';
    }
    if (entity1.type === 'PERSON' && entity2.type === 'CONCEPT') {
      return 'INTERESTED_IN';
    }
    return 'RELATES_TO';
  }
  calculateCooccurrenceStrength(entity1, entity2) {
    let strength = 0.5;
    if (entity1.confidence > 0.8 && entity2.confidence > 0.8) {
      strength += 0.2;
    }
    if (entity1.type === 'PERSON' && entity2.type === 'PERSON') {
      strength += 0.1;
    }
    return Math.min(strength, 1.0);
  }
  async validatePostMigration() {
    const phaseStart = Date.now();
    logger.info('Validating migration results');
    const entityCount = this.db.prepare('SELECT COUNT(*) as count FROM entities').get().count;
    const relationshipCount = this.db.prepare('SELECT COUNT(*) as count FROM relationships').get().count;
    const orphanedEntities = this.db.prepare(`
      SELECT COUNT(*) as count FROM entities e
      WHERE e.vector_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM vector_metadata vm WHERE vm.id = e.vector_id)
    `).get().count;
    const orphanedRelationships = this.db.prepare(`
      SELECT COUNT(*) as count FROM relationships r
      WHERE NOT EXISTS (SELECT 1 FROM entities e WHERE e.id = r.source_entity_id)
      OR NOT EXISTS (SELECT 1 FROM entities e WHERE e.id = r.target_entity_id)
    `).get().count;
    if (orphanedEntities > 0 || orphanedRelationships > 0) {
      throw new Error(`Data integrity issues found: ${orphanedEntities} orphaned entities, ${orphanedRelationships} orphaned relationships`);
    }
    const entityTypes = this.db.prepare(`
      SELECT type, COUNT(*) as count FROM entities GROUP BY type
    `).all();
    const relationshipTypes = this.db.prepare(`
      SELECT relationship_type, COUNT(*) as count FROM relationships GROUP BY relationship_type
    `).all();
    logger.info('Migration validation passed', {
      entityCount,
      relationshipCount,
      entityTypes,
      relationshipTypes,
      orphanedEntities,
      orphanedRelationships
    });
    this.migrationStats.phases.validation = Date.now() - phaseStart;
    return {
      entityCount,
      relationshipCount,
      entityTypes,
      relationshipTypes
    };
  }
  async optimizeDatabase() {
    const phaseStart = Date.now();
    if (this.dryRun) {
      logger.info('DRY RUN: Would optimize database');
      this.migrationStats.phases.optimization = Date.now() - phaseStart;
      return;
    }
    logger.info('Optimizing database after migration');
    this.db.exec('ANALYZE');
    this.db.exec('VACUUM');
    this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec('PRAGMA cache_size = -65536');
    this.db.exec('PRAGMA temp_store = MEMORY');
    this.db.exec('PRAGMA mmap_size = 134217728');
    logger.info('Database optimization completed');
    this.migrationStats.phases.optimization = Date.now() - phaseStart;
  }
  async handleMigrationFailure(error) {
    logger.error('Migration failed, attempting rollback', { error: error.message });
    try {
      if (fs.existsSync(this.backupPath)) {
        if (this.db) {
          this.db.close();
        }
        fs.copyFileSync(this.backupPath, this.dbPath);
        logger.info('Database restored from backup', { backupPath: this.backupPath });
        await this.cleanupFailedMigration();
        return true;
      } else {
        logger.error('Backup file not found, cannot rollback', { backupPath: this.backupPath });
        return false;
      }
    } catch (rollbackError) {
      logger.error('Rollback failed', {
        originalError: error.message,
        rollbackError: rollbackError.message
      });
      return false;
    }
  }
  async cleanupFailedMigration() {
    logger.info('Cleaning up failed migration artifacts');
  }
  chunkArray(array, chunkSize) {
    const chunks = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }
}
if (require.main === module) {
  const args = process.argv.slice(2);
  const options = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--batch-size' && args[i + 1]) {
      options.batchSize = parseInt(args[i + 1], 10);
      i++;
    } else if (arg === '--db-path' && args[i + 1]) {
      options.dbPath = args[i + 1];
      i++;
    } else if (arg === '--backup-path' && args[i + 1]) {
      options.backupPath = args[i + 1];
      i++;
    }
  }
  const migrationManager = new HybridMigrationManager(options);
  migrationManager.performMigration()
    .then(stats => {
      console.log('\n✅ Migration completed successfully!');
      console.log(`📊 Processed ${stats.memoriesProcessed} memories`);
      console.log(`🏷️  Created ${stats.entitiesCreated} entities`);
      console.log(`🔗 Created ${stats.relationshipsCreated} relationships`);
      console.log(`⏱️  Total time: ${Date.now() - stats.startTime}ms`);
      if (stats.errors.length > 0) {
        console.log(`⚠️  ${stats.errors.length} errors occurred (check logs)`);
      }
      process.exit(0);
    })
    .catch(error => {
      console.error('\n❌ Migration failed:', error.message);
      console.error('Check logs for detailed error information');
      process.exit(1);
    });
}
module.exports = HybridMigrationManager;
