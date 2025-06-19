const express = require('express');
const { asyncHandler, ValidationError } = require('../middleware/errorHandler');
const { logger } = require('../utils/logger');
const EmbeddingService = require('../services/embedding/EmbeddingService');
const LocalTransformersProvider = require('../services/embedding/LocalTransformersProvider');

const router = express.Router();

const embeddingService = new EmbeddingService();

const localProvider = new LocalTransformersProvider();
embeddingService.registerProvider('local', localProvider);
embeddingService.setDefaultProvider('local');

router.post('/generate', asyncHandler(async (req, res) => {
  const {
    text,
    provider = 'local',
    model = null,
    dimensions = null,
    normalize = true,
    useCache = true
  } = req.body;

  if (!text || typeof text !== 'string') {
    throw new ValidationError('Text is required and must be a string');
  }

  if (text.length === 0) {
    throw new ValidationError('Text cannot be empty');
  }

  if (text.length > 10000) {
    throw new ValidationError('Text length cannot exceed 10,000 characters');
  }

  try {
    const result = await embeddingService.generateEmbedding(text, {
      provider,
      model,
      dimensions,
      normalize,
      useCache
    });

    logger.info('Embedding generated via API', {
      provider: result.provider,
      model: result.model,
      dimensions: result.dimensions,
      textLength: text.length
    });

    res.json({
      status: 'success',
      data: {
        embedding: result.vector,
        metadata: {
          provider: result.provider,
          model: result.model,
          dimensions: result.dimensions,
          textLength: text.length,
          usage: result.usage
        }
      }
    });

  } catch (error) {
    if (error.message.includes('Provider') && error.message.includes('not found')) {
      throw new ValidationError(`Embedding provider '${provider}' not available`);
    }
    throw error;
  }
}));

router.post('/batch', asyncHandler(async (req, res) => {
  const {
    texts,
    provider = 'local',
    model = null,
    dimensions = null,
    normalize = true,
    useCache = true,
    batchSize = 10
  } = req.body;

  if (!texts || !Array.isArray(texts)) {
    throw new ValidationError('Texts must be an array');
  }

  if (texts.length === 0) {
    throw new ValidationError('Texts array cannot be empty');
  }

  if (texts.length > 100) {
    throw new ValidationError('Maximum 100 texts allowed per batch');
  }

  for (let i = 0; i < texts.length; i++) {
    if (typeof texts[i] !== 'string') {
      throw new ValidationError(`Text at index ${i} must be a string`);
    }
    if (texts[i].length > 10000) {
      throw new ValidationError(`Text at index ${i} exceeds 10,000 character limit`);
    }
  }

  try {
    const result = await embeddingService.generateBatchEmbeddings(texts, {
      provider,
      model,
      dimensions,
      normalize,
      useCache,
      batchSize
    });

    logger.info('Batch embeddings generated via API', {
      provider,
      model,
      totalTexts: texts.length,
      successful: result.embeddings.length,
      errors: result.errors.length
    });

    res.json({
      status: result.errors.length === 0 ? 'success' : 'partial_success',
      data: {
        embeddings: result.embeddings.map(emb => ({
          embedding: emb.vector,
          metadata: {
            provider: emb.provider,
            model: emb.model,
            dimensions: emb.dimensions,
            usage: emb.usage
          }
        })),
        errors: result.errors,
        summary: result.summary
      }
    });

  } catch (error) {
    throw error;
  }
}));

router.post('/store', asyncHandler(async (req, res) => {
  const {
    text,
    id = null,
    metadata = {},
    provider = 'local',
    model = null,
    dimensions = null,
    normalize = true
  } = req.body;

  if (!text || typeof text !== 'string') {
    throw new ValidationError('Text is required and must be a string');
  }

  try {
    const embeddingResult = await embeddingService.generateEmbedding(text, {
      provider,
      model,
      dimensions,
      normalize,
      useCache: true
    });

    const vectorId = id || require('uuid').v4();
    const storeResult = await req.vectorStore.addVector(
      embeddingResult.vector,
      vectorId,
      {
        ...metadata,
        originalText: text,
        embeddingProvider: embeddingResult.provider,
        embeddingModel: embeddingResult.model,
        embeddingDimensions: embeddingResult.dimensions
      }
    );

    await req.database.insertVectorMetadata({
      id: vectorId,
      dimensions: embeddingResult.vector.length,
      personaId: metadata.personaId || null,
      contentType: 'text_embedding',
      source: metadata.source || 'api',
      tags: metadata.tags || [],
      customMetadata: {
        ...metadata,
        originalText: text,
        embeddingProvider: embeddingResult.provider,
        embeddingModel: embeddingResult.model
      }
    });

    logger.info('Text embedded and stored as vector', {
      id: vectorId,
      provider: embeddingResult.provider,
      model: embeddingResult.model,
      dimensions: embeddingResult.dimensions,
      textLength: text.length
    });

    res.status(201).json({
      status: 'success',
      data: {
        id: vectorId,
        dimensions: embeddingResult.dimensions,
        slotIndex: storeResult.slotIndex,
        embedding: {
          provider: embeddingResult.provider,
          model: embeddingResult.model,
          usage: embeddingResult.usage
        },
        metadata: metadata
      },
      message: 'Text embedded and stored as vector successfully'
    });

  } catch (error) {
    throw error;
  }
}));

