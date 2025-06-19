const IndexedVectorStore = require('./IndexedVectorStore');
const GraphDatabaseService = require('./GraphDatabaseService');
const EntityExtractor = require('./EntityExtractor');
const { logger, logError } = require('../utils/logger');

class HybridVectorStore extends IndexedVectorStore {
  constructor(maxMemoryMB, dimensions, indexOptions, database, embeddingService) {
    super(maxMemoryMB, dimensions, indexOptions);

    this.database = database;
    this.embeddingService = embeddingService;
    this.graphService = new GraphDatabaseService(database);
    this.entityExtractor = new EntityExtractor(embeddingService);

    this.graphEnabled = true;
    this.entityExtractionEnabled = true;
    this.relationshipExtractionEnabled = true;

    this.hybridStats = {
      graphProcessingTime: 0,
      entitiesExtracted: 0,
      relationshipsCreated: 0,
      hybridSearches: 0,
      graphExpansions: 0
    };

    logger.info('HybridVectorStore initialized', {
      maxMemoryMB,
      dimensions,
      graphEnabled: this.graphEnabled,
      entityExtractionEnabled: this.entityExtractionEnabled
    });
  }

  async addVector(vector, id, metadata = {}) {
    const startTime = Date.now();

    try {
      const vectorResult = super.addVector(vector, id, metadata);

      if (this.database) {
        await this.createVectorMetadata(id, vector, metadata);
      }

      if (this.graphEnabled && metadata.originalContent && metadata.personaId) {
        await this.processGraphAssociations(id, metadata);
      }

      const duration = Date.now() - startTime;
      logger.debug('Hybrid vector addition completed', {
        id,
        duration,
        graphProcessed: this.graphEnabled && metadata.originalContent && metadata.personaId,
        metadataCreated: !!this.database
      });

      return vectorResult;

    } catch (error) {
      logError(error, {
        operation: 'hybridAddVector',
        id,
        hasOriginalContent: !!metadata.originalContent,
        hasPersonaId: !!metadata.personaId
      });
      throw error;
    }
  }

  async hybridSearch(queryVector, options = {}) {
    const startTime = Date.now();

    try {
      const {
        useGraphExpansion = true,
        graphDepth = 2,
        graphWeight = 0.3,
        ...vectorSearchOptions
      } = options;

      const vectorResults = await this.search(queryVector, vectorSearchOptions);

      if (useGraphExpansion && this.graphEnabled && vectorResults.length > 0) {
        const expandedResults = await this.expandWithGraphContext(
          vectorResults,
          {
            graphDepth,
            graphWeight,
            ...options
          }
        );

        this.hybridStats.hybridSearches++;
        if (expandedResults.length > vectorResults.length) {
          this.hybridStats.graphExpansions++;
        }

        const duration = Date.now() - startTime;
        logger.debug('Hybrid search completed with graph expansion', {
          originalResults: vectorResults.length,
          expandedResults: expandedResults.length,
          duration,
          graphDepth,
          graphWeight
        });

        return expandedResults;
      }

      this.hybridStats.hybridSearches++;
      const duration = Date.now() - startTime;

      logger.debug('Hybrid search completed without graph expansion', {
        resultCount: vectorResults.length,
        duration,
        graphExpansionSkipped: !useGraphExpansion || !this.graphEnabled
      });

      return vectorResults;

    } catch (error) {
      logError(error, {
        operation: 'hybridSearch',
        useGraphExpansion: options.useGraphExpansion
      });
      return await this.search(queryVector, vectorSearchOptions);
    }
  }

