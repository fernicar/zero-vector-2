import apiClient from '../apiClient.js';
import { validateInput } from '../utils/validation.js';
import { createLogger } from '../utils/logger.js';
import { formatTimestamp } from '../utils/dateHelpers.js';
import joi from 'joi';

const logger = createLogger('GraphTools');

const patterns = {
  uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
};

const graphSchemas = {
  exploreKnowledgeGraph: joi.object({
    personaId: joi.string().pattern(patterns.uuid).required(),
    query: joi.string().min(1).max(1000).required(),
    limit: joi.number().integer().min(1).max(100).default(10),
    entityTypes: joi.array().items(
      joi.string().valid('PERSON', 'CONCEPT', 'EVENT', 'OBJECT', 'PLACE')
    ).optional(),
    minConfidence: joi.number().min(0).max(1).default(0.0),
    includeRelated: joi.boolean().default(false),
    maxDepth: joi.number().integer().min(1).max(5).default(2)
  }),

  hybridMemorySearch: joi.object({
    personaId: joi.string().pattern(patterns.uuid).required(),
    query: joi.string().min(1).max(1000).required(),
    limit: joi.number().integer().min(1).max(50).default(5),
    threshold: joi.number().min(0).max(1).default(0.7),
    memoryTypes: joi.array().items(
      joi.string().valid('conversation', 'fact', 'preference', 'context', 'system')
    ).optional(),
    includeContext: joi.boolean().default(true),
    useGraphExpansion: joi.boolean().default(true),
    graphDepth: joi.number().integer().min(1).max(5).default(2),
    graphWeight: joi.number().min(0).max(1).default(0.3)
  }),

  getGraphContext: joi.object({
    personaId: joi.string().pattern(patterns.uuid).required(),
    entityIds: joi.array().items(joi.string()).min(1).max(50).required(),
    includeRelationships: joi.boolean().default(true),
    maxRelationships: joi.number().integer().min(1).max(100).default(20),
    relationshipDepth: joi.number().integer().min(1).max(3).default(1)
  }),

  getGraphStats: joi.object({
    personaId: joi.string().pattern(patterns.uuid).required()
  })
};

