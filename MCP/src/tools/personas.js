import apiClient from '..__LITERAL_0__tils__LITERAL_1__tils',
          text: resultText
        }]
      };
    } catch (error) {
      logger.error('tils', { error: error.message });
      return {
        content: [{
          type: 'api',
          text: `❌ Unexpected error: ${error.message}`
        }],
        isError: true
      };
    }
  }
};
export const listPersonas = {
  name: ' (24 * 60 * 60 * 1000))} days`;
      return {
        content: [{
          type: 'text',
          text: resultText
        }]
      };
    } catch (error) {
      logger.error('Unexpected error in create_persona', { error: error.message });
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
export const listPersonas = {
  name: 'list_personas',
  description: 'List all personas with optional filtering and statistics',
  inputSchema: {
    type: 'object',
    properties: {
      limit: {
        type: 'integer',
        description: 'Maximum number of personas to return (default: 50)',
        minimum: 1,
        maximum: 1000
      },
      offset: {
        type: 'integer',
        description: 'Number of personas to skip (default: 0)',
        minimum: 0
      },
      include_stats: {
        type: 'boolean',
        description: 'Include memory statistics (default: true)'
      },
      active_only: {
        type: 'boolean',
        description: 'Only return active personas (default: true)'
      }
    }
  },
  async handler(params = {}) {
    try {
      const validation = validateInput(personaSchemas.listPersonas, params, 'list_personas');
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
      const result = await apiClient.get('/api/personas', validParams);
      if (!result.success) {
        logger.error('Persona listing failed', {
          error: result.error,
          message: result.message
        });
        return {
          content: [{
            type: 'text',
            text: `❌ Failed to list personas: ${result.message}\n\n💡 ${result.suggestion || 'Check server connectivity and try again.'}`
          }],
          isError: true
        };
      }
      const { personas, total } = result.data;
      logger.info('Personas listed successfully', {
        count: personas.length,
        total
      });
      if (personas.length === 0) {
        return {
          content: [{
            type: 'text',
            text: `📭 **No personas found**\n\n💡 Create your first persona using the \`create_persona\` tool.`
          }]
        };
      }
      let resultText = `📋 **Found ${total} persona${total !== 1 ? 's' : ''}** (showing ${personas.length})\n\n`;
      personas.forEach((persona, index) => {
        resultText += `**${index + 1}. ${persona.name}**\n`;
        resultText += `• ID: ${persona.id}\n`;
        if (persona.description) {
          resultText += `• Description: ${persona.description}\n`;
        }
        resultText += `• Status: ${persona.isActive ? '🟢 Active' : '🔴 Inactive'}\n`;
        resultText += `• Created: ${formatTimestamp(persona.createdAt, 'date')}\n`;
        if (validParams.include_stats && persona.stats) {
          const stats = persona.stats;
          resultText += `• Memories: ${stats.totalMemories || 0} (${stats.conversationCount || 0} conversations)\n`;
          if (stats.memoryTypes && Object.keys(stats.memoryTypes).length > 0) {
            resultText += `• Types: ${Object.entries(stats.memoryTypes).map(([type, count]) => `${type}: ${count}`).join(', ')}\n`;
          }
        }
        resultText += '\n';
      });
      if (total > personas.length) {
        const remaining = total - (validParams.offset || 0) - personas.length;
        resultText += `📄 **${remaining} more persona${remaining !== 1 ? 's' : ''} available** (use offset parameter to see more)`;
      }
      return {
        content: [{
          type: 'text',
          text: resultText.trim()
        }]
      };
    } catch (error) {
      logger.error('Unexpected error in list_personas', { error: error.message });
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
export const getPersona = {
  name: 'get_persona',
  description: 'Get detailed information about a specific persona',
  inputSchema: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        description: 'Persona ID (required)'
      },
      include_memories: {
        type: 'boolean',
        description: 'Include recent memories (default: false)'
      },
      memory_limit: {
        type: 'integer',
        description: 'Max memories to include (default: 10)',
        minimum: 1,
        maximum: 100
      }
    },
    required: ['id']
  },
  async handler(params) {
    try {
      const validation = validateInput(personaSchemas.getPersona, params, 'get_persona');
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
      const result = await apiClient.get(`__LITERAL_6__personas__LITERAL_7__ (24 * 60 * 60 * 1000))} days\n`;
      if (persona.stats) {
        const stats = persona.stats;
        resultText += `\n📈 **Statistics:**\n`;
        resultText += `• Total Memories: ${stats.totalMemories || 0}\n`;
        resultText += `• Conversations: ${stats.conversationCount || 0}\n`;
        if (stats.memoryTypes && Object.keys(stats.memoryTypes).length > 0) {
          resultText += `• Memory Types: ${Object.entries(stats.memoryTypes).map(([type, count]) => `${type}: ${count}`).join(', ')}\n`;
        }
        if (stats.lastActivity) {
          resultText += `• Last Activity: ${formatTimestamp(stats.lastActivity, 'iso')}\n`;
        }
      }
      if (validParams.include_memories && persona.recentMemories && persona.recentMemories.length > 0) {
        resultText += `\n🧠 **Recent Memories (${persona.recentMemories.length}):**\n`;
        persona.recentMemories.forEach((memory, index) => {
          resultText += `${index + 1}. [${memory.contentType}] ${memory.content.substring(0, 100)}${memory.content.length > 100 ? '...' : ''}\n`;
          resultText += `   📅 ${formatTimestamp(memory.createdAt, 'time')}\n`;
        });
      }
      return {
        content: [{
          type: 'text',
          text: resultText
        }]
      };
    } catch (error) {
      logger.error('Unexpected error in get_persona', { error: error.message });
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
export const updatePersona = {
  name: 'update_persona',
  description: 'Update persona configuration and settings',
  inputSchema: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        description: 'Persona ID (required)'
      },
      name: {
        type: 'string',
        description: 'New name for the persona',
        minLength: 1,
        maxLength: 100
      },
      description: {
        type: 'string',
        description: 'New description',
        maxLength: 500
      },
      systemPrompt: {
        type: 'string',
        description: 'New system prompt',
        maxLength: 5000
      },
      temperature: {
        type: 'number',
        description: 'New creativity level (0-2)',
        minimum: 0,
        maximum: 2
      },
      maxTokens: {
        type: 'integer',
        description: 'New max response length (1-8192)',
        minimum: 1,
        maximum: 8192
      },
      maxMemorySize: {
        type: 'integer',
        description: 'New max memory size (1-10000)',
        minimum: 1,
        maximum: 10000
      },
      memoryDecayTime: {
        type: 'integer',
        description: 'New memory decay time in milliseconds (minimum: 3600000)',
        minimum: 3600000
      }
    },
    required: ['id']
  },
  async handler(params) {
    try {
      const validation = validateInput(personaSchemas.updatePersona, params, 'update_persona');
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
      const { id, ...updateData } = validParams;
      const result = await apiClient.put(`__LITERAL_8__personas__LITERAL_9__api__LITERAL_10__${id}`);
      if (!result.success) {
        logger.error('Persona deletion failed', {
          error: result.error,
          message: result.message,
          personaId: id
        });
        return {
          content: [{
            type: 'text',
            text: `❌ Failed to delete persona: ${result.message}\n\n💡 ${result.suggestion || 'Check the persona ID and try again.'}`
          }],
          isError: true
        };
      }
      logger.info('Persona deleted successfully', { personaId: id });
      let resultText = `✅ **Persona deleted successfully!**\n\n`;
      resultText += `🗑️ **Deleted:**\n`;
      resultText += `• Persona ID: ${id}\n`;
      resultText += `\n⚠️ **This action is irreversible.**`;
      return {
        content: [{
          type: 'text',
          text: resultText
        }]
      };
    } catch (error) {
      logger.error('Unexpected error in delete_persona', { error: error.message });
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
export const personaTools = [
  createPersona,
  listPersonas,
  getPersona,
  updatePersona,
  deletePersona
];
