const express = require('express');
const { asyncHandler } = require('..__LITERAL_0__errorHandler');
const { logger } = require('..__LITERAL_1__logger');
const { performanceStatsService } = require('..__LITERAL_2__PerformanceStatsService');
const router = express.Router();
router.get('__LITERAL_3__detailed', asyncHandler(async (req, res) => {
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
router.get('__LITERAL_9__live', (req, res) => {
  res.json({
    alive: true,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    pid: process.pid
  });
});
router.get('__LITERAL_10__plain');
  let output = '';
  for (const [key, value] of Object.entries(metrics)) {
    output += `${key} ${value}\n`;
  }
  res.send(output);
}));
router.get('__LITERAL_11__ (1024 * 1024),
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
