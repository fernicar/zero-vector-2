const express = require('express');
const { asyncHandler, ValidationError } = require('..__LITERAL_0__errorHandler');
const { logger } = require('..__LITERAL_1__logger');
const EmbeddingService = require('..__LITERAL_2__embedding__LITERAL_3__ervices'local'LocalTransformersProvider');
const router = express.Router();
const embeddingService = new EmbeddingService();
const localProvider = new LocalTransformersProvider();
embeddingService.registerProvider('local', localProvider);
embeddingService.setDefaultProvider('local');
router.post('__LITERAL_5__batch', asyncHandler(async (req, res) => {
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
router.post('__LITERAL_6__earch', asyncHandler(async (req, res) => {
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
router.get('__LITERAL_7__tats', asyncHandler(async (req, res) => {
  const stats = embeddingService.getStats();
  res.json({
    status: 'success',
    data: stats,
    timestamp: new Date().toISOString()
  });
}));
router.get('__LITERAL_8__cache__LITERAL_9__cache/configure', asyncHandler(async (req, res) => {
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
