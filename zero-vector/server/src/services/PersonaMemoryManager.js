const { v4: uuidv4 } = require('uuid');
const { logger, logError } = require('../utils/logger');

class PersonaMemoryManager {
  constructor(database, vectorStore, embeddingService) {
    this.database = database;
    this.vectorStore = vectorStore;
    this.embeddingService = embeddingService;
    this.memoryTypes = {
      CONVERSATION: 'conversation',
      FACT: 'fact',
      PREFERENCE: 'preference',
      CONTEXT: 'context',
      SYSTEM: 'system'
    };
  }

  async createPersona(userId, personaData) {
    try {
      const personaId = uuidv4();

      const maxMemorySize = typeof personaData.maxMemorySize === 'number' ? personaData.maxMemorySize : 1000;
      const memoryDecayTime = typeof personaData.memoryDecayTime === 'number' ? personaData.memoryDecayTime : (7 * 24 * 60 * 60 * 1000);
      const temperature = typeof personaData.temperature === 'number' ? personaData.temperature : 0.7;
      const maxTokens = typeof personaData.maxTokens === 'number' ? personaData.maxTokens : 2048;
      const memoryRetrievalThreshold = typeof personaData.memoryRetrievalThreshold === 'number' ? personaData.memoryRetrievalThreshold : 0.7;

      const persona = {
        id: personaId,
        userId: userId,
        name: personaData.name,
        description: personaData.description || '',
        systemPrompt: personaData.systemPrompt || '',
        config: {
          temperature: temperature,
          maxTokens: maxTokens,
          embeddingProvider: personaData.embeddingProvider || 'local',
          embeddingModel: personaData.embeddingModel || 'text-embedding-3-small',
          memoryRetrievalThreshold: memoryRetrievalThreshold,
          ...personaData.config
        },
        maxMemorySize: maxMemorySize,
        memoryDecayTime: memoryDecayTime,
        isActive: true
      };

      await this.database.insertPersona(persona);

      logger.info('Persona created successfully', {
        personaId,
        userId,
        name: persona.name,
        maxMemorySize: persona.maxMemorySize
      });

      return persona;

    } catch (error) {
      logError(error, {
        operation: 'createPersona',
        userId,
        personaData: { name: personaData.name }
      });
      throw error;
    }
  }

  async getPersona(personaId, userId = null) {
    try {
      const persona = await this.database.getPersonaById(personaId);

      if (!persona) {
        throw new Error('Persona not found');
      }

      if (userId && persona.user_id !== userId) {
        throw new Error('Access denied: Persona does not belong to user');
      }

      return this.formatPersonaResponse(persona);

    } catch (error) {
      logError(error, {
        operation: 'getPersona',
        personaId,
        userId
      });
      throw error;
    }
  }

  async listPersonas(userId, includeInactive = false) {
    try {
      const personas = await this.database.listPersonas(userId, includeInactive);

      const formattedPersonas = await Promise.all(
        personas.map(async (persona) => {
          const stats = await this.getPersonaMemoryStats(persona.id);
          return {
            ...this.formatPersonaResponse(persona),
            memoryStats: stats
          };
        })
      );

      return formattedPersonas;

    } catch (error) {
      logError(error, {
        operation: 'listPersonas',
        userId
      });
      throw error;
    }
  }

  async updatePersona(personaId, userId, updates) {
    try {
      const existingPersona = await this.getPersona(personaId, userId);

      const allowedUpdates = {
        name: updates.name,
        description: updates.description,
        systemPrompt: updates.systemPrompt,
        maxMemorySize: updates.maxMemorySize,
        memoryDecayTime: updates.memoryDecayTime,
        isActive: updates.isActive
      };

      if (updates.config) {
        allowedUpdates.config = {
          ...existingPersona.config,
          ...updates.config
        };
      }

      Object.keys(allowedUpdates).forEach(key => {
        if (allowedUpdates[key] === undefined) {
          delete allowedUpdates[key];
        }
      });

      await this.database.updatePersona(personaId, allowedUpdates);

      await this.database.insertAuditLog({
        id: uuidv4(),
        userId: userId,
        action: 'UPDATE_PERSONA',
        resourceType: 'persona',
        resourceId: personaId,
        details: allowedUpdates
      });

      logger.info('Persona updated successfully', {
        personaId,
        userId,
        updates: Object.keys(allowedUpdates)
      });

      return await this.getPersona(personaId, userId);

    } catch (error) {
      logError(error, {
        operation: 'updatePersona',
        personaId,
        userId
      });
      throw error;
    }
  }