export const exploreKnowledgeGraph = {
  name: 'explore_knowledge_graph',
  description: 'Explore the knowledge graph for a persona, finding entities and their relationships',
  inputSchema: {
    type: 'object',
    properties: {
      personaId: {
        type: 'string',
        description: 'UUID of the persona to explore'
      },
      query: {
        type: 'string',
        description: 'Search query for entities (1-1000 characters)'
      },
      limit: {
        type: 'number',
        description: 'Maximum number of entities to return (1-100, default: 10)'
      },
      entityTypes: {
        type: 'array',
        items: {
          type: 'string',
          enum: ['PERSON', 'CONCEPT', 'EVENT', 'OBJECT', 'PLACE']
        },
        description: 'Filter by specific entity types'
      },
      minConfidence: {
        type: 'number',
        description: 'Minimum confidence threshold (0-1, default: 0.0)'
      },
      includeRelated: {
        type: 'boolean',
        description: 'Include related entities (default: false)'
      },
      maxDepth: {
        type: 'number',
        description: 'Maximum relationship depth when including related entities (1-5, default: 2)'
      }
    },
    required: ['personaId', 'query']
  },

  async handler(params) {
    try {
      const validation = validateInput(graphSchemas.exploreKnowledgeGraph, params, 'explore_knowledge_graph');
      if (!validation.valid) {
        return {
          content: [{
            type: 'text',
            text: `❌ ${validation.message}\n\nDetails:\n${validation.details.map(d => `• ${d.field}: ${d.message}`).join('\n')}`
          }],
          isError: true
        };
      }

      const { personaId, includeRelated, maxDepth, ...searchParams } = validation.value;

      const result = await apiClient.post(`/api/personas/${personaId}/graph/entities/search`, searchParams);

      if (!result.success) {
        logger.error('Graph exploration failed', {
          error: result.error,
          message: result.message,
          personaId
        });

        return {
          content: [{
            type: 'text',
            text: `❌ Failed to explore knowledge graph: ${result.message}\n\n💡 ${result.suggestion || 'Please check the persona ID and search query.'}`
          }],
          isError: true
        };
      }

      const { entities, options, meta } = result.data;
      logger.info('Graph exploration completed', {
        entityCount: entities.length,
        personaId,
        query: searchParams.query.substring(0, 50)
      });

      if (entities.length === 0) {
        return {
          content: [{
            type: 'text',
            text: `🔍 No entities found in knowledge graph for "${searchParams.query}"\n\n💡 Try a broader search term or lower the confidence threshold.`
          }]
        };
      }

      let resultText = `🌐 **Knowledge Graph Exploration**\n\n`;
      resultText += `👤 **Persona:** ${personaId}\n`;
      resultText += `🔍 **Query:** "${searchParams.query}"\n`;
      resultText += `📊 **Found:** ${meta.count} entities\n`;
      resultText += `🏷️ **Types:** ${meta.types.join(', ')}\n\n`;

      entities.forEach((entity, index) => {
        resultText += `**${index + 1}. ${entity.name}** (${entity.type})\n`;
        resultText += `• **ID:** ${entity.id}\n`;
        resultText += `• **Confidence:** ${(entity.confidence * 100).toFixed(1)}%\n`;

        if (entity.properties && Object.keys(entity.properties).length > 0) {
          const props = typeof entity.properties === 'string' ? JSON.parse(entity.properties) : entity.properties;
          const propKeys = Object.keys(props).slice(0, 3);
          if (propKeys.length > 0) {
            resultText += `• **Properties:** ${propKeys.join(', ')}${Object.keys(props).length > 3 ? '...' : ''}\n`;
          }
        }

        if (entity.relationshipCount && entity.relationshipCount > 0) {
          resultText += `• **Relationships:** ${entity.relationshipCount}\n`;
        }

        resultText += `• **Created:** ${formatTimestamp(entity.created_at, 'date')}\n\n`;
      });

      if (includeRelated && entities.length > 0 && entities.length <= 5) {
        resultText += `🔗 **Related Entities:**\n\n`;

        for (const entity of entities.slice(0, 3)) {
          try {
            const relatedResult = await apiClient.get(`/api/personas/${personaId}/graph/entities/${entity.id}/related`, {
              maxDepth: maxDepth || 2,
              limit: 5
            });

            if (relatedResult.success && relatedResult.data.relatedEntities.length > 0) {
              resultText += `**${entity.name}** → `;
              const relatedNames = relatedResult.data.relatedEntities.slice(0, 3).map(e => e.name);
              resultText += relatedNames.join(', ');
              if (relatedResult.data.relatedEntities.length > 3) {
                resultText += ` (+${relatedResult.data.relatedEntities.length - 3} more)`;
              }
              resultText += '\n';
            }
          } catch (error) {
            logger.warn('Failed to get related entities', { entityId: entity.id, error: error.message });
          }
        }
      }

      return {
        content: [{
          type: 'text',
          text: resultText.trim()
        }]
      };

    } catch (error) {
      logger.error('Unexpected error in explore_knowledge_graph', { error: error.message });
      return {
        content: [{
          type: 'text',
          text: `❌ Unexpected error: ${error.message}`
        }],
        isError: true
      };
    }
  }
};

