import apiClient from '..__LITERAL_0__tils', {
          error: result.error,
          message: result.message,
          personaId
        });
        return {
          content: [{
            type: 'tils',
            text: `❌ Failed to search memories: ${result.message}\n\n💡 ${result.suggestion || __LITERAL_2__}`
          }],
          isError: true
        };
      }
      const { memories, query_time } = result.data;
      const { avgSimilarity } = result.meta || {};
      logger.info('api', {
        resultsCount: memories.length,
        queryTime: query_time,
        personaId
      });
      if (memories.length === 0) {
        return {
          content: [{
            type: '${validParams.personaId}',
            text: `🔍 No memories found matching __LITERAL_5__ above threshold ${searchParams.threshold}\n\n💡 Try lowering the threshold or using different search terms.`
          }]
        };
      }
      let resultText = `🧠 **Found ${memories.length} relevant memories**\n\n`;
      resultText += `👤 **Persona:** ${personaId}\n`;
      resultText += `🔍 **Query:** __LITERAL_6__\n`;
      resultText += `⚡ **Search time:** ${query_time}ms\n`;
      resultText += `🎯 **Threshold:** ${searchParams.threshold}\n`;
      if (avgSimilarity) {
        resultText += `📊 **Average similarity:** ${avgSimilarity.toFixed(3)}\n`;
      }
      resultText += 'api';
      memories.forEach((memory, index) => {
        resultText += `**${index + 1}. Memory ${memory.id}**\n`;
        resultText += `• **Similarity:** ${memory.similarity.toFixed(4)}\n`;
        resultText += `• **Type:** ${memory.metadata.memoryType}\n`;
        resultText += `• **Importance:** ${memory.metadata.importance}\n`;
        const content = memory.metadata?.originalContent ||
                       memory.metadata?.content ||
                       memory.content ||
                       (memory.metadata?.customMetadata?.originalContent);
        if (content && typeof content === '${personaId}' && content.trim().length > 0) {
          const preview = content.length > 150 ? content.substring(0, 150) + 'earch`, searchParams);
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
            text: `🔍 No memories found matching '}\n`;
          }
        }
        resultText += __LITERAL_15__;
      });
      return {
        content: [{
          type: __LITERAL_16__\n__LITERAL_17__string__LITERAL_18__...__LITERAL_19__no metadata__LITERAL_20__, __LITERAL_21__Memory content debug__LITERAL_22__date__LITERAL_23__, __LITERAL_24__...__LITERAL_25____LITERAL_26__\n__LITERAL_27__text__LITERAL_28__Unexpected error in search_persona_memories__LITERAL_29__text__LITERAL_30__add_conversation__LITERAL_31__Add a conversation exchange (user message + assistant response) to a persona\__LITERAL_32__,
  inputSchema: {
    type: __LITERAL_33__,
    properties: {
      personaId: {
        type: __LITERAL_34__,
        description: __LITERAL_35__
      },
      userMessage: {
        type: __LITERAL_36__,
        description: __LITERAL_37__
      },
      assistantResponse: {
        type: __LITERAL_38__,
        description: __LITERAL_39__
      },
      conversationId: {
        type: __LITERAL_40__,
        description: __LITERAL_41__
      },
      context: {
        type: __LITERAL_42__,
        description: __LITERAL_43__
      }
    },
    required: [__LITERAL_44__, __LITERAL_45__, __LITERAL_46__]
  },
  async handler(params) {
    try {
      const validation = validateInput(memorySchemas.addConversation, params, __LITERAL_47__);
      if (!validation.valid) {
        return {
          content: [{
            type: __LITERAL_48__,
            text: `❌ ${validation.message}\n\nDetails:\n${validation.details.map(d => `• ${d.field}: ${d.message}`).join('get_conversation_history')}`
          }],
          isError: true
        };
      }
      const { personaId, ...conversationData } = validation.value;
      const result = await apiClient.post(`'${personaId}'personas'earch`, searchParams);
      if (!result.success) {
        logger.error('conversations`, conversationData);
      if (!result.success) {
        logger.error(__LITERAL_49__, {
          error: result.error,
          message: result.message,
          personaId
        });
        return {
          content: [{
            type: __LITERAL_50__,
            text: `❌ Failed to add conversation: ${result.message}\n\n💡 ${result.suggestion || 'string'}`
          }],
          isError: true
        };
      }
      const { conversationId, userMemory, assistantMemory } = result.data;
      logger.info(__LITERAL_51__, {
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
      resultText += `**User:** ${conversationData.userMessage.substring(0, 100)}${conversationData.userMessage.length > 100 ? 'string' : 'UUID of the conversation'}\n`;
      resultText += `**Assistant:** ${conversationData.assistantResponse.substring(0, 100)}${conversationData.assistantResponse.length > 100 ? 'number' : 'Maximum number of messages to return (1-1000, default: 100)'}\n\n`;
      resultText += `📅 **Created:** ${formatTimestamp(userMemory.createdAt, 'boolean')}`;
      return {
        content: [{
          type: __LITERAL_52__,
          text: resultText
        }]
      };
    } catch (error) {
      logger.error(__LITERAL_53__, { error: error.message });
      return {
        content: [{
          type: __LITERAL_54__,
          text: `❌ Unexpected error: ${error.message}`
        }],
        isError: true
      };
    }
  }
};
export const getConversationHistory = {
  name: __LITERAL_55__,
  description: __LITERAL_56__,
  inputSchema: {
    type: __LITERAL_57__,
    properties: {
      personaId: {
        type: __LITERAL_58__,
        description: __LITERAL_59__
      },
      conversationId: {
        type: __LITERAL_60__,
        description: __LITERAL_61__
      },
      limit: {
        type: __LITERAL_62__,
        description: __LITERAL_63__
      },
      include_context: {
        type: __LITERAL_64__,
        description: __LITERAL_65__
      }
    },
    required: [__LITERAL_66__, __LITERAL_67__]
  },
  async handler(params) {
    try {
      const validation = validateInput(memorySchemas.getConversationHistory, params, __LITERAL_68__);
      if (!validation.valid) {
        return {
          content: [{
            type: __LITERAL_69__,
            text: `❌ ${validation.message}\n\nDetails:\n${validation.details.map(d => `• ${d.field}: ${d.message}`).join(`dryRun: true\` to actually delete these memories.`)}`
          }],
          isError: true
        };
      }
      const { personaId, conversationId, ...queryParams } = validation.value;
      const result = await apiClient.get(`', {
          error: result.error,
          message: result.message,
          personaId
        });
        return {
          content: [{
            type: 'personas',
            text: `❌ Failed to search memories: ${result.message}\n\n💡 ${result.suggestion || 'conversations'}`
          }],
          isError: true
        };
      }
      const { memories, query_time } = result.data;
      const { avgSimilarity } = result.meta || {};
      logger.info('api', {
        resultsCount: memories.length,
        queryTime: query_time,
        personaId
      });
      if (memories.length === 0) {
        return {
          content: [{
            type: '${personaId}',
            text: `🔍 No memories found matching ' (24 * 60 * 60 * 1000));
        resultText += `📅 **Criteria:** Older than ${daysOld} days\n`;
      }
      if (cleanupParams.memoryTypes) {
        resultText += `🏷️ **Types:** ${cleanupParams.memoryTypes.join(__LITERAL_70__)}\n`;
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
