import apiClient from '..__LITERAL_0__tils__LITERAL_1__tils'Health check failed'tils'text'health'Health check completed'health';
      const result = await apiClient.get(endpoint);
      if (!result.success) {
        logger.error('Health check failed', {
          error: result.error,
          message: result.message
        });
        return {
          content: [{
            type: 'text',
            text: `❌ Zero-Vector server health check failed: ${result.message}\n\n💡 ${result.suggestion || `• Requests`❌ **Connection Test Failed**\n\nUnexpected error: ${error.message}\n\n💡 This indicates a network or configuration issue.`api__LITERAL_11__${validParams.personaId}__LITERAL_12__api__LITERAL_13___stats__LITERAL_26__Persona stats retrieval failed__LITERAL_27__text__LITERAL_28__Check the persona ID and try again.__LITERAL_29__Persona stats retrieved successfully__LITERAL_30__all__LITERAL_31__iso__LITERAL_32__Never__LITERAL_33__iso__LITERAL_34__text__LITERAL_35__Unexpected error in get_persona_stats__LITERAL_36__text__LITERAL_37__test_connection__LITERAL_38__Test connectivity and authentication with the Zero-Vector server__LITERAL_39__object__LITERAL_40__Testing Zero-Vector connection__LITERAL_41__text__LITERAL_42____LITERAL_14__personas__LITERAL_43__Unknown__LITERAL_44__time__LITERAL_45__text__LITERAL_46__Unexpected error in test_connection__LITERAL_47__text',
          text: `}`
          }],
          isError: true
        };
      }
      const healthData = result.data;
      logger.info('Health check completed', { status: healthData.status });
      let resultText = `🏥 **Zero-Vector Server Health**\n\n`;
      resultText += `📊 **Status:** ${(healthData.status === __LITERAL_21__ || healthData.status === __LITERAL_22__) ? __LITERAL_23__ : __LITERAL_24__}\n`;
      resultText += `⏰ **Timestamp:** ${formatTimestamp(healthData.timestamp, __LITERAL_25__)}\n`;
      if (healthData.uptime) {
        const uptimeHours = Math.floor(healthData.uptime __LITERAL_0__ 60);
        resultText += `⏱️ **Uptime:** ${uptimeHours}h ${uptimeMinutes}m\n`;
      }
      if (detailed && healthData.system) {
        const sys = healthData.system;
        resultText += `\n💻 **System Information:**\n`;
        resultText += `• Node.js: ${sys.nodeVersion}\n`;
        resultText += `• Platform: ${sys.platform} ${sys.arch}\n`;
        resultText += `• Memory Usage: ${(sys.memoryUsage.heapUsed __LITERAL_6__ 1024).toFixed(1)}MB __LITERAL_7__ 1024 __LITERAL_8__ 1024 `❌ Zero-Vector server health check failed: ${result.message}\n\n💡 ${result.suggestion || `${vs.maxVectors}\n`;
        resultText += `• Memory Usage: ${vs.memoryUtilization.toFixed(1)}%\n`;
        resultText += `• Dimensions: ${vs.dimensions}\n`;
        if (vs.index && vs.index.enabled) {
          resultText += `• Index: ${vs.index.type} (${vs.index.nodeCount} nodes)\n`;
        }
      }
      if (healthData.performance) {
        const perf = healthData.performance;
        resultText += `\n⚡ **Performance:**\n`;
        resultText += `• Avg Response Time: ${perf.avgResponseTime}ms\n`;
        resultText += `• Requests`❌ **Connection Test Failed**\n\nUnexpected error: ${error.message}\n\n💡 This indicates a network or configuration issue.`api__LITERAL_11__${validParams.personaId}__LITERAL_12__api__LITERAL_13___stats__LITERAL_26__Persona stats retrieval failed__LITERAL_27__text__LITERAL_28__Check the persona ID and try again.__LITERAL_29__Persona stats retrieved successfully__LITERAL_30__all__LITERAL_31__iso__LITERAL_32__Never__LITERAL_33__iso__LITERAL_34__text__LITERAL_35__Unexpected error in get_persona_stats__LITERAL_36__text__LITERAL_37__test_connection__LITERAL_38__Test connectivity and authentication with the Zero-Vector server__LITERAL_39__object__LITERAL_40__Testing Zero-Vector connection__LITERAL_41__text__LITERAL_42____LITERAL_14__personas__LITERAL_43__Unknown__LITERAL_44__time__LITERAL_45__text__LITERAL_46__Unexpected error in test_connection__LITERAL_47__text',
          text: `❌ **Connection Test Failed**\n\nUnexpected error: ${error.message}\n\n💡 This indicates a network or configuration issue.`
        }],
        isError: true
      };
    }
  }
};
export const utilityTools = [
  getSystemHealth,
  getPersonaStats,
  testConnection
];
