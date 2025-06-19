const { logger } = require('../utils/logger');

class PerformanceStatsService {
  constructor(options = {}) {
    this.maxRequestHistory = options.maxRequestHistory || 1000;
    this.timeWindowMs = options.timeWindowMs || 60000;
    this.maxTimeWindows = options.maxTimeWindows || 60;

    this.requestHistory = [];

    this.requestBuckets = new Map();

    this.metricsCache = {
      avgResponseTime: 0,
      requestsPerMinute: 0,
      lastUpdated: Date.now()
    };

    this.cacheTimeout = 5000;

    logger.info('Performance Statistics Service initialized', {
      maxRequestHistory: this.maxRequestHistory,
      timeWindowMs: this.timeWindowMs,
      maxTimeWindows: this.maxTimeWindows
    });
  }

  recordRequest(requestData) {
    const now = Date.now();
    const { duration, method, url, statusCode } = requestData;

    this.requestHistory.push({
      timestamp: now,
      duration,
      method,
      url,
      statusCode
    });

    if (this.requestHistory.length > this.maxRequestHistory) {
      this.requestHistory = this.requestHistory.slice(-this.maxRequestHistory);
    }

    const bucketKey = Math.floor(now / this.timeWindowMs);
    const currentCount = this.requestBuckets.get(bucketKey) || 0;
    this.requestBuckets.set(bucketKey, currentCount + 1);

    this.cleanupOldBuckets(now);

    this.invalidateCache();
  }

  cleanupOldBuckets(now) {
    const oldestAllowed = Math.floor((now - (this.maxTimeWindows * this.timeWindowMs)) / this.timeWindowMs);

    for (const [bucketKey] of this.requestBuckets) {
      if (bucketKey < oldestAllowed) {
        this.requestBuckets.delete(bucketKey);
      }
    }
  }

  calculateAverageResponseTime(timeWindowMs = 300000) {
    const now = Date.now();
    const cutoff = now - timeWindowMs;

    const recentRequests = this.requestHistory.filter(req => req.timestamp > cutoff);

    if (recentRequests.length === 0) {
      return 0;
    }

    const totalDuration = recentRequests.reduce((sum, req) => sum + req.duration, 0);
    return Math.round(totalDuration / recentRequests.length);
  }

  calculateRequestsPerMinute(minutes = 5) {
    const now = Date.now();
    const windowMs = minutes * 60 * 1000;
    const cutoff = Math.floor((now - windowMs) / this.timeWindowMs);

    let totalRequests = 0;
    for (const [bucketKey, count] of this.requestBuckets) {
      if (bucketKey > cutoff) {
        totalRequests += count;
      }
    }

    return Math.round(totalRequests / minutes);
  }

  getMetrics(forceRefresh = false) {
    const now = Date.now();

    if (!forceRefresh && (now - this.metricsCache.lastUpdated) < this.cacheTimeout) {
      return { ...this.metricsCache };
    }

    const avgResponseTime = this.calculateAverageResponseTime();
    const requestsPerMinute = this.calculateRequestsPerMinute();

    this.metricsCache = {
      avgResponseTime,
      requestsPerMinute,
      lastUpdated: now
    };

    return { ...this.metricsCache };
  }

  getDetailedStats() {
    const now = Date.now();
    const metrics = this.getMetrics(true);

    const stats = {
      current: metrics,
      timeWindows: {
        lastMinute: {
          avgResponseTime: this.calculateAverageResponseTime(60000),
          requestsPerMinute: this.calculateRequestsPerMinute(1)
        },
        last5Minutes: {
          avgResponseTime: this.calculateAverageResponseTime(300000),
          requestsPerMinute: this.calculateRequestsPerMinute(5)
        },
        last15Minutes: {
          avgResponseTime: this.calculateAverageResponseTime(900000),
          requestsPerMinute: this.calculateRequestsPerMinute(15)
        }
      },
      requestHistory: {
        totalRequests: this.requestHistory.length,
        oldestRequest: this.requestHistory.length > 0 ? this.requestHistory[0].timestamp : null,
        newestRequest: this.requestHistory.length > 0 ? this.requestHistory[this.requestHistory.length - 1].timestamp : null
      },
      buckets: {
        activeBuckets: this.requestBuckets.size,
        totalRequestsInBuckets: Array.from(this.requestBuckets.values()).reduce((sum, count) => sum + count, 0)
      }
    };

    if (this.requestHistory.length >= 10) {
      const recentDurations = this.requestHistory
        .filter(req => (now - req.timestamp) < 300000)
        .map(req => req.duration)
        .sort((a, b) => a - b);

      if (recentDurations.length > 0) {
        stats.responseTimePercentiles = {
          p50: this.calculatePercentile(recentDurations, 0.5),
          p90: this.calculatePercentile(recentDurations, 0.9),
          p95: this.calculatePercentile(recentDurations, 0.95),
          p99: this.calculatePercentile(recentDurations, 0.99)
        };
      }
    }

    return stats;
  }

  calculatePercentile(sortedArray, percentile) {
    if (sortedArray.length === 0) return 0;

    const index = Math.ceil(sortedArray.length * percentile) - 1;
    return sortedArray[Math.max(0, Math.min(index, sortedArray.length - 1))];
  }

  invalidateCache() {
    this.metricsCache.lastUpdated = 0;
  }

  reset() {
    this.requestHistory = [];
    this.requestBuckets.clear();
    this.invalidateCache();
    logger.info('Performance statistics reset');
  }

  getServiceHealth() {
    return {
      status: 'healthy',
      requestHistorySize: this.requestHistory.length,
      activeBuckets: this.requestBuckets.size,
      cacheAge: Date.now() - this.metricsCache.lastUpdated,
      memoryUsage: {
        requestHistory: this.requestHistory.length * 50,
        buckets: this.requestBuckets.size * 20
      }
    };
  }
}

const performanceStatsService = new PerformanceStatsService();

module.exports = {
  PerformanceStatsService,
  performanceStatsService
};
