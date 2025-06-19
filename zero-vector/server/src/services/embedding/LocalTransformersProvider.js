const { logger, logError } = require('../../utils/logger');
const OpenAI = require('openai');

class LocalTransformersProvider {
  constructor(options = {}) {
    this.apiKey = options.apiKey || process.env.OPENAI_API_KEY;
    this.model = 'text-embedding-3-small';
    this.dimensions = 1536;
    this.supportsDimensions = false;
    this.supportsNormalization = false;
    this.maxTokens = 8191;
    this.maxBatchSize = 2048;

    if (!this.apiKey) {
      throw new Error('OpenAI API key is required. Set OPENAI_API_KEY environment variable.');
    }

    this.openai = new OpenAI({
      apiKey: this.apiKey
    });

    logger.info(`OpenAI Embedding Provider initialized with model: ${this.model}`);
  }

  async generateEmbedding(text, options = {}) {
    const startTime = Date.now();

    try {
      if (!text || typeof text !== 'string') {
        throw new Error('Text input is required and must be a string');
      }

      const estimatedTokens = this.estimateTokens(text);
      if (estimatedTokens > this.maxTokens) {
        throw new Error(`Text too long: ${estimatedTokens} tokens exceeds limit of ${this.maxTokens}`);
      }

      const response = await this.openai.embeddings.create({
        input: text,
        model: this.model
      });

      const embeddingData = response.data[0];
      const usage = response.usage;

      const result = {
        vector: embeddingData.embedding,
        model: this.model,
        usage: {
          promptTokens: usage.prompt_tokens,
          totalTokens: usage.total_tokens
        },
        metadata: {
          provider: 'openai-local',
          textLength: text.length,
          estimatedCost: this.estimateCost(usage.total_tokens),
          processingTime: Date.now() - startTime
        }
      };

      logger.debug('OpenAI embedding generated', {
        model: this.model,
        dimensions: result.vector.length,
        textLength: text.length,
        tokens: usage.total_tokens,
        processingTime: result.metadata.processingTime
      });

      return result;

    } catch (error) {
      logError(error, {
        operation: 'generateEmbedding',
        provider: 'openai-local',
        model: this.model,
        textLength: text?.length
      });
      throw error;
    }
  }

  async generateBatchEmbeddings(texts, options = {}) {
    const startTime = Date.now();

    try {
      if (!Array.isArray(texts) || texts.length === 0) {
        throw new Error('Texts must be a non-empty array');
      }

      const results = [];
      const batchSize = options.batchSize || Math.min(this.maxBatchSize, 100);

      for (let i = 0; i < texts.length; i += batchSize) {
        const batch = texts.slice(i, i + batchSize);

        try {
          const response = await this.openai.embeddings.create({
            input: batch,
            model: this.model
          });

          response.data.forEach((embeddingData, index) => {
            results.push({
              vector: embeddingData.embedding,
              model: this.model,
              usage: {
                promptTokens: Math.round(response.usage.prompt_tokens / batch.length),
                totalTokens: Math.round(response.usage.total_tokens / batch.length)
              },
              metadata: {
                provider: 'openai-local',
                textLength: batch[index].length,
                batchIndex: i + index,
                processingTime: Date.now() - startTime
              }
            });
          });

        } catch (batchError) {
          logger.warn('Batch processing failed, falling back to individual requests', {
            batchSize: batch.length,
            error: batchError.message
          });

          for (let j = 0; j < batch.length; j++) {
            try {
              const result = await this.generateEmbedding(batch[j]);
              results.push(result);
            } catch (individualError) {
              logError(individualError, {
                operation: 'generateBatchEmbedding_individual',
                index: i + j,
                text: batch[j]?.substring(0, 100)
              });
              throw individualError;
            }
          }
        }
      }

      const duration = Date.now() - startTime;

      logger.info('OpenAI batch embedding completed', {
        model: this.model,
        totalTexts: texts.length,
        successful: results.length,
        duration
      });

      return results;

    } catch (error) {
      logError(error, {
        operation: 'generateBatchEmbeddings',
        provider: 'openai-local',
        textCount: texts?.length
      });
      throw error;
    }
  }

  estimateTokens(text) {
    return Math.ceil(text.length / 4);
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
