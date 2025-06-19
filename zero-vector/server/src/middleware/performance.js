const { logPerformance, logger } = require('../utils/logger');
const { performanceStatsService } = require('../services/PerformanceStatsService');

const performanceMiddleware = (req, res, next) => {
  req.startTime = Date.now();

  if (!global.requestCount) {
    global.requestCount = 0;
  }
  global.requestCount++;

  const originalJson = res.json;
  res.json = function(data) {
    const responseSize = JSON.stringify(data).length;
    res.set('X-Response-Size', responseSize.toString());
    return originalJson.call(this, data);
  };

  res.on('finish', () => {
    const duration = Date.now() - req.startTime;
    const responseSize = parseInt(res.get('X-Response-Size') || '0', 10);

    const performanceData = {
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration,
      responseSize,
      userAgent: req.get('User-Agent'),
      ip: req.ip
    };

    if (duration > 1000) {
      logger.warn('Slow request detected', performanceData);
    }

    logPerformance(`${req.method} ${req.url}`, duration, performanceData);

    performanceStatsService.recordRequest(performanceData);
  });

  if (global.requestCount % 100 === 0) {
    const memUsage = process.memoryUsage();
    logger.info('Memory usage check', {
      requestCount: global.requestCount,
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
      external: Math.round(memUsage.external / 1024 / 1024)
    });
  }

  next();
};

module.exports = performanceMiddleware;