router.post('/search', asyncHandler(async (req, res) => {
  const {
    query,
    limit = 10,
    threshold = 0.0,
    metric = 'cosine',
    filters = {},
    include_values = false,
    include_metadata = true,
    provider = 'local',
    model = null,
    useIndex = true
  } = req.body;

  if (!query || typeof query !== 'string') {
    throw new ValidationError('Query text is required and must be a string');
  }

  try {
    const queryEmbedding = await embeddingService.generateEmbedding(query, {
      provider,
      model,
      useCache: true
    });

    const searchResults = await req.vectorStore.search(queryEmbedding.vector, {
      limit: parseInt(limit),
      threshold: parseFloat(threshold),
      metric,
      filters,
      includeValues: include_values === true || include_values === 'true',
      useIndex
    });

    if (include_metadata === true || include_metadata === 'true') {
      for (const result of searchResults) {
        try {
          const dbMetadata = await req.database.getVectorMetadata(result.id);
          if (dbMetadata) {
            result.metadata = { ...result.metadata, ...dbMetadata };
          }
        } catch (error) {
          logger.warn('Failed to fetch metadata for search result', {
            id: result.id,
            error: error.message
          });
        }
      }
    }

    logger.info('Semantic search completed', {
      query: query.substring(0, 100),
      provider: queryEmbedding.provider,
      model: queryEmbedding.model,
      resultCount: searchResults.length,
      threshold,
      metric
    });

    res.json({
      status: 'success',
      data: {
        query: {
          text: query,
          embedding: {
            provider: queryEmbedding.provider,
            model: queryEmbedding.model,
            dimensions: queryEmbedding.dimensions
          }
        },
        matches: searchResults,
        meta: {
          totalMatches: searchResults.length,
          threshold,
          metric,
          searchMethod: useIndex ? 'indexed' : 'linear'
        }
      }
    });

  } catch (error) {
    throw error;
  }
}));

router.get('/providers', asyncHandler(async (req, res) => {
  const providers = embeddingService.getAvailableProviders();

  res.json({
    status: 'success',
    data: {
      providers: providers,
      default: embeddingService.defaultProvider
    }
  });
}));

router.get('/stats', asyncHandler(async (req, res) => {
  const stats = embeddingService.getStats();

  res.json({
    status: 'success',
    data: stats,
    timestamp: new Date().toISOString()
  });
}));

router.get('/health', asyncHandler(async (req, res) => {
  const healthResults = await embeddingService.healthCheck();

  const overallHealthy = Object.values(healthResults).every(
    result => result.status === 'healthy'
  );

  res.status(overallHealthy ? 200 : 503).json({
    status: overallHealthy ? 'healthy' : 'degraded',
    data: {
      overall: overallHealthy ? 'healthy' : 'degraded',
      providers: healthResults
    },
    timestamp: new Date().toISOString()
  });
}));

router.post('/cache/clear', asyncHandler(async (req, res) => {
  embeddingService.clearCache();

  logger.info('Embedding cache cleared via API');

  res.json({
    status: 'success',
    message: 'Embedding cache cleared successfully'
  });
}));

router.post('/cache/configure', asyncHandler(async (req, res) => {
  const { maxSize } = req.body;

  if (!maxSize || typeof maxSize !== 'number' || maxSize < 100 || maxSize > 100000) {
    throw new ValidationError('maxSize must be a number between 100 and 100,000');
  }

  embeddingService.configureCache(maxSize);

  logger.info('Embedding cache configured via API', { maxSize });

  res.json({
    status: 'success',
    message: 'Embedding cache configured successfully',
    data: { maxSize }
  });
}));

module.exports = router;