  async createVectorMetadata(vectorId, vector, metadata) {
    try {
      const existingMetadata = await this.database.getVectorMetadata(vectorId);
      if (existingMetadata) {
        logger.debug('Vector metadata already exists, skipping creation', {
          vectorId,
          personaId: metadata.personaId
        });
        return;
      }

      const vectorMetadata = {
        id: vectorId,
        dimensions: vector.length,
        personaId: metadata.personaId || null,
        contentType: metadata.type || metadata.contentType || 'memory',
        source: metadata.source || 'user_input',
        tags: metadata.tags || [],
        customMetadata: {
          importance: metadata.importance,
          context: metadata.context,
          originalContent: metadata.originalContent ? metadata.originalContent.substring(0, 1000) : null,
          memoryType: metadata.type,
          ...metadata.customMetadata
        }
      };

      await this.database.insertVectorMetadata(vectorMetadata);

      logger.debug('Vector metadata created successfully', {
        vectorId,
        personaId: vectorMetadata.personaId,
        dimensions: vectorMetadata.dimensions,
        contentType: vectorMetadata.contentType
      });

    } catch (error) {
      logError(error, {
        operation: 'createVectorMetadata',
        vectorId,
        personaId: metadata.personaId
      });
      logger.warn('Failed to create vector metadata, continuing without database record', {
        vectorId,
        error: error.message
      });
    }
  }

  async processGraphAssociations(vectorId, metadata) {
    if (!this.entityExtractionEnabled || !metadata.originalContent || !metadata.personaId) {
      return;
    }

    const startTime = Date.now();

    try {
      logger.debug('Starting graph processing', {
        vectorId,
        personaId: metadata.personaId,
        contentLength: metadata.originalContent.length
      });

      const entities = await this.entityExtractor.extractEntities(
        metadata.originalContent,
        metadata.personaId,
        vectorId
      );

      if (entities.length === 0) {
        logger.debug('No entities extracted from content', { vectorId });
        return;
      }

      let relationships = [];
      if (this.relationshipExtractionEnabled && entities.length > 1) {
        relationships = await this.entityExtractor.findEntityRelationships(
          entities,
          metadata.originalContent
        );
      }

      const processingResult = await this.graphService.processEntitiesAndRelationships(
        entities,
        relationships
      );

      this.hybridStats.entitiesExtracted += processingResult.summary.entitiesProcessed;
      this.hybridStats.relationshipsCreated += processingResult.summary.relationshipsProcessed;

      const duration = Date.now() - startTime;
      this.hybridStats.graphProcessingTime += duration;

      logger.info('Graph processing completed', {
        vectorId,
        personaId: metadata.personaId,
        entitiesProcessed: processingResult.summary.entitiesProcessed,
        relationshipsProcessed: processingResult.summary.relationshipsProcessed,
        duration
      });

    } catch (error) {
      logError(error, {
        operation: 'processGraphAssociations',
        vectorId,
        personaId: metadata.personaId
      });
    }
  }

  async expandWithGraphContext(vectorResults, options = {}) {
    try {
      const {
        graphDepth = 2,
        graphWeight = 0.3,
        maxGraphResults = 10,
        personaId = null
      } = options;

      if (!vectorResults || vectorResults.length === 0) {
        return vectorResults;
      }

      const entityIds = [];
      for (const result of vectorResults) {
        if (result.metadata && result.metadata.personaId) {
          try {
            const entities = await this.database.getEntitiesByPersona(
              result.metadata.personaId,
              { vectorId: result.id, limit: 5 }
            );
            entityIds.push(...entities.map(e => e.id));
          } catch (error) {
            logger.debug('Failed to get entities for vector', { vectorId: result.id });
          }
        }
      }

      if (entityIds.length === 0) {
        logger.debug('No entities found for graph expansion');
        return vectorResults;
      }

      const relatedEntities = [];
      for (const entityId of entityIds.slice(0, 5)) {
        try {
          const related = await this.graphService.findRelatedEntities(entityId, {
            maxDepth: graphDepth,
            limit: maxGraphResults,
            minStrength: 0.3
          });
          relatedEntities.push(...related);
        } catch (error) {
          logger.debug('Failed to find related entities', { entityId });
        }
      }

      const graphVectorIds = new Set();
      for (const entity of relatedEntities) {
        try {
          const entityData = await this.database.getEntityById(entity.id);
          if (entityData && entityData.vector_id && entityData.vector_id !== vectorResults.find(r => r.id === entityData.vector_id)) {
            graphVectorIds.add(entityData.vector_id);
          }
        } catch (error) {
          logger.debug('Failed to get entity data', { entityId: entity.id });
        }
      }

      const graphResults = [];
      for (const vectorId of Array.from(graphVectorIds).slice(0, maxGraphResults)) {
        try {
          const vectorMeta = this.metadata.get(vectorId);
          if (vectorMeta) {
            graphResults.push({
              id: vectorId,
              similarity: 0.5,
              metadata: vectorMeta,
              source: 'graph_expansion'
            });
          }
        } catch (error) {
          logger.debug('Failed to get vector metadata', { vectorId });
        }
      }

      const combinedResults = [...vectorResults];

      for (const graphResult of graphResults) {
        const existingIndex = combinedResults.findIndex(r => r.id === graphResult.id);

        if (existingIndex >= 0) {
          combinedResults[existingIndex].similarity = Math.min(
            1.0,
            combinedResults[existingIndex].similarity + (graphWeight * 0.2)
          );
          combinedResults[existingIndex].graphBoosted = true;
        } else {
          combinedResults.push({
            ...graphResult,
            similarity: graphResult.similarity * graphWeight,
            graphExpanded: true
          });
        }
      }

      combinedResults.sort((a, b) => b.similarity - a.similarity);
      const finalResults = combinedResults.slice(0, options.limit || 10);

      logger.debug('Graph expansion completed', {
        originalResults: vectorResults.length,
        graphResults: graphResults.length,
        finalResults: finalResults.length,
        graphWeight
      });

      return finalResults;

    } catch (error) {
      logError(error, { operation: 'expandWithGraphContext' });
      return vectorResults;
    }
  }