export const hybridMemorySearch = {
  name: 'hybrid_memory_search',
  description: 'Advanced memory search using both vector similarity and knowledge graph expansion',
  inputSchema: {
    type: 'object',
    properties: {
      personaId: {
        type: 'string',
        description: 'UUID of the persona to search memories for'
      },
      query: {
        type: 'string',
        description: 'Search query (1-1000 characters)'
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results to return (1-50, default: 5)'
      },
      threshold: {
        type: 'number',
        description: 'Minimum similarity threshold (0-1, default: 0.7)'
      },
      memoryTypes: {
        type: 'array',
        items: {
          type: 'string',
          enum: ['conversation', 'fact', 'preference', 'context', 'system']
        },
        description: 'Filter by memory types'
      },
      includeContext: {
        type: 'boolean',
        description: 'Include context information in results (default: true)'
      },
      useGraphExpansion: {
        type: 'boolean',
        description: 'Enable graph-based expansion (default: true)'
      },
      graphDepth: {
        type: 'number',
        description: 'Graph traversal depth (1-5, default: 2)'
      },
      graphWeight: {
        type: 'number',
        description: 'Weight for graph-based results (0-1, default: 0.3)'
      }
    },
    required: ['personaId', 'query']
  },

  async handler(params) {
    try {
      const validation = validateInput(graphSchemas.hybridMemorySearch, params, 'hybrid_memory_search');
      if (!validation.valid) {
        return {
          content: [{
            type: 'text',
            text: `❌ ${validation.message}\n\nDetails:\n${validation.details.map(d => `• ${d.field}: ${d.message}`).join('\n')}`
          }],
          isError: true
        };
      }

      const { personaId, ...searchParams } = validation.value;

      const result = await apiClient.post(`/api/personas/${personaId}/memories/search/hybrid`, searchParams);

      if (!result.success) {
        logger.error('Hybrid memory search failed', {
          error: result.error,
          message: result.message,
          personaId
        });

        return {
          content: [{
            type: 'text',
            text: `❌ Failed to perform hybrid search: ${result.message}\n\n💡 ${result.suggestion || 'Please check the persona ID and search query.'}`
          }],
          isError: true
        };
      }

      const { memories, options, meta } = result.data;
      logger.info('Hybrid memory search completed', {
        resultsCount: memories.length,
        expansionRate: meta.expansionRate,
        personaId
      });

      if (memories.length === 0) {
        return {
          content: [{
            type: 'text',
            text: `🔍 No memories found for "${searchParams.query}" above threshold ${searchParams.threshold || 0.7}\n\n💡 Try lowering the threshold or using different search terms.`
          }]
        };
      }

      let resultText = `🧠 **Hybrid Memory Search Results**\n\n`;
      resultText += `👤 **Persona:** ${personaId}\n`;
      resultText += `🔍 **Query:** "${searchParams.query}"\n`;
      resultText += `📊 **Found:** ${meta.count} memories\n`;
      resultText += `🎯 **Avg Similarity:** ${meta.avgSimilarity}\n`;
      resultText += `🌐 **Graph Expansion:** ${meta.expansionRate} (${meta.graphExpandedResults} enhanced)\n`;
      resultText += `⚙️ **Graph Enabled:** ${options.useGraphExpansion ? '✅' : '❌'}\n\n`;

      memories.forEach((memory, index) => {
        resultText += `**${index + 1}. Memory ${memory.id}**\n`;
        resultText += `• **Similarity:** ${memory.similarity.toFixed(4)}`;

        if (memory.graphExpanded) {
          resultText += ` 🌐 (graph enhanced)`;
        }
        if (memory.graphBoosted) {
          resultText += ` ⬆️ (graph boosted)`;
        }
        resultText += '\n';

        resultText += `• **Type:** ${memory.metadata.memoryType}\n`;
        resultText += `• **Importance:** ${memory.metadata.importance}\n`;

        const content = memory.metadata?.originalContent ||
                       memory.metadata?.content ||
                       memory.content ||
                       (memory.metadata?.customMetadata?.originalContent);

        if (content && typeof content === 'string' && content.trim().length > 0) {
          const preview = content.length > 150 ? content.substring(0, 150) + '...' : content;
          resultText += `• **Content:** ${preview}\n`;
        }

        if (memory.metadata.timestamp) {
          resultText += `• **Created:** ${formatTimestamp(memory.metadata.timestamp, 'date')}\n`;
        }

        if (memory.graphContext && memory.graphContext.length > 0) {
          const entityNames = memory.graphContext.slice(0, 3).map(e => e.name);
          resultText += `• **Graph Context:** ${entityNames.join(', ')}${memory.graphContext.length > 3 ? '...' : ''}\n`;
        }

        if (searchParams.includeContext && memory.metadata.context) {
          const contextKeys = Object.keys(memory.metadata.context);
          if (contextKeys.length > 0) {
            resultText += `• **Context:** ${contextKeys.slice(0, 3).join(', ')}${contextKeys.length > 3 ? '...' : ''}\n`;
          }
        }

        resultText += '\n';
      });

      if (options.useGraphExpansion && meta.graphExpandedResults > 0) {
        resultText += `💡 **Graph Enhancement:** ${meta.graphExpandedResults} results were enhanced using knowledge graph context, improving relevance and discovering connected information.`;
      }

      return {
        content: [{
          type: 'text',
          text: resultText.trim()
        }]
      };

    } catch (error) {
      logger.error('Unexpected error in hybrid_memory_search', { error: error.message });
      return {
        content: [{
          type: 'text',
          text: `❌ Unexpected error: ${error.message}`
        }],
        isError: true
      };
    }
  }
};