  async deletePersona(personaId, userId) {
    try {
      await this.getPersona(personaId, userId);

      await this.database.deletePersona(personaId);

      await this.cleanupPersonaMemories(personaId);

      await this.database.insertAuditLog({
        id: uuidv4(),
        userId: userId,
        action: 'DELETE_PERSONA',
        resourceType: 'persona',
        resourceId: personaId,
        details: { action: 'soft_delete' }
      });

      logger.info('Persona deleted successfully', { personaId, userId });

    } catch (error) {
      logError(error, {
        operation: 'deletePersona',
        personaId,
        userId
      });
      throw error;
    }
  }

  async addMemory(personaId, content, context = {}) {
    try {
      const persona = await this.database.getPersonaById(personaId);
      if (!persona) {
        throw new Error('Persona not found');
      }

      const provider = persona.config.embeddingProvider || 'local';
      const model = persona.config.embeddingModel || (provider === 'openai' ? 'text-embedding-3-small' : 'all-MiniLM-L6-v2');

      const embeddingResult = await this.embeddingService.generateEmbedding(content, {
        provider: provider,
        model: model,
        useCache: true
      });

      const memoryId = uuidv4();
      const timestamp = Date.now();
      const memoryMetadata = {
        personaId: personaId,
        originalContent: content,
        memoryType: context.type || this.memoryTypes.CONVERSATION,
        importance: typeof context.importance === 'number' ? context.importance : 0.5,
        conversationId: context.conversationId || null,
        speaker: context.speaker || null,
        timestamp: timestamp,
        embeddingProvider: embeddingResult.provider,
        embeddingModel: embeddingResult.model,
        context: context
      };

      const storeResult = await this.vectorStore.addVector(
        embeddingResult.vector,
        memoryId,
        memoryMetadata
      );

      await this.database.insertVectorMetadata({
        id: memoryId,
        dimensions: embeddingResult.vector.length,
        personaId: personaId,
        contentType: 'persona_memory',
        source: 'memory_manager',
        tags: [context.type || this.memoryTypes.CONVERSATION],
        customMetadata: memoryMetadata
      });

      await this.enforceMemoryLimits(personaId);

      logger.info('Memory added to persona', {
        personaId,
        memoryId,
        memoryType: memoryMetadata.memoryType,
        contentLength: content.length
      });

      return {
        id: memoryId,
        content: content,
        type: memoryMetadata.memoryType,
        timestamp: memoryMetadata.timestamp,
        slotIndex: storeResult.slotIndex
      };

    } catch (error) {
      logError(error, {
        operation: 'addMemory',
        personaId,
        contentLength: content?.length
      });
      throw error;
    }
  }

