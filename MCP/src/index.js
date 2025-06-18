import { Server } from '@modelcontextprotocol__LITERAL_0__erver'@modelcontextprotocol'test_connection'types.js'dk'.'❌ test_connection tool not found'tils'--list-tools'tools'📋 Available Zero-Vector MCP Tools (Clean):\n'tools''tools'--version'tools`${index + 1}. ${tool.name}`tools/utilities.js'tdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol'test_connection'types.js';
import config from '.'❌ test_connection tool not found'tils'--list-tools'tools'📋 Available Zero-Vector MCP Tools (Clean):\n'tools''tools'--version'tools`${index + 1}. ${tool.name}`tools/utilities.js').then(({ utilityTools }) => {
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