export const getGraphContext = {
  name: 'get_graph_context',
  description: 'Get detailed context and relationships for specific entities in the knowledge graph',
  inputSchema: {
    type: 'object',
    properties: {
      personaId: {
        type: 'string',
        description: 'UUID of the persona'
      },
      entityIds: {
        type: 'array',
        items: {
          type: 'string'
        },
        description: 'Array of entity IDs to get context for (1-50 entities)'
      },
      includeRelationships: {
        type: 'boolean',
        description: 'Include relationship information (default: true)'
      },
      maxRelationships: {
        type: 'number',
        description: 'Maximum relationships to return (1-100, default: 20)'
      },
      relationshipDepth: {
        type: 'number',
        description: 'Relationship traversal depth (1-3, default: 1)'
      }
    },
    required: ['personaId', 'entityIds']
  },

  async handler(params) {
    try {
      const validation = validateInput(graphSchemas.getGraphContext, params, 'get_graph_context');
      if (!validation.valid) {
        return {
          content: [{
            type: 'text',
            text: `❌ ${validation.message}\n\nDetails:\n${validation.details.map(d => `• ${d.field}: ${d.message}`).join('\n')}`
          }],
          isError: true
        };
      }

      const { personaId, ...contextParams } = validation.value;

      const result = await apiClient.post(`/api/personas/${personaId}/graph/context`, contextParams);

      if (!result.success) {
        logger.error('Graph context retrieval failed', {
          error: result.error,
          message: result.message,
          personaId
        });

        return {
          content: [{
            type: 'text',
            text: `❌ Failed to get graph context: ${result.message}\n\n💡 ${result.suggestion || 'Please check the persona ID and entity IDs.'}`
          }],
          isError: true
        };
      }

      const { context, options, meta } = result.data;
      logger.info('Graph context retrieved', {
        entitiesFound: meta.entitiesFound,
        relationshipsFound: meta.relationshipsFound,
        personaId
      });

      let resultText = `🌐 **Graph Context**\n\n`;
      resultText += `👤 **Persona:** ${personaId}\n`;
      resultText += `📊 **Entities:** ${meta.entitiesFound} found (${contextParams.entityIds.length} requested)\n`;
      resultText += `🔗 **Relationships:** ${meta.relationshipsFound}\n`;
      resultText += `🎯 **Direct Connections:** ${meta.directConnections}\n\n`;

      if (context.entities && context.entities.length > 0) {
        resultText += `**🏷️ Entities:**\n`;
        context.entities.forEach((entity, index) => {
          resultText += `${index + 1}. **${entity.name}** (${entity.type})\n`;
          resultText += `   • ID: ${entity.id}\n`;
          resultText += `   • Confidence: ${(entity.confidence * 100).toFixed(1)}%\n`;
          if (entity.relationshipCount) {
            resultText += `   • Relationships: ${entity.relationshipCount}\n`;
          }
        });
        resultText += '\n';
      }

      if (options.includeRelationships && context.relationships && context.relationships.length > 0) {
        resultText += `**🔗 Relationships:**\n`;
        context.relationships.slice(0, 10).forEach((rel, index) => {
          const sourceName = context.entities.find(e => e.id === rel.source_entity_id)?.name || rel.source_entity_id;
          const targetName = context.entities.find(e => e.id === rel.target_entity_id)?.name || rel.target_entity_id;

          resultText += `${index + 1}. **${sourceName}** → *${rel.relationship_type}* → **${targetName}**\n`;
          resultText += `   • Strength: ${(rel.strength * 100).toFixed(1)}%\n`;
          if (rel.context) {
            resultText += `   • Context: ${rel.context.substring(0, 50)}${rel.context.length > 50 ? '...' : ''}\n`;
          }
        });

        if (context.relationships.length > 10) {
          resultText += `   ... and ${context.relationships.length - 10} more relationships\n`;
        }
        resultText += '\n';
      }

      if (context.connections && context.connections.length > 0) {
        resultText += `**🌟 Key Connections:**\n`;
        context.connections.slice(0, 5).forEach((connection, index) => {
          const entitiesText = connection.entities && Array.isArray(connection.entities)
            ? connection.entities.join(' ↔ ')
            : 'Connection data';
          resultText += `${index + 1}. ${connection.description || entitiesText}\n`;
          if (connection.strength) {
            resultText += `   • Strength: ${(connection.strength * 100).toFixed(1)}%\n`;
          }
        });
      }

      return {
        content: [{
          type: 'text',
          text: resultText.trim()
        }]
      };

    } catch (error) {
      logger.error('Unexpected error in get_graph_context', { error: error.message });
      return {
        content: [{
          type: 'text',
          text: `❌ Unexpected error: ${error.message}`
        }],
        isError: true
      };
    }
  }
};