  async retrieveRelevantMemories(personaId, query, options = {}) {
    try {
      logger.info('Starting retrieveRelevantMemories', {
        personaId,
        query: query.substring(0, 50),
        options
      });

      const {
        limit = 5,
        threshold = 0.7,
        memoryTypes = null,
        maxAge = null,
        includeContext = true
      } = options;

      const persona = await this.database.getPersonaById(personaId);
      if (!persona) {
        throw new Error('Persona not found');
      }

      const provider = persona.config.embeddingProvider || 'local';
      const model = persona.config.embeddingModel || (provider === 'openai' ? 'text-embedding-3-small' : 'all-MiniLM-L6-v2');

      const queryEmbedding = await this.embeddingService.generateEmbedding(query, {
        provider: provider,
        model: model,
        useCache: true
      });

      const searchResults = await this.vectorStore.search(queryEmbedding.vector, {
        limit: limit * 2,
        threshold: threshold,
        metric: 'cosine',
        filters: { personaId: personaId },
        includeValues: false,
        includeMetadata: true,
        useIndex: true
      });

      let filteredResults = searchResults;

      if (memoryTypes && Array.isArray(memoryTypes)) {
        filteredResults = filteredResults.filter(result =>
          memoryTypes.includes(result.metadata.memoryType)
        );
      }

      if (maxAge) {
        const cutoffTime = Date.now() - maxAge;
        filteredResults = filteredResults.filter(result =>
          result.metadata.timestamp >= cutoffTime
        );
      }

      filteredResults.sort((a, b) => {
        const scoreA = a.similarity + (a.metadata.importance || 0.5) * 0.1;
        const scoreB = b.similarity + (b.metadata.importance || 0.5) * 0.1;
        return scoreB - scoreA;
      });

      filteredResults = filteredResults.slice(0, limit);

      logger.info('Vector search results before enrichment', {
        personaId,
        resultCount: filteredResults.length,
        sampleResults: filteredResults.slice(0, 2).map(r => ({
          id: r.id,
          similarity: r.similarity,
          hasMetadata: !!r.metadata,
          metadataKeys: r.metadata ? Object.keys(r.metadata) : [],
          hasOriginalContent: !!(r.metadata && r.metadata.originalContent),
          originalContentPreview: r.metadata && r.metadata.originalContent ?
            r.metadata.originalContent.substring(0, 50) + '...' : 'MISSING'
        }))
      });

      if (includeContext) {
        for (const result of filteredResults) {
          try {
            if (!result.metadata.originalContent) {
              logger.info('Missing originalContent in vector metadata, fetching from database', {
                memoryId: result.id,
                vectorMetadataKeys: Object.keys(result.metadata || {})
              });

              const dbMetadata = await this.database.getVectorMetadata(result.id);
              if (dbMetadata && dbMetadata.customMetadata) {
                result.metadata = {
                  ...result.metadata,
                  ...dbMetadata.customMetadata,
                  originalContent: dbMetadata.customMetadata.originalContent
                };

                logger.info('Enriched memory metadata from database', {
                  memoryId: result.id,
                  hasOriginalContent: !!dbMetadata.customMetadata.originalContent,
                  customMetadataKeys: Object.keys(dbMetadata.customMetadata || {}),
                  originalContentLength: dbMetadata.customMetadata.originalContent ?
                    dbMetadata.customMetadata.originalContent.length : 0
                });
              } else {
                logger.warn('No database metadata found for memory', {
                  memoryId: result.id,
                  dbMetadata: !!dbMetadata,
                  hasCustomMetadata: !!(dbMetadata && dbMetadata.customMetadata)
                });
              }
            } else {
              logger.info('originalContent already present in vector metadata', {
                memoryId: result.id,
                originalContentLength: result.metadata.originalContent.length
              });
            }
          } catch (error) {
            logger.error('Failed to fetch metadata for memory', {
              memoryId: result.id,
              error: error.message,
              stack: error.stack
            });
          }
        }
      }

      logger.info('Final enriched results', {
        personaId,
        resultCount: filteredResults.length,
        sampleResults: filteredResults.slice(0, 2).map(r => ({
          id: r.id,
          similarity: r.similarity,
          hasOriginalContent: !!(r.metadata && r.metadata.originalContent),
          originalContentPreview: r.metadata && r.metadata.originalContent ?
            r.metadata.originalContent.substring(0, 50) + '...' : 'STILL MISSING',
          metadataKeys: r.metadata ? Object.keys(r.metadata) : []
        }))
      });

      logger.info('Retrieved relevant memories', {
        personaId,
        query: query.substring(0, 100),
        resultCount: filteredResults.length,
        avgSimilarity: filteredResults.length > 0
          ? (filteredResults.reduce((sum, r) => sum + r.similarity, 0) / filteredResults.length).toFixed(3)
          : 0
      });

      return filteredResults;

    } catch (error) {
      logError(error, {
        operation: 'retrieveRelevantMemories',
        personaId,
        query: query?.substring(0, 100)
      });
      throw error;
    }
  }

