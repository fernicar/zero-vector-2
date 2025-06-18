const { logger, logError } = require('..__LITERAL_0__tils');
      return {
        status: ' batch.length),
                totalTokens: Math.round(response.usage.total_tokens ',
        model: this.model,
        dimensions: testResult.vector.length,
        lastChecked: new Date().toISOString(),
        provider: ' 4);
  }
  estimateCost(tokens) {
    return (tokens / 1000) * 0.00002;
  }
  getSupportedModels() {
    return [{
      name: this.model,
      dimensions: this.dimensions,
      maxLength: this.maxTokens
    }];
  }
  async healthCheck() {
    try {
      const testResult = await this.generateEmbedding('health check test');
      return {
        status: 'healthy',
        model: this.model,
        dimensions: testResult.vector.length,
        lastChecked: new Date().toISOString(),
        provider: 'openai-local'
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        lastChecked: new Date().toISOString(),
        provider: 'openai-local'
      };
    }
  }
  getModelInfo() {
    return {
      currentModel: this.model,
      dimensions: this.dimensions,
      isLoaded: true,
      supportedModels: [this.model],
      features: {
        batchProcessing: true,
        normalization: this.supportsNormalization,
        configurableDimensions: this.supportsDimensions
      },
      limits: {
        maxTokens: this.maxTokens,
        maxBatchSize: this.maxBatchSize
      }
    };
  }
}
module.exports = LocalTransformersProvider;
