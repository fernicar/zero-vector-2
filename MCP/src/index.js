#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

import config from './config.js';
import { createLogger } from './utils/logger.js';
import { personaTools } from './tools/personas.js';
import { memoryTools } from './tools/memories.js';
import { utilityTools } from './tools/utilities.js';
import { graphTools } from './tools/graph.js';

const logger = createLogger('MCPServer');

const allTools = [
  ...personaTools,
  ...memoryTools,
  ...utilityTools,
  ...graphTools
];

const server = new Server(
  {
    name: config.server.name,
    version: config.server.version,
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

const handleError = (error, toolName) => {
  logger.error(`Error in ${toolName}`, {
    error: error.message,
    stack: error.stack
  });

  return {
    content: [{
      type: 'text',
      text: `❌ Internal server error in ${toolName}: ${error.message}\n\n💡 This is likely a bug in the MCP server. Please check the logs for more details.`
    }],
    isError: true
  };
};

server.setRequestHandler(ListToolsRequestSchema, async () => {
  logger.info('Listing available tools', { count: allTools.length });

  return {
    tools: allTools.map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema
    }))
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  logger.info('Executing tool', {
    toolName: name,
    hasArguments: !!args && Object.keys(args).length > 0
  });

  const tool = allTools.find(t => t.name === name);
  if (!tool) {
    logger.warn('Tool not found', { toolName: name });
    return {
      content: [{
        type: 'text',
        text: `❌ Tool '${name}' not found.\n\n📋 Available tools: ${allTools.map(t => t.name).join(', ')}`
      }],
      isError: true
    };
  }

  try {
    const startTime = Date.now();
    const result = await tool.handler(args || {});
    const executionTime = Date.now() - startTime;

    logger.info('Tool execution completed', {
      toolName: name,
      executionTime,
      success: !result.isError
    });

    return result;

  } catch (error) {
    return handleError(error, name);
  }
});

const handleUncaughtError = (error, type) => {
  logger.error(`Uncaught ${type}`, {
    error: error.message,
    stack: error.stack
  });

  console.error(`🚨 Uncaught ${type}:`, error);
};

process.on('uncaughtException', (error) => {
  handleUncaughtError(error, 'exception');
});

process.on('unhandledRejection', (reason) => {
  handleUncaughtError(new Error(String(reason)), 'promise rejection');
});

const gracefulShutdown = (signal) => {
  logger.info(`Received ${signal}, shutting down gracefully`);

  setTimeout(() => {
    logger.info('Zero-Vector MCP Server (Clean) stopped');
    process.exit(0);
  }, 1000);
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

async function startServer() {
  try {
    logger.info('Starting Zero-Vector MCP Server (Clean)', {
      version: config.server.version,
      toolCount: allTools.length,
      serverUrl: config.zeroVector.baseUrl
    });

    const transport = new StdioServerTransport();

    await server.connect(transport);

    logger.info('Zero-Vector MCP Server (Clean) started successfully', {
      tools: allTools.map(t => t.name)
    });

  } catch (error) {
    logger.error('Failed to start MCP server', {
      error: error.message,
      stack: error.stack
    });

    console.error('❌ Failed to start Zero-Vector MCP Server (Clean):', error.message);
    process.exit(1);
  }
}

if (process.argv.includes('--test-connection')) {
  import('./tools/utilities.js').then(({ utilityTools }) => {
    const testConnection = utilityTools.find(tool => tool.name === 'test_connection');
    if (testConnection) {
      testConnection.handler().then(result => {
        console.log(result.content[0].text);
        process.exit(result.isError ? 1 : 0);
      });
    } else {
      console.log('❌ test_connection tool not found');
      process.exit(1);
    }
  });
} else if (process.argv.includes('--list-tools')) {
  console.log('📋 Available Zero-Vector MCP Tools (Clean):\n');
  allTools.forEach((tool, index) => {
    console.log(`${index + 1}. ${tool.name}`);
    console.log(`   ${tool.description}`);
    console.log('');
  });
  process.exit(0);
} else if (process.argv.includes('--version')) {
  console.log(`Zero-Vector MCP Server (Clean) v${config.server.version}`);
  process.exit(0);
} else {
  startServer();
}

export { server, allTools };