  async addConversationExchange(personaId, userMessage, assistantResponse, conversationId = null) {
    try {
      const convId = conversationId || uuidv4();
      const timestamp = Date.now();

      const userMemory = await this.addMemory(personaId, userMessage, {
        type: this.memoryTypes.CONVERSATION,
        conversationId: convId,
        speaker: 'user',
        importance: 0.6,
        exchange_type: 'user_input'
      });

      const assistantMemory = await this.addMemory(personaId, assistantResponse, {
        type: this.memoryTypes.CONVERSATION,
        conversationId: convId,
        speaker: 'assistant',
        importance: 0.5,
        exchange_type: 'assistant_response'
      });

      logger.info('Conversation exchange added to memory', {
        personaId,
        conversationId: convId,
        userMessageLength: userMessage.length,
        assistantResponseLength: assistantResponse.length
      });

      return {
        conversationId: convId,
        userMemory,
        assistantMemory,
        timestamp
      };

    } catch (error) {
      logError(error, {
        operation: 'addConversationExchange',
        personaId,
        conversationId
      });
      throw error;
    }
  }

  async getConversationHistory(personaId, conversationId, limit = 20) {
    try {
      const memories = await this.database.searchVectorMetadata({
        personaId: personaId,
        limit: limit * 2
      });

      const conversationMemories = memories
        .filter(memory => {
          const customMeta = memory.customMetadata || {};
          return customMeta.conversationId === conversationId &&
                 customMeta.memoryType === this.memoryTypes.CONVERSATION;
        })
        .sort((a, b) => {
          const timestampA = (a.customMetadata || {}).timestamp || 0;
          const timestampB = (b.customMetadata || {}).timestamp || 0;
          return timestampA - timestampB;
        })
        .slice(0, limit);

      logger.info('Retrieved conversation history', {
        personaId,
        conversationId,
        memoryCount: conversationMemories.length
      });

      return conversationMemories.map(memory => {
        const customMeta = memory.customMetadata || {};
        return {
          id: memory.id,
          content: customMeta.originalContent || '',
          speaker: customMeta.speaker || 'unknown',
          timestamp: customMeta.timestamp || 0,
          type: customMeta.exchange_type || 'unknown'
        };
      });

    } catch (error) {
      logError(error, {
        operation: 'getConversationHistory',
        personaId,
        conversationId
      });
      throw error;
    }
  }

  async getPersonaMemoryStats(personaId) {
    try {
      const memories = await this.database.searchVectorMetadata({
        personaId: personaId,
        limit: 10000
      });

      const stats = {
        totalMemories: memories.length,
        memoryTypeBreakdown: {},
        oldestMemory: null,
        newestMemory: null,
        averageImportance: 0,
        conversationCount: 0
      };

      if (memories.length > 0) {
        memories.forEach(memory => {
          const customMeta = memory.customMetadata || {};
          const type = customMeta.memoryType || 'unknown';
          stats.memoryTypeBreakdown[type] = (stats.memoryTypeBreakdown[type] || 0) + 1;
        });

        const validTimestamps = memories
          .map(m => (m.customMetadata || {}).timestamp)
          .filter(timestamp => timestamp && typeof timestamp === 'number');

        if (validTimestamps.length > 0) {
          stats.oldestMemory = Math.min(...validTimestamps);
          stats.newestMemory = Math.max(...validTimestamps);
        }

        const importanceSum = memories.reduce(
          (sum, memory) => {
            const customMeta = memory.customMetadata || {};
            const importance = customMeta.importance;
            return sum + (typeof importance === 'number' ? importance : 0.5);
          },
          0
        );
        stats.averageImportance = importanceSum / memories.length;

        const conversationIds = new Set(
          memories
            .map(m => (m.customMetadata || {}).conversationId)
            .filter(id => id && typeof id === 'string')
        );
        stats.conversationCount = conversationIds.size;
      }

      return stats;

    } catch (error) {
      logError(error, {
        operation: 'getPersonaMemoryStats',
        personaId
      });
      return {
        totalMemories: 0,
        memoryTypeBreakdown: {},
        oldestMemory: null,
        newestMemory: null,
        averageImportance: 0,
        conversationCount: 0
      };
    }
  }

