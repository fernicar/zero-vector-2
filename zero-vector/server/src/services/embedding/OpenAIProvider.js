const { logger, logError } = require('..__LITERAL_0__tils__LITERAL_1____LITERAL_2__v1';
    this.model = options.model || process.env.EMBEDDING_MODEL || 'text-embedding-3-small';
    this.supportsDimensions = true;
    this.supportsNormalization = false;
    this.maxBatchSize = 2048;
    this.maxTokens = 8191;
    this.modelConfigs = {
      'text-embedding-3-small': { dimensions: 1536, maxTokens: 8191, costPer1k: 0.00002 },
      'text-embedding-3-large': { dimensions: 3072, maxTokens: 8191, costPer1k: 0.00013 },
      'text-embedding-ada-002': { dimensions: 1536, maxTokens: 8191, costPer1k: 0.0001 }
    };
    if (!this.apiKey) {
      throw new Error('OpenAI API key is required');
    }
    logger.info(`OpenAI provider initialized with model: ${this.model}`);
  }
  async generateEmbedding(text, options = {}) {
    const startTime = Date.now();
    try {
      const {
        model = this.model,
        dimensions = null,
        user = null
      } = options;
      if (!text || typeof text !== 'string') {
        throw new Error('Text input is required and must be a string');
      }
      const estimatedTokens = this.estimateTokens(text);
      const modelConfig = this.modelConfigs[model] || this.modelConfigs[this.model];
      if (estimatedTokens > modelConfig.maxTokens) {
        throw new Error(`Text too long: ${estimatedTokens} tokens exceeds limit of ${modelConfig.maxTokens}`);
      }
      const requestBody = {
        input: text,
        model: model
      };
      if (dimensions && this.modelSupportsCustomDimensions(model)) {
        requestBody.dimensions = dimensions;
      }
      if (user) {
        requestBody.user = user;
      }
      const response = await this.makeAPIRequest('embeddings', requestBody);
      const embeddingData = response.data[0];
      const usage = response.usage;
      const result = {
        vector: embeddingData.embedding,
        model: model,
        usage: {
          promptTokens: usage.prompt_tokens,
          totalTokens: usage.total_tokens
        },
        metadata: {
          provider: 'openai',
          textLength: text.length,
          estimatedCost: this.estimateCost(usage.total_tokens, model),
          processingTime: Date.now() - startTime
        }
      };
      logger.info('OpenAI embedding generated successfully', {
        model,
        dimensions: result.vector.length,
        textLength: text.length,
        tokens: usage.total_tokens,
        processingTime: result.metadata.processingTime
      });
      return result;
    } catch (error) {
      logError(error, {
        operation: 'generateEmbedding',
        provider: 'openai',
        model: options.model || this.model,
        textLength: text?.length
      });
      throw error;
    }
  }
  async generateBatchEmbeddings(texts, options = {}) {
    const startTime = Date.now();
    try {
      const {
        model = this.model,
        dimensions = null,
        user = null,
        batchSize = this.maxBatchSize
      } = options;
      if (!Array.isArray(texts) || texts.length === 0) {
        throw new Error('Texts must be a non-empty array');
      }
      const results = [];
      const errors = [];
      for (let i = 0; i < texts.length; i += batchSize) {
        const batch = texts.slice(i, i + batchSize);
        try {
          const requestBody = {
            input: batch,
            model: model
          };
          if (dimensions && this.modelSupportsCustomDimensions(model)) {
            requestBody.dimensions = dimensions;
          }
          if (user) {
            requestBody.user = user;
          }
          const response = await this.makeAPIRequest('embeddings', requestBody);
          response.data.forEach((embeddingData, index) => {
            results.push({
              vector: embeddingData.embedding,
              model: model,
              usage: {
                promptTokens: Math.round(response.usage.prompt_tokens / batch.length),
                totalTokens: Math.round(response.usage.total_tokens / batch.length)
              },
              metadata: {
                provider: 'openai',
                textLength: batch[index].length,
                batchIndex: i + index
              }
            });
          });
        } catch (batchError) {
          for (let j = 0; j < batch.length; j++) {
            try {
              const result = await this.generateEmbedding(batch[j], { model, dimensions, user });
              results.push(result);
            } catch (individualError) {
              errors.push({
                text: batch[j],
                index: i + j,
                error: individualError.message
              });
            }
          }
        }
      }
      const duration = Date.now() - startTime;
      logger.info('OpenAI batch embedding completed', {
        model,
        totalTexts: texts.length,
        successful: results.length,
        errors: errors.length,
        duration
      });
      return results;
    } catch (error) {
      logError(error, {
        operation: 'generateBatchEmbeddings',
        provider: 'openai',
        textCount: texts?.length
      });
      throw error;
    }
  }
  async makeAPIRequest(endpoint, body) {
    const url = `${this.baseURL}/${endpoint}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'User-Agent': 'Zero-Vector-Server/1.0.0'
      },
      body: JSON.stringify(body)
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`OpenAI API error: ${response.status} - ${errorData.error?.message || response.statusText}`);
    }
    return await response.json();
  }
  modelSupportsCustomDimensions(model) {
    return model.startsWith('text-embedding-3');
  }
  estimateTokens(text) {
    return Math.ceil(text.length / 4);
  }
  estimateCost(tokens, model) {
    const modelConfig = this.modelConfigs[model] || this.modelConfigs[this.model];
    return (tokens / 1000) * modelConfig.costPer1k;
  }
  getSupportedModels() {
    return Object.keys(this.modelConfigs).map(model => ({
      name: model,
      dimensions: this.modelConfigs[model].dimensions,
      maxTokens: this.modelConfigs[model].maxTokens,
      costPer1k: this.modelConfigs[model].costPer1k,
      supportsCustomDimensions: this.modelSupportsCustomDimensions(model)
    }));
  }
  async healthCheck() {
    try {
      const testResult = await this.generateEmbedding('health check test');
      return {
        status: 'healthy',
        model: this.model,
        dimensions: testResult.vector.length,
        lastChecked: new Date().toISOString(),
        provider: 'openai'
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        lastChecked: new Date().toISOString(),
        provider: 'openai'
      };
    }
  }
  getModelInfo() {
    return {
      currentModel: this.model,
      supportedModels: Object.keys(this.modelConfigs),
      features: {
        batchProcessing: true,
        customDimensions: this.supportsDimensions,
        normalization: this.supportsNormalization
      },
      limits: {
        maxBatchSize: this.maxBatchSize,
        maxTokens: this.maxTokens
      }
    };
  }
}
module.exports = OpenAIProvider;
