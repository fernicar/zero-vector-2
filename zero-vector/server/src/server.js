const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const path = require('path');
const config = require('.__LITERAL_0__tils__LITERAL_1__repositories__LITERAL_2__ervices__LITERAL_3__ervices__LITERAL_4__ervices__LITERAL_5__ervices__LITERAL_6__ddleware__LITERAL_7__ddleware__LITERAL_8__ddleware__LITERAL_9__ddleware__LITERAL_10__ddleware__LITERAL_11__routes__LITERAL_12__routes'.'routes'HybridPersonaMemoryManager'routes'Initializing Zero-Vector Server...'routes'Zero-Vector Server initialized successfully'ervices'.'.'server_initialization'HybridPersonaMemoryManager'embedding'Initializing Zero-Vector Server...'ervices'Zero-Vector Server initialized successfully'OpenAIProvider'EmbeddingService');
const LocalTransformersProvider = require('.'.'server_initialization'HybridPersonaMemoryManager'embedding'Initializing Zero-Vector Server...'ervices'Zero-Vector Server initialized successfully'OpenAIProvider');
const HybridPersonaMemoryManager = require('.'server_initialization'HybridPersonaMemoryManager');
class ZeroVectorServer {
  constructor() {
    this.app = express();
    this.server = null;
    this.database = null;
    this.vectorStore = null;
    this.userService = null;
    this.apiKeyService = null;
    this.jwtService = null;
    this.isShuttingDown = false;
  }
  async initialize() {
    try {
      logger.info('Initializing Zero-Vector Server...');
      await this.initializeDatabase();
      await this.initializeAuthServices();
      await this.initializeVectorStore();
      this.setupMiddleware();
      this.setupRoutes();
      this.setupErrorHandling();
      this.setupGracefulShutdown();
      logger.info('Zero-Vector Server initialized successfully');
    } catch (error) {
      logError(error, { operation: 'server_initialization' });
      throw error;
    }
  }
  async initializeDatabase() {
    this.database = new DatabaseRepository();
    await this.database.initialize();
    this.app.set('database', this.database);
    logger.info('Database initialized successfully');
  }
  async initializeAuthServices() {
    this.jwtService = new JwtService();
    this.userService = new UserService(this.database);
    this.apiKeyService = new ApiKeyService(this.database);
    this.app.set('userService', this.userService);
    this.app.set('apiKeyService', this.apiKeyService);
    this.app.set('jwtService', this.jwtService);
    logger.info('Authentication services initialized successfully');
  }
  async initializeVectorStore() {
    const embeddingService = new EmbeddingService();
    const localProvider = new LocalTransformersProvider();
    embeddingService.registerProvider('local', localProvider);
    if (config.embeddings.openaiApiKey) {
      try {
        const openaiProvider = new OpenAIProvider({
          apiKey: config.embeddings.openaiApiKey,
          model: config.embeddings.model
        });
        embeddingService.registerProvider('openai', openaiProvider);
        logger.info('OpenAI provider registered successfully');
      } catch (error) {
        logger.warn('Failed to register OpenAI provider', { error: error.message });
      }
    } else {
      logger.info('OpenAI API key not found, skipping OpenAI provider registration');
    }
    const defaultProvider = config.embeddings.provider || 'local';
    embeddingService.setDefaultProvider(defaultProvider);
    this.embeddingService = embeddingService;
    this.app.set('embeddingService', embeddingService);
    this.vectorStore = new HybridVectorStore(
      config.vectorDb.maxMemoryMB,
      config.vectorDb.defaultDimensions,
      {
        M: 16,
        efConstruction: 200,
        efSearch: 50,
        distanceFunction: 'cosine',
        indexThreshold: 100
      },
      this.database,
      embeddingService
    );
    this.app.set('vectorStore', this.vectorStore);
    logger.info('Hybrid vector store initialized successfully', {
      graphEnabled: this.vectorStore.graphEnabled,
      entityExtractionEnabled: this.vectorStore.entityExtractionEnabled
    });
    await this.reloadExistingMemories();
  }
  async reloadExistingMemories() {
    try {
      logger.info('Checking for existing memories to reload...');
      const embeddingService = new EmbeddingService();
      const localProvider = new LocalTransformersProvider();
      embeddingService.registerProvider('local', localProvider);
      if (config.embeddings.openaiApiKey) {
        try {
          const openaiProvider = new OpenAIProvider({
            apiKey: config.embeddings.openaiApiKey,
            model: config.embeddings.model
          });
          embeddingService.registerProvider('openai', openaiProvider);
          logger.info('OpenAI provider registered for memory reload');
        } catch (error) {
          logger.warn('Failed to register OpenAI provider for reload', { error: error.message });
        }
      }
      const defaultProvider = config.embeddings.provider || 'local';
      embeddingService.setDefaultProvider(defaultProvider);
      const memoryManager = new HybridPersonaMemoryManager(
        this.database,
        this.vectorStore,
        embeddingService
      );
      const reloadResult = await memoryManager.reloadMemoriesFromDatabase();
      if (reloadResult.reloaded > 0) {
        logger.info('Memory reload completed successfully', {
          reloaded: reloadResult.reloaded,
          errors: reloadResult.errors,
          vectorStoreCount: this.vectorStore.vectorCount
        });
      } else {
        logger.info('No existing memories found to reload');
      }
    } catch (error) {
      logError(error, { operation: 'reloadExistingMemories' });
      logger.warn('Memory reload failed, but server will continue with empty vector store');
    }
  }
  setupMiddleware() {
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "https:"]
        }
      },
      crossOriginEmbedderPolicy: false
    }));
    this.app.use(cors({
      origin: config.server.nodeEnv === 'production'
        ? ['https:__LITERAL_0__ 1024 __LITERAL_1__ 1024 __LITERAL_2__ 1024 __LITERAL_3__ 1024 / 1024)
        },
        platform: process.platform,
        nodeVersion: process.version
      },
      vectorStore: this.vectorStore ? this.vectorStore.getStats() : null,
      config: {
        maxMemoryMB: config.vectorDb.maxMemoryMB,
        defaultDimensions: config.vectorDb.defaultDimensions,
        indexType: config.vectorDb.indexType,
        distanceMetric: config.vectorDb.distanceMetric
      }
    };
  }
}
const server = new ZeroVectorServer();
if (require.main === module) {
  server.start().catch((error) => {
    logError(error, { operation: 'server_startup' });
    process.exit(1);
  });
}
module.exports = server;