  async enforceMemoryLimits(personaId) {
    try {
      const persona = await this.database.getPersonaById(personaId);
      if (!persona) return;

      const memories = await this.database.searchVectorMetadata({
        personaId: personaId,
        limit: 10000
      });

      if (memories.length <= persona.max_memory_size) return;

      memories.sort((a, b) => {
        const customMetaA = a.customMetadata || {};
        const customMetaB = b.customMetadata || {};

        const importanceA = typeof customMetaA.importance === 'number' ? customMetaA.importance : 0.5;
        const importanceB = typeof customMetaB.importance === 'number' ? customMetaB.importance : 0.5;

        const timestampA = typeof customMetaA.timestamp === 'number' ? customMetaA.timestamp : Date.now();
        const timestampB = typeof customMetaB.timestamp === 'number' ? customMetaB.timestamp : Date.now();

        const scoreA = importanceA + (1 - (Date.now() - timestampA) / (30 * 24 * 60 * 60 * 1000)) * 0.3;
        const scoreB = importanceB + (1 - (Date.now() - timestampB) / (30 * 24 * 60 * 60 * 1000)) * 0.3;

        return scoreB - scoreA;
      });

      const memoriesToRemove = memories.slice(persona.max_memory_size);

      for (const memory of memoriesToRemove) {
        await this.removeMemory(memory.id);
      }

      logger.info('Memory limits enforced', {
        personaId,
        totalMemories: memories.length,
        removedCount: memoriesToRemove.length,
        remainingCount: persona.max_memory_size
      });

    } catch (error) {
      logError(error, {
        operation: 'enforceMemoryLimits',
        personaId
      });
    }
  }