export const getGraphStats = {
  name: 'get_graph_stats',
  description: 'Get comprehensive statistics about a persona\'s knowledge graph',
  inputSchema: {
    type: 'object',
    properties: {
      personaId: {
        type: 'string',
        description: 'UUID of the persona'
      }
    },
    required: ['personaId']
  },

  async handler(params) {
    try {
      const validation = validateInput(graphSchemas.getGraphStats, params, 'get_graph_stats');
      if (!validation.valid) {
        return {
          content: [{
            type: 'text',
            text: `❌ ${validation.message}\n\nDetails:\n${validation.details.map(d => `• ${d.field}: ${d.message}`).join('\n')}`
          }],
          isError: true
        };
      }

      const { personaId } = validation.value;

      const result = await apiClient.get(`/api/personas/${personaId}/graph/stats`);

      if (!result.success) {
        logger.error('Graph stats retrieval failed', {
          error: result.error,
          message: result.message,
          personaId
        });

        return {
          content: [{
            type: 'text',
            text: `❌ Failed to get graph statistics: ${result.message}\n\n💡 ${result.suggestion || 'Please check the persona ID.'}`
          }],
          isError: true
        };
      }

      const { knowledgeGraph, hybridFeatures, performance } = result.data;
      logger.info('Graph statistics retrieved', {
        totalEntities: knowledgeGraph.totalEntities,
        totalRelationships: knowledgeGraph.totalRelationships,
        personaId
      });

      let resultText = `📊 **Knowledge Graph Statistics**\n\n`;
      resultText += `👤 **Persona:** ${personaId}\n\n`;

      resultText += `**🌐 Graph Overview:**\n`;
      resultText += `• **Entities:** ${knowledgeGraph.totalEntities}\n`;
      resultText += `• **Relationships:** ${knowledgeGraph.totalRelationships}\n`;

      const graphDensity = typeof knowledgeGraph.graphDensity === 'number'
        ? (knowledgeGraph.graphDensity * 100).toFixed(2)
        : 'N/A';
      resultText += `• **Graph Density:** ${graphDensity}%\n`;

      const avgRelations = typeof knowledgeGraph.averageRelationshipsPerEntity === 'number'
        ? knowledgeGraph.averageRelationshipsPerEntity.toFixed(1)
        : 'N/A';
      resultText += `• **Avg Relations/Entity:** ${avgRelations}\n`;
      resultText += `• **Complexity:** ${knowledgeGraph.graphComplexity}\n\n`;

      if (knowledgeGraph.entityTypes && knowledgeGraph.entityTypes.length > 0) {
        resultText += `**🏷️ Entity Types:**\n`;
        knowledgeGraph.entityTypes.forEach(type => {
          const percentage = typeof type.percentage === 'number'
            ? type.percentage.toFixed(1)
            : 'N/A';
          const typeName = type.type || 'Unknown Entity Type';
          resultText += `• ${typeName}: ${type.count} (${percentage}%)\n`;
        });
        resultText += '\n';
      }

      if (knowledgeGraph.relationshipTypes && knowledgeGraph.relationshipTypes.length > 0) {
        resultText += `**🔗 Relationship Types:**\n`;
        knowledgeGraph.relationshipTypes.forEach(type => {
          const percentage = typeof type.percentage === 'number'
            ? type.percentage.toFixed(1)
            : 'N/A';
          const typeName = type.type || 'Unknown Relationship Type';
          resultText += `• ${typeName}: ${type.count} (${percentage}%)\n`;
        });
        resultText += '\n';
      }

      resultText += `**🚀 Hybrid Features:**\n`;
      resultText += `• **Graph Enabled:** ${hybridFeatures.graphEnabled ? '✅' : '❌'}\n`;
      resultText += `• **Entities Extracted:** ${hybridFeatures.entitiesExtracted}\n`;
      resultText += `• **Relationships Created:** ${hybridFeatures.relationshipsCreated}\n`;
      resultText += `• **Hybrid Searches:** ${hybridFeatures.hybridSearches}\n`;
      resultText += `• **Graph Expansions:** ${hybridFeatures.graphExpansions}\n\n`;

      resultText += `**⚡ Performance:**\n`;
      resultText += `• **Avg Graph Processing:** ${performance.avgGraphProcessingTime}\n`;
      resultText += `• **Total Hybrid Searches:** ${performance.totalHybridSearches}\n`;
      resultText += `• **Total Graph Expansions:** ${performance.totalGraphExpansions}\n`;
      resultText += `• **Expansion Success Rate:** ${performance.expansionSuccessRate}\n`;

      if (knowledgeGraph.totalEntities === 0) {
        resultText += `\n💡 **Recommendation:** No entities found. Add some memories to start building the knowledge graph.`;
      } else if (knowledgeGraph.totalRelationships === 0) {
        resultText += `\n💡 **Recommendation:** Entities exist but no relationships. Add more related content to build connections.`;
      } else if (knowledgeGraph.graphComplexity === 'low') {
        resultText += `\n💡 **Recommendation:** Simple graph structure. Consider adding more diverse content to increase complexity.`;
      } else {
        resultText += `\n✅ **Status:** Knowledge graph is well-developed and ready for advanced queries.`;
      }

      return {
        content: [{
          type: 'text',
          text: resultText
        }]
      };

    } catch (error) {
      logger.error('Unexpected error in get_graph_stats', { error: error.message });
      return {
        content: [{
          type: 'text',
          text: `❌ Unexpected error: ${error.message}`
        }],
        isError: true
      };
    }
  }
};

export const graphTools = [
  exploreKnowledgeGraph,
  hybridMemorySearch,
  getGraphContext,
  getGraphStats
];