  getStats() {
    const baseStats = super.getStats();

    return {
      ...baseStats,
      hybrid: {
        graphEnabled: this.graphEnabled,
        entityExtractionEnabled: this.entityExtractionEnabled,
        relationshipExtractionEnabled: this.relationshipExtractionEnabled,
        ...this.hybridStats,
        avgGraphProcessingTime: this.hybridStats.entitiesExtracted > 0
          ? (this.hybridStats.graphProcessingTime / this.hybridStats.entitiesExtracted).toFixed(2) + 'ms'
          : '0ms'
      }
    };
  }

  setGraphEnabled(enabled) {
    this.graphEnabled = enabled;
    logger.info(`Graph processing ${enabled ? 'enabled' : 'disabled'}`);
  }

  setEntityExtractionEnabled(enabled) {
    this.entityExtractionEnabled = enabled;
    logger.info(`Entity extraction ${enabled ? 'enabled' : 'disabled'}`);
  }

  setRelationshipExtractionEnabled(enabled) {
    this.relationshipExtractionEnabled = enabled;
    logger.info(`Relationship extraction ${enabled ? 'enabled' : 'disabled'}`);
  }

  async searchGraphEntities(personaId, query, options = {}) {
    try {
      if (!this.graphEnabled) {
        return [];
      }

      return await this.graphService.searchEntities(personaId, query, options);

    } catch (error) {
      logError(error, {
        operation: 'searchGraphEntities',
        personaId,
        query
      });
      return [];
    }
  }

  async getGraphStatistics(personaId) {
    try {
      if (!this.graphEnabled) {
        return null;
      }

      return await this.graphService.getGraphStatistics(personaId);

    } catch (error) {
      logError(error, {
        operation: 'getGraphStatistics',
        personaId
      });
      return null;
    }
  }

  async findRelatedEntities(entityId, options = {}) {
    try {
      if (!this.graphEnabled) {
        return [];
      }

      return await this.graphService.findRelatedEntities(entityId, options);

    } catch (error) {
      logError(error, {
        operation: 'findRelatedEntities',
        entityId
      });
      return [];
    }
  }

  async getGraphContext(entityIds, options = {}) {
    try {
      if (!this.graphEnabled) {
        return { entities: [], relationships: [], connections: [] };
      }

      return await this.graphService.getGraphContext(entityIds, options);

    } catch (error) {
      logError(error, {
        operation: 'getGraphContext',
        entityIds
      });
      return { entities: [], relationships: [], connections: [] };
    }
  }

  cleanup() {
    super.cleanup();

    const hybridStats = this.getStats().hybrid;
    logger.info('Hybrid vector store cleanup completed', {
      entitiesExtracted: hybridStats.entitiesExtracted,
      relationshipsCreated: hybridStats.relationshipsCreated,
      hybridSearches: hybridStats.hybridSearches,
      graphExpansions: hybridStats.graphExpansions
    });
  }
}

module.exports = HybridVectorStore;