  async reloadMemoriesFromDatabase() {
    try {
      logger.info('Starting memory reload from database...');

      const allMemories = await this.database.searchVectorMetadata({ limit: 50000 });

      if (!allMemories || allMemories.length === 0) {
        logger.info('No existing memories found in database');
        return { reloaded: 0, errors: 0 };
      }

      logger.info('Found memories in database, starting reload process', {
        totalMemories: allMemories.length
      });

      let reloadedCount = 0;
      let errorCount = 0;

      const batchSize = 50;
      for (let i = 0; i < allMemories.length; i += batchSize) {
        const batch = allMemories.slice(i, i + batchSize);

        logger.info(`Processing memory batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(allMemories.length/batchSize)}`, {
          batchStart: i,
          batchSize: batch.length
        });

        for (const memoryRecord of batch) {
          try {
            const customMeta = memoryRecord.customMetadata || {};
            const originalContent = customMeta.originalContent;

            if (!originalContent) {
              logger.warn('Memory missing originalContent, skipping', {
                memoryId: memoryRecord.id,
                availableKeys: Object.keys(customMeta)
              });
              errorCount++;
              continue;
            }

            const persona = await this.database.getPersonaById(memoryRecord.persona_id);
            if (!persona) {
              logger.warn('Persona not found for memory, skipping', {
                memoryId: memoryRecord.id,
                personaId: memoryRecord.persona_id
              });
              errorCount++;
              continue;
            }

            const embeddingResult = await this.embeddingService.generateEmbedding(originalContent, {
              provider: persona.config.embeddingProvider || 'local',
              model: persona.config.embeddingModel,
              useCache: false
            });

            await this.vectorStore.addVector(
              embeddingResult.vector,
              memoryRecord.id,
              customMeta
            );

            reloadedCount++;

            if (reloadedCount % 10 === 0) {
              logger.info(`Reloaded ${reloadedCount}/${allMemories.length} memories...`);
            }

          } catch (error) {
            logger.error('Failed to reload memory', {
              memoryId: memoryRecord.id,
              error: error.message
            });
            errorCount++;
          }
        }

        if (i + batchSize < allMemories.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      logger.info('Memory reload from database completed', {
        totalFound: allMemories.length,
        reloaded: reloadedCount,
        errors: errorCount,
        vectorStoreCount: this.vectorStore.vectorCount
      });

      return { reloaded: reloadedCount, errors: errorCount };

    } catch (error) {
      logError(error, { operation: 'reloadMemoriesFromDatabase' });
      throw error;
    }
  }

  async cleanupExpiredMemories() {
    try {
      let totalCleaned = 0;

      const allUsers = await this.database.getStats();

      const personas = await this.database.searchVectorMetadata({ limit: 10000 });
      const personaIds = [...new Set(personas.map(m => m.persona_id).filter(Boolean))];

      for (const personaId of personaIds) {
        try {
          const persona = await this.database.getPersonaById(personaId);
          if (!persona) continue;

          const expiredTime = Date.now() - persona.memory_decay_time;
          const memories = await this.database.searchVectorMetadata({
            personaId: personaId,
            limit: 10000
          });

          const expiredMemories = memories.filter(
            memory => {
              const customMeta = memory.customMetadata || {};
              const timestamp = customMeta.timestamp;
              return typeof timestamp === 'number' && timestamp < expiredTime;
            }
          );

          for (const memory of expiredMemories) {
            await this.removeMemory(memory.id);
            totalCleaned++;
          }

        } catch (error) {
          logger.warn('Failed to cleanup memories for persona', {
            personaId,
            error: error.message
          });
        }
      }

      logger.info('Memory cleanup completed', {
        totalCleaned,
        processedPersonas: personaIds.length
      });

      return { totalCleaned };

    } catch (error) {
      logError(error, {
        operation: 'cleanupExpiredMemories'
      });
      throw error;
    }
  }

  async removeMemory(memoryId) {
    try {
      await this.vectorStore.deleteVector(memoryId);

      await this.database.deleteVectorMetadata(memoryId);

      logger.debug('Memory removed', { memoryId });

    } catch (error) {
      logError(error, {
        operation: 'removeMemory',
        memoryId
      });
      throw error;
    }
  }

  async cleanupPersonaMemories(personaId) {
    try {
      const memories = await this.database.searchVectorMetadata({
        personaId: personaId,
        limit: 10000
      });

      for (const memory of memories) {
        await this.removeMemory(memory.id);
      }

      logger.info('Persona memories cleaned up', {
        personaId,
        removedCount: memories.length
      });

    } catch (error) {
      logError(error, {
        operation: 'cleanupPersonaMemories',
        personaId
      });
    }
  }

  formatPersonaResponse(persona) {
    const createdAt = this.safeTimestamp(persona.created_at);
    const updatedAt = this.safeTimestamp(persona.updated_at);

    return {
      id: persona.id,
      userId: persona.user_id,
      name: persona.name,
      description: persona.description,
      systemPrompt: persona.system_prompt,
      config: persona.config,
      maxMemorySize: persona.max_memory_size,
      memoryDecayTime: persona.memory_decay_time,
      createdAt: createdAt,
      updatedAt: updatedAt,
      isActive: Boolean(persona.is_active)
    };
  }

  safeTimestamp(timestamp) {
    if (!timestamp && timestamp !== 0) {
      return Date.now();
    }

    let numericTimestamp;
    if (typeof timestamp === 'string') {
      numericTimestamp = parseInt(timestamp, 10);
      if (isNaN(numericTimestamp)) {
        return Date.now();
      }
    } else if (typeof timestamp === 'number') {
      numericTimestamp = timestamp;
    } else {
      return Date.now();
    }

    if (numericTimestamp < 0 || numericTimestamp > Date.now() + (365 * 24 * 60 * 60 * 1000)) {
      return Date.now();
    }

    try {
      const date = new Date(numericTimestamp);
      if (isNaN(date.getTime())) {
        return Date.now();
      }
      return numericTimestamp;
    } catch (error) {
      return Date.now();
    }
  }
}

module.exports = PersonaMemoryManager;
