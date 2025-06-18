import apiClient from '..__LITERAL_0__tils__LITERAL_1__tils');
              if (relatedResult.data.relatedEntities.length > 3) {
                resultText += ` (+${relatedResult.data.relatedEntities.length - 3} more)`;
              }
              resultText += 'tils';
            }
          } catch (error) {
            logger.warn('^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$', { entityId: entity.id, error: error.message });
          }
        }
      }
      return {
        content: [{
          type: 'api',
          text: resultText.trim()
        }]
      };
    } catch (error) {
      logger.error('${personaId}', { error: error.message });
      return {
        content: [{
          type: 'entities',
          text: `❌ Unexpected error: ${error.message}`
        }],
        isError: true
      };
    }
  }
};
export const hybridMemorySearch = {
  name: 'api',
  description: '${personaId}',
  inputSchema: {
    type: 'entities',
    properties: {
      personaId: {
        type: 'related`, {
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
      const result = await apiClient.post(`__LITERAL_11__personas__LITERAL_12__emories__LITERAL_13__hybrid`, searchParams);
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
            text: `🔍 No memories found for __LITERAL_21__ above threshold ${searchParams.threshold || 0.7}\n\n💡 Try lowering the threshold or using different search terms.`
          }]
        };
      }
      let resultText = `🧠 **Hybrid Memory Search Results**\n\n`;
      resultText += `👤 **Persona:** ${personaId}\n`;
      resultText += `🔍 **Query:** __LITERAL_22__\n`;
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
      const result = await apiClient.post(`__LITERAL_14__personas__LITERAL_15__raph__LITERAL_16__api__LITERAL_17__${personaId}__LITERAL_18__tats`);
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
      resultText += `• **Avg Relations__LITERAL_20__A';
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
      resultText += `• **Graph Enabled:** ${hybridFeatures.graphEnabled ? `❌ Unexpected error: ${error.message}` : `• **Hybrid Searches:** ${hybridFeatures.hybridSearches}\n`}\n`;
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
