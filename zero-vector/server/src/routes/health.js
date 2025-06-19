const express = require('express');
const { asyncHandler } = require('../middleware/errorHandler');
const { logger } = require('../utils/logger');
const { performanceStatsService } = require('../services/PerformanceStatsService');

const router = express.Router();

router.get('/', asyncHandler(async (req, res) => {
  const startTime = Date.now();

  let dbStatus = 'unknown';
  try {
    const isHealthy = await req.database.healthCheck();
    dbStatus = isHealthy ? 'healthy' : 'unhealthy';
  } catch (error) {
    dbStatus = 'unhealthy';
    logger.error('Database health check failed', { error: error.message });
  }

  let vectorStoreStatus = 'unknown';
  try {
    const stats = req.vectorStore.getStats();
    vectorStoreStatus = 'healthy';
  } catch (error) {
    vectorStoreStatus = 'unhealthy';
    logger.error('Vector store health check failed', { error: error.message });
  }

  const performanceMetrics = performanceStatsService.getMetrics();

  const healthCheck = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    services: {
      database: dbStatus,
      vectorStore: vectorStoreStatus
    },
    system: {
      platform: process.platform,
      nodeVersion: process.version,
      memory: process.memoryUsage(),
      pid: process.pid
    },
    performance: {
      avgResponseTime: performanceMetrics.avgResponseTime,
      requestsPerMinute: performanceMetrics.requestsPerMinute
    },
    responseTime: Date.now() - startTime
  };

  if (dbStatus !== 'healthy' || vectorStoreStatus !== 'healthy') {
    healthCheck.status = 'degraded';
    res.status(503);
  }

  res.json(healthCheck);
}));

router.get('/detailed', asyncHandler(async (req, res) => {
  const startTime = Date.now();

  const vectorStats = req.vectorStore.getStats();

  let dbStats = {};
  try {
    const recentStats = await req.database.getUsageStats({
      since: Date.now() - 3600000
    });

    dbStats = {
      recentOperations: recentStats.length,
      connectionStatus: 'healthy'
    };
  } catch (error) {
    dbStats = {
      connectionStatus: 'unhealthy',
      error: error.message
    };
  }

  const memUsage = process.memoryUsage();
  const cpuUsage = process.cpuUsage();

  const detailedPerfStats = performanceStatsService.getDetailedStats();

  const detailedHealth = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    server: {
      uptime: process.uptime(),
      pid: process.pid,
      platform: process.platform,
      nodeVersion: process.version,
      environment: process.env.NODE_ENV || 'development'
    },
    performance: {
      avgResponseTime: detailedPerfStats.current.avgResponseTime,
      requestsPerMinute: detailedPerfStats.current.requestsPerMinute,
      memory: {
        rss: Math.round(memUsage.rss / 1024 / 1024),
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
        external: Math.round(memUsage.external / 1024 / 1024),
        arrayBuffers: Math.round(memUsage.arrayBuffers / 1024 / 1024)
      },
      cpu: {
        user: cpuUsage.user,
        system: cpuUsage.system
      },
      requests: detailedPerfStats.current,
      timeWindows: detailedPerfStats.timeWindows,
      responseTimePercentiles: detailedPerfStats.responseTimePercentiles
    },
    services: {
      database: dbStats,
      vectorStore: vectorStats
    },
    responseTime: Date.now() - startTime
  };

  res.json(detailedHealth);
}));

router.get('/ready', asyncHandler(async (req, res) => {
  const checks = [];
  let allReady = true;

  try {
    const isHealthy = await req.database.healthCheck();
    if (isHealthy) {
      checks.push({ service: 'database', status: 'ready' });
    } else {
      checks.push({
        service: 'database',
        status: 'not_ready',
        error: 'Database health check failed'
      });
      allReady = false;
    }
  } catch (error) {
    checks.push({
      service: 'database',
      status: 'not_ready',
      error: error.message
    });
    allReady = false;
  }

  try {
    const stats = req.vectorStore.getStats();
    if (stats.vectorCount >= 0) {
      checks.push({ service: 'vectorStore', status: 'ready' });
    } else {
      checks.push({
        service: 'vectorStore',
        status: 'not_ready',
        error: 'Invalid stats'
      });
      allReady = false;
    }
  } catch (error) {
    checks.push({
      service: 'vectorStore',
      status: 'not_ready',
      error: error.message
    });
    allReady = false;
  }

  const readiness = {
    ready: allReady,
    timestamp: new Date().toISOString(),
    checks: checks
  };

  res.status(allReady ? 200 : 503).json(readiness);
}));

router.get('/live', (req, res) => {
  res.json({
    alive: true,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    pid: process.pid
  });
});

router.get('/metrics', asyncHandler(async (req, res) => {
  const vectorStats = req.vectorStore.getStats();
  const memUsage = process.memoryUsage();

  const metrics = {
    'vector_store_total_vectors': vectorStats.vectorCount,
    'vector_store_max_vectors': vectorStats.maxVectors,
    'vector_store_memory_utilization_percent': vectorStats.memoryUtilization,
    'vector_store_used_memory_bytes': vectorStats.usedMemory,
    'vector_store_free_memory_bytes': vectorStats.freeMemory,
    'vector_store_dimensions': vectorStats.dimensions,
    'vector_store_free_slots': vectorStats.freeSlots,

    'similarity_cache_size': vectorStats.similarityCache.size,
    'similarity_cache_hits': vectorStats.similarityCache.hits,
    'similarity_cache_misses': vectorStats.similarityCache.misses,
    'similarity_cache_hit_rate': vectorStats.similarityCache.hitRate,

    'operations_insertions_total': vectorStats.operations.insertions,
    'operations_deletions_total': vectorStats.operations.deletions,
    'operations_searches_total': vectorStats.operations.searches,

    'system_memory_rss_bytes': memUsage.rss,
    'system_memory_heap_total_bytes': memUsage.heapTotal,
    'system_memory_heap_used_bytes': memUsage.heapUsed,
    'system_memory_external_bytes': memUsage.external,

    'system_uptime_seconds': process.uptime(),
    'system_cpu_user_microseconds': process.cpuUsage().user,
    'system_cpu_system_microseconds': process.cpuUsage().system
  };

  res.set('Content-Type', 'text/plain');

  let output = '';
  for (const [key, value] of Object.entries(metrics)) {
    output += `${key} ${value}\n`;
  }

  res.send(output);
}));

router.get('/config', (req, res) => {
  const config = {
    vectorStore: {
      maxMemoryMB: req.vectorStore.maxMemoryBytes / (1024 * 1024),
      dimensions: req.vectorStore.dimensions,
      maxVectors: req.vectorStore.maxVectors
    },
    server: {
      environment: process.env.NODE_ENV || 'development',
      nodeVersion: process.version,
      platform: process.platform
    },
    features: {
      vectorOperations: true,
      similaritySearch: true,
      batchOperations: true,
      memoryOptimization: true
    }
  };

  res.json(config);
});

module.exports = router;
