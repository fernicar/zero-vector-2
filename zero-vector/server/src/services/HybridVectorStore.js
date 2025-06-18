const IndexedVectorStore = require('.__LITERAL_0__GraphDatabaseService');
const EntityExtractor = require('.__LITERAL_1__tils'
          : ' this.hybridStats.entitiesExtracted).toFixed(2) + 'ms'
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
