const { logger, logError } = require('../../utils/logger');

class EmbeddingService {
  constructor() {
    this.providers = new Map();
    this.defaultProvider = null;
    this.cache = new Map();
    this.maxCacheSize = 10000;
    this.stats = {
      requests: 0,
      cacheHits: 0,
      cacheMisses: 0,
      errors: 0,
      totalTime: 0,
      avgTime: 0
    };
  }

  registerProvider(name, provider) {
    if (!provider || typeof provider.generateEmbedding !== 'function') {
      throw new Error('Provider must implement generateEmbedding method');
    }

    this.providers.set(name, provider);

    if (!this.defaultProvider) {
      this.defaultProvider = name;
    }

    logger.info(`Embedding provider registered: ${name}`);
  }

  setDefaultProvider(providerName) {
    if (!this.providers.has(providerName)) {
      throw new Error(`Provider '${providerName}' not found`);
    }

    this.defaultProvider = providerName;
    logger.info(`Default embedding provider set to: ${providerName}`);
  }

  async generateEmbedding(text, options = {}) {
    const startTime = Date.now();

    try {
      const {
        provider = this.defaultProvider,
        useCache = true,
        model = null,
        dimensions = null,
        normalize = true
      } = options;

      if (!text || typeof text !== 'string') {
        throw new Error('Text input is required and must be a string');
      }

      if (!provider || !this.providers.has(provider)) {
        throw new Error(`Provider '${provider}' not found or not registered`);
      }

      const cacheKey = this.generateCacheKey(text, provider, model, dimensions);
      if (useCache && this.cache.has(cacheKey)) {
        this.stats.cacheHits++;
        const cachedResult = this.cache.get(cacheKey);

        this.cache.delete(cacheKey);
        this.cache.set(cacheKey, cachedResult);

        logger.debug('Embedding cache hit', { provider, textLength: text.length });
        return cachedResult;
      }

      this.stats.cacheMisses++;

      const providerInstance = this.providers.get(provider);
      const embedding = await providerInstance.generateEmbedding(text, {
        model,
        dimensions,
        normalize
      });

      if (!embedding || !Array.isArray(embedding.vector)) {
        throw new Error('Invalid embedding result from provider');
      }

      const result = {
        vector: embedding.vector,
        dimensions: embedding.vector.length,
        provider: provider,
        model: embedding.model || model || 'default',
        usage: embedding.usage || {},
        metadata: {
          textLength: text.length,
          normalized: normalize,
          generatedAt: new Date().toISOString()
        }
      };

      if (useCache) {
        this.addToCache(cacheKey, result);
      }

      this.stats.requests++;
      const duration = Date.now() - startTime;
      this.stats.totalTime += duration;
      this.stats.avgTime = this.stats.totalTime / this.stats.requests;

      logger.info('Embedding generated successfully', {
        provider,
        model: result.model,
        dimensions: result.dimensions,
        textLength: text.length,
        duration
      });

      return result;

    } catch (error) {
      this.stats.errors++;
      const duration = Date.now() - startTime;

      logError(error, {
        operation: 'generateEmbedding',
        provider: options.provider || this.defaultProvider,
        textLength: text?.length,
        duration
      });

      throw error;
    }
  }

  async generateBatchEmbeddings(texts, options = {}) {
    const startTime = Date.now();

    try {
      const {
        provider = this.defaultProvider,
        batchSize = 10,
        useCache = true,
        ...embeddingOptions
      } = options;

      if (!Array.isArray(texts) || texts.length === 0) {
        throw new Error('Texts must be a non-empty array');
      }

      const results = [];
      const errors = [];

      for (let i = 0; i < texts.length; i += batchSize) {
        const batch = texts.slice(i, i + batchSize);

        const providerInstance = this.providers.get(provider);
        if (providerInstance.generateBatchEmbeddings) {
          try {
            const batchResults = await providerInstance.generateBatchEmbeddings(batch, embeddingOptions);
            results.push(...batchResults);
          } catch (batchError) {
            for (const text of batch) {
              try {
                const result = await this.generateEmbedding(text, { ...embeddingOptions, provider, useCache });
                results.push(result);
              } catch (error) {
                errors.push({ text, error: error.message });
              }
            }
          }
        } else {
          for (const text of batch) {
            try {
              const result = await this.generateEmbedding(text, { ...embeddingOptions, provider, useCache });
              results.push(result);
            } catch (error) {
              errors.push({ text, error: error.message });
            }
          }
        }
      }

      const duration = Date.now() - startTime;

      logger.info('Batch embedding completed', {
        provider,
        totalTexts: texts.length,
        successful: results.length,
        errors: errors.length,
        duration
      });

      return {
        embeddings: results,
        errors: errors,
        summary: {
          total: texts.length,
          successful: results.length,
          failed: errors.length,
          duration
        }
      };

    } catch (error) {
      logError(error, {
        operation: 'generateBatchEmbeddings',
        textCount: texts?.length
      });
      throw error;
    }
  }

  getAvailableProviders() {
    const providers = [];

    for (const [name, provider] of this.providers) {
      providers.push({
        name,
        isDefault: name === this.defaultProvider,
        models: provider.getSupportedModels ? provider.getSupportedModels() : ['default'],
        features: {
          batchProcessing: !!provider.generateBatchEmbeddings,
          configurableDimensions: !!provider.supportsDimensions,
          normalization: !!provider.supportsNormalization
        }
      });
    }

    return providers;
  }

  getStats() {
    const hitRate = this.stats.requests > 0
      ? (this.stats.cacheHits / (this.stats.cacheHits + this.stats.cacheMisses)) * 100
      : 0;

    return {
      providers: {
        registered: this.providers.size,
        default: this.defaultProvider,
        available: Array.from(this.providers.keys())
      },
      cache: {
        size: this.cache.size,
        maxSize: this.maxCacheSize,
        hitRate: hitRate.toFixed(2) + '%'
      },
      performance: {
        ...this.stats,
        hitRate: hitRate.toFixed(2) + '%'
      }
    };
  }

  clearCache() {
    this.cache.clear();
    logger.info('Embedding cache cleared');
  }

  configureCache(maxSize) {
    this.maxCacheSize = maxSize;

    if (this.cache.size > maxSize) {
      const entries = Array.from(this.cache.entries());
      const toKeep = entries.slice(-maxSize);

      this.cache.clear();
      toKeep.forEach(([key, value]) => this.cache.set(key, value));
    }

    logger.info(`Embedding cache configured: maxSize=${maxSize}`);
  }

  generateCacheKey(text, provider, model, dimensions) {
    const hash = this.simpleHash(text);
    return `${provider}:${model || 'default'}:${dimensions || 'default'}:${hash}`;
  }

  simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(36);
  }

  addToCache(key, value) {
    if (this.cache.size >= this.maxCacheSize) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }

    this.cache.set(key, value);
  }

  async healthCheck() {
    const results = {};

    for (const [name, provider] of this.providers) {
      try {
        if (provider.healthCheck) {
          results[name] = await provider.healthCheck();
        } else {
          const testResult = await provider.generateEmbedding('test', { model: 'default' });
          results[name] = {
            status: 'healthy',
            lastChecked: new Date().toISOString(),
            dimensions: testResult.vector.length
          };
        }
      } catch (error) {
        results[name] = {
          status: 'unhealthy',
          error: error.message,
          lastChecked: new Date().toISOString()
        };
      }
    }

    return results;
  }
}

module.exports = EmbeddingService;
