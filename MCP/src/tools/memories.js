import apiClient from '../apiClient.js';
import { memorySchemas, validateInput } from '../utils/validation.js';
import { createLogger } from '../utils/logger.js';
import { formatTimestamp } from '../utils/dateHelpers.js';

const logger = createLogger('MemoryTools');

export const addMemory = {
  name: 'add_memory',
  description: 'Add a memory to a specific persona with optional context and importance',
  inputSchema: {
    type: 'object',
    properties: {
      personaId: {
        type: 'string',
        description: 'UUID of the persona to add memory to'
      },
      content: {
        type: 'string',
        description: 'Memory content (1-10000 characters)'
      },
      type: {
        type: 'string',
        enum: ['conversation', 'fact', 'preference', 'context', 'system'],
        description: 'Type of memory (default: conversation)'
      },
      importance: {
        type: 'number',
        description: 'Importance level from 0-1 (default: 0.5)'
      },
      context: {
        type: 'object',
        description: 'Optional context information'
      }
    },
    required: ['personaId', 'content']
  },

  async handler(params) {
    try {
      const validation = validateInput(memorySchemas.addMemory, params, 'add_memory');
      if (!validation.valid) {
        return {
          content: [{
            type: 'text',
            text: `❌ ${validation.message}\n\nDetails:\n${validation.details.map(d => `• ${d.field}: ${d.message}`).join('\n')}`
          }],
          isError: true
        };
      }

      const validParams = validation.value;

      const result = await apiClient.post(`/api/personas/${validParams.personaId}/memories`, validParams);

      if (!result.success) {
        logger.error('Memory addition failed', {
          error: result.error,
          message: result.message,
          personaId: validParams.personaId
        });

        return {
          content: [{
            type: 'text',
            text: `❌ Failed to add memory: ${result.message}\n\n💡 ${result.suggestion || 'Please check the persona ID and try again.'}`
          }],
          isError: true
        };
      }

      const memoryData = result.data;
      logger.info('Memory added successfully', {
        id: memoryData.id,
        personaId: validParams.personaId,
        type: validParams.type
      });

      let resultText = `✅ **Memory added successfully!**\n\n`;
      resultText += `🆔 **Memory ID:** ${memoryData.id}\n`;
      resultText += `👤 **Persona ID:** ${validParams.personaId}\n`;
      resultText += `📝 **Content:** ${validParams.content.substring(0, 100)}${validParams.content.length > 100 ? '...' : ''}\n`;
      resultText += `🏷️ **Type:** ${validParams.type}\n`;
      resultText += `⭐ **Importance:** ${validParams.importance}\n`;
      if (validParams.context && Object.keys(validParams.context).length > 0) {
        resultText += `🔗 **Context:** ${Object.keys(validParams.context).length} fields\n`;
      }
      resultText += `📅 **Created:** ${formatTimestamp(memoryData.createdAt, 'iso')}`;

      return {
        content: [{
          type: 'text',
          text: resultText
        }]
      };

    } catch (error) {
      logger.error('Unexpected error in add_memory', { error: error.message });
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

export const searchPersonaMemories = {
  name: 'search_persona_memories',
  description: 'Search through a persona\'s memories using semantic similarity',
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
        description: 'Maximum number of results to return (1-100, default: 10)'
      },
      threshold: {
        type: 'number',
        description: 'Minimum similarity threshold (0-1, default: 0.3)'
      },
      memoryTypes: {
        type: 'array',
        items: {
          type: 'string',
          enum: ['conversation', 'fact', 'preference', 'context', 'system']
        },
        description: 'Filter by memory types'
      },
      include_context: {
        type: 'boolean',
        description: 'Include context information in results (default: false)'
      }
    },
    required: ['personaId', 'query']
  },

  async handler(params) {
    try {
      const validation = validateInput(memorySchemas.searchPersonaMemories, params, 'search_persona_memories');
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

      const result = await apiClient.post(`/api/personas/${personaId}/memories/search`, searchParams);

      if (!result.success) {
        logger.error('Memory search failed', {
          error: result.error,
          message: result.message,
          personaId
        });

        return {
          content: [{
            type: 'text',
            text: `❌ Failed to search memories: ${result.message}\n\n💡 ${result.suggestion || 'Please check the persona ID and search query.'}`
          }],
          isError: true
        };
      }

      const { memories, query_time } = result.data;
      const { avgSimilarity } = result.meta || {};

      logger.info('Memory search completed', {
        resultsCount: memories.length,
        queryTime: query_time,
        personaId
      });

      if (memories.length === 0) {
        return {
          content: [{
            type: 'text',
            text: `🔍 No memories found matching "${searchParams.query}" above threshold ${searchParams.threshold}\n\n💡 Try lowering the threshold or using different search terms.`
          }]
        };
      }

      let resultText = `🧠 **Found ${memories.length} relevant memories**\n\n`;
      resultText += `👤 **Persona:** ${personaId}\n`;
      resultText += `🔍 **Query:** "${searchParams.query}"\n`;
      resultText += `⚡ **Search time:** ${query_time}ms\n`;
      resultText += `🎯 **Threshold:** ${searchParams.threshold}\n`;
      if (avgSimilarity) {
        resultText += `📊 **Average similarity:** ${avgSimilarity.toFixed(3)}\n`;
      }
      resultText += '\n';

      memories.forEach((memory, index) => {
        resultText += `**${index + 1}. Memory ${memory.id}**\n`;
        resultText += `• **Similarity:** ${memory.similarity.toFixed(4)}\n`;
        resultText += `• **Type:** ${memory.metadata.memoryType}\n`;
        resultText += `• **Importance:** ${memory.metadata.importance}\n`;

        const content = memory.metadata?.originalContent ||
                       memory.metadata?.content ||
                       memory.content ||
                       (memory.metadata?.customMetadata?.originalContent);

        if (content && typeof content === 'string' && content.trim().length > 0) {
          const preview = content.length > 150 ? content.substring(0, 150) + '...' : content;
          resultText += `• **Content:** ${preview}\n`;
        } else {
          const metadataKeys = memory.metadata ? Object.keys(memory.metadata) : ['no metadata'];
          resultText += `• **Content:** [Content not found]\n`;
          resultText += `• **Debug - Available fields:** ${metadataKeys.join(', ')}\n`;

          if (memory.metadata && Object.keys(memory.metadata).length > 0) {
            const sampleValue = memory.metadata[metadataKeys[0]];
            resultText += `• **Debug - Sample value:** ${typeof sampleValue} ${JSON.stringify(sampleValue).substring(0, 50)}...\n`;
          }

          logger.debug('Memory content debug', {
            memoryId: memory.id,
            hasMetadata: !!memory.metadata,
            metadataKeys: metadataKeys,
            hasOriginalContent: !!(memory.metadata?.originalContent),
            hasContent: !!(memory.metadata?.content),
            hasCustomMetadata: !!(memory.metadata?.customMetadata),
            fullMetadata: JSON.stringify(memory.metadata).substring(0, 200)
          });
        }

        if (memory.metadata.timestamp) {
          resultText += `• **Created:** ${formatTimestamp(memory.metadata.timestamp, 'date')}\n`;
        }

        if (searchParams.include_context && memory.metadata.context) {
          const contextKeys = Object.keys(memory.metadata.context);
          if (contextKeys.length > 0) {
            resultText += `• **Context:** ${contextKeys.slice(0, 3).join(', ')}${contextKeys.length > 3 ? '...' : ''}\n`;
          }
        }

        resultText += '\n';
      });

      return {
        content: [{
          type: 'text',
          text: resultText.trim()
        }]
      };

    } catch (error) {
      logger.error('Unexpected error in search_persona_memories', { error: error.message });
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

export const addConversation = {
  name: 'add_conversation',
  description: 'Add a conversation exchange (user message + assistant response) to a persona\'s memory',
  inputSchema: {
    type: 'object',
    properties: {
      personaId: {
        type: 'string',
        description: 'UUID of the persona'
      },
      userMessage: {
        type: 'string',
        description: 'User\'s message (1-5000 characters)'
      },
      assistantResponse: {
        type: 'string',
        description: 'Assistant\'s response (1-5000 characters)'
      },
      conversationId: {
        type: 'string',
        description: 'Optional conversation ID to continue an existing conversation'
      },
      context: {
        type: 'object',
        description: 'Optional context information'
      }
    },
    required: ['personaId', 'userMessage', 'assistantResponse']
  },

  async handler(params) {
    try {
      const validation = validateInput(memorySchemas.addConversation, params, 'add_conversation');
      if (!validation.valid) {
        return {
          content: [{
            type: 'text',
            text: `❌ ${validation.message}\n\nDetails:\n${validation.details.map(d => `• ${d.field}: ${d.message}`).join('\n')}`
          }],
          isError: true
        };
      }

      const { personaId, ...conversationData } = validation.value;

      const result = await apiClient.post(`/api/personas/${personaId}/conversations`, conversationData);

      if (!result.success) {
        logger.error('Conversation addition failed', {
          error: result.error,
          message: result.message,
          personaId
        });

        return {
          content: [{
            type: 'text',
            text: `❌ Failed to add conversation: ${result.message}\n\n💡 ${result.suggestion || 'Please check the persona ID and try again.'}`
          }],
          isError: true
        };
      }

      const { conversationId, userMemory, assistantMemory } = result.data;
      logger.info('Conversation added successfully', {
        conversationId,
        personaId,
        userMemoryId: userMemory.id,
        assistantMemoryId: assistantMemory.id
      });

      let resultText = `✅ **Conversation exchange added successfully!**\n\n`;
      resultText += `💬 **Conversation ID:** ${conversationId}\n`;
      resultText += `👤 **Persona ID:** ${personaId}\n`;
      resultText += `🗣️ **User Memory:** ${userMemory.id}\n`;
      resultText += `🤖 **Assistant Memory:** ${assistantMemory.id}\n\n`;

      resultText += `📝 **Exchange Preview:**\n`;
      resultText += `**User:** ${conversationData.userMessage.substring(0, 100)}${conversationData.userMessage.length > 100 ? '...' : ''}\n`;
      resultText += `**Assistant:** ${conversationData.assistantResponse.substring(0, 100)}${conversationData.assistantResponse.length > 100 ? '...' : ''}\n\n`;

      resultText += `📅 **Created:** ${formatTimestamp(userMemory.createdAt, 'iso')}`;

      return {
        content: [{
          type: 'text',
          text: resultText
        }]
      };

    } catch (error) {
      logger.error('Unexpected error in add_conversation', { error: error.message });
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

export const getConversationHistory = {
  name: 'get_conversation_history',
  description: 'Retrieve the complete history of a conversation',
  inputSchema: {
    type: 'object',
    properties: {
      personaId: {
        type: 'string',
        description: 'UUID of the persona'
      },
      conversationId: {
        type: 'string',
        description: 'UUID of the conversation'
      },
      limit: {
        type: 'number',
        description: 'Maximum number of messages to return (1-1000, default: 100)'
      },
      include_context: {
        type: 'boolean',
        description: 'Include context information (default: true)'
      }
    },
    required: ['personaId', 'conversationId']
  },

  async handler(params) {
    try {
      const validation = validateInput(memorySchemas.getConversationHistory, params, 'get_conversation_history');
      if (!validation.valid) {
        return {
          content: [{
            type: 'text',
            text: `❌ ${validation.message}\n\nDetails:\n${validation.details.map(d => `• ${d.field}: ${d.message}`).join('\n')}`
          }],
          isError: true
        };
      }

      const { personaId, conversationId, ...queryParams } = validation.value;

      const result = await apiClient.get(`/api/personas/${personaId}/conversations/${conversationId}`, queryParams);

      if (!result.success) {
        logger.error('Conversation history retrieval failed', {
          error: result.error,
          message: result.message,
          personaId,
          conversationId
        });

        return {
          content: [{
            type: 'text',
            text: `❌ Failed to get conversation history: ${result.message}\n\n💡 ${result.suggestion || 'Verify the persona and conversation IDs are correct.'}`
          }],
          isError: true
        };
      }

      const { history, summary } = result.data;
      logger.info('Conversation history retrieved', {
        messageCount: history.length,
        personaId,
        conversationId
      });

      if (history.length === 0) {
        return {
          content: [{
            type: 'text',
            text: `💬 No messages found in conversation ${conversationId}\n\n💡 This conversation may be empty or the ID may be incorrect.`
          }]
        };
      }

      let resultText = `💬 **Conversation History**\n\n`;
      resultText += `🆔 **Conversation ID:** ${conversationId}\n`;
      resultText += `👤 **Persona ID:** ${personaId}\n`;
      resultText += `📊 **Messages:** ${history.length}\n`;
      if (summary) {
        resultText += `📅 **Duration:** ${formatTimestamp(summary.startTime, 'date')} - ${formatTimestamp(summary.endTime, 'date')}\n`;
        resultText += `⏱️ **Exchanges:** ${summary.exchangeCount}\n`;
      }
      resultText += '\n';

      const sortedHistory = history.sort((a, b) => a.timestamp - b.timestamp);

      sortedHistory.forEach((message) => {
        const speaker = message.speaker === 'user' ? '🗣️ **User**' : '🤖 **Assistant**';
        const timestamp = formatTimestamp(message.timestamp, 'time');

        resultText += `${speaker} (${timestamp})\n`;

        const content = message.content;
        if (content.length > 200) {
          resultText += `${content.substring(0, 200)}...\n`;
        } else {
          resultText += `${content}\n`;
        }

        if (queryParams.include_context && message.context && Object.keys(message.context).length > 0) {
          const contextKeys = Object.keys(message.context);
          resultText += `*Context: ${contextKeys.slice(0, 2).join(', ')}${contextKeys.length > 2 ? '...' : ''}*\n`;
        }

        resultText += '\n';
      });

      return {
        content: [{
          type: 'text',
          text: resultText.trim()
        }]
      };

    } catch (error) {
      logger.error('Unexpected error in get_conversation_history', { error: error.message });
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

export const cleanupPersonaMemories = {
  name: 'cleanup_persona_memories',
  description: 'Clean up old or low-importance memories for a persona',
  inputSchema: {
    type: 'object',
    properties: {
      personaId: {
        type: 'string',
        description: 'UUID of the persona to clean up memories for'
      },
      olderThan: {
        type: 'number',
        description: 'Delete memories older than this time in milliseconds (minimum: 1 hour)'
      },
      memoryTypes: {
        type: 'array',
        items: {
          type: 'string',
          enum: ['conversation', 'fact', 'preference', 'context', 'system']
        },
        description: 'Only clean up specific memory types'
      },
      dryRun: {
        type: 'boolean',
        description: 'Preview what would be deleted without actually deleting (default: false)'
      }
    },
    required: ['personaId']
  },

  async handler(params) {
    try {
      const validation = validateInput(memorySchemas.cleanupPersonaMemories, params, 'cleanup_persona_memories');
      if (!validation.valid) {
        return {
          content: [{
            type: 'text',
            text: `❌ ${validation.message}\n\nDetails:\n${validation.details.map(d => `• ${d.field}: ${d.message}`).join('\n')}`
          }],
          isError: true
        };
      }

      const { personaId, ...cleanupParams } = validation.value;

      const result = await apiClient.post(`/api/personas/${personaId}/cleanup`, cleanupParams);

      if (!result.success) {
        logger.error('Memory cleanup failed', {
          error: result.error,
          message: result.message,
          personaId
        });

        return {
          content: [{
            type: 'text',
            text: `❌ Failed to cleanup memories: ${result.message}\n\n💡 ${result.suggestion || 'Please check the persona ID and parameters.'}`
          }],
          isError: true
        };
      }

      const cleanupResult = result.data;
      logger.info('Memory cleanup completed', {
        personaId,
        affected: cleanupResult.affected,
        dryRun: cleanupParams.dryRun
      });

      let resultText = cleanupParams.dryRun
        ? `🔍 **Memory cleanup preview** (dry run)\n\n`
        : `🧹 **Memory cleanup completed**\n\n`;

      resultText += `👤 **Persona ID:** ${personaId}\n`;
      resultText += `📊 **Memories affected:** ${cleanupResult.affected}\n`;

      if (cleanupResult.breakdown) {
        resultText += `🏷️ **Breakdown by type:**\n`;
        Object.entries(cleanupResult.breakdown).forEach(([type, count]) => {
          resultText += `  • ${type}: ${count}\n`;
        });
      }

      if (cleanupParams.olderThan) {
        const daysOld = Math.round(cleanupParams.olderThan / (24 * 60 * 60 * 1000));
        resultText += `📅 **Criteria:** Older than ${daysOld} days\n`;
      }

      if (cleanupParams.memoryTypes) {
        resultText += `🏷️ **Types:** ${cleanupParams.memoryTypes.join(', ')}\n`;
      }

      resultText += `⏱️ **Processing time:** ${cleanupResult.processingTime}ms\n`;

      if (cleanupParams.dryRun) {
        resultText += `\n💡 Run without \`dryRun: true\` to actually delete these memories.`;
      } else {
        resultText += `\n✅ Cleanup completed successfully.`;
      }

      return {
        content: [{
          type: 'text',
          text: resultText
        }]
      };

    } catch (error) {
      logger.error('Unexpected error in cleanup_persona_memories', { error: error.message });
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

export const memoryTools = [
  addMemory,
  searchPersonaMemories,
  addConversation,
  getConversationHistory,
  cleanupPersonaMemories
];
