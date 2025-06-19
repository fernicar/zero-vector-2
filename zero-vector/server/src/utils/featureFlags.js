const config = require('../config');
const logger = require('./logger');

class FeatureFlags {
  constructor() {
    this.flags = {
      hybridSearch: this.getBooleanFlag('FEATURE_HYBRID_SEARCH', config.features.hybridSearch),
      entityExtraction: this.getBooleanFlag('FEATURE_ENTITY_EXTRACTION', config.features.entityExtraction),
      graphExpansion: this.getBooleanFlag('FEATURE_GRAPH_EXPANSION', config.features.graphExpansion),

      graphEnabled: this.getBooleanFlag('GRAPH_ENABLED', config.hybrid.graphEnabled),
      graphCacheEnabled: this.getBooleanFlag('GRAPH_CACHE_ENABLED', config.hybrid.performance.graphCacheEnabled),
      graphMetricsEnabled: this.getBooleanFlag('ENABLE_GRAPH_METRICS', config.hybrid.performance.enableGraphMetrics),

      relationshipInference: this.getBooleanFlag('FEATURE_RELATIONSHIP_INFERENCE', config.features.relationshipInference),
      crossPersonaSharing: this.getBooleanFlag('FEATURE_CROSS_PERSONA_SHARING', config.features.crossPersonaSharing),
      temporalRelationships: this.getBooleanFlag('FEATURE_TEMPORAL_RELATIONSHIPS', config.features.temporalRelationships),

      adaptiveIndexing: this.getBooleanFlag('FEATURE_ADAPTIVE_INDEXING', config.features.adaptiveIndexing),
      vectorCompression: this.getBooleanFlag('FEATURE_VECTOR_COMPRESSION', config.features.vectorCompression),
      intelligentCaching: this.getBooleanFlag('FEATURE_INTELLIGENT_CACHING', config.features.intelligentCaching)
    };

    this.runtimeOverrides = new Map();

    this.logCurrentFlags();
  }

  getBooleanFlag(envVar, defaultValue) {
    const value = process.env[envVar];
    if (value === undefined) {
      return defaultValue;
    }
    return value.toLowerCase() === 'true';
  }

  isEnabled(flagName) {
    if (this.runtimeOverrides.has(flagName)) {
      const override = this.runtimeOverrides.get(flagName);
      logger.warn('Feature flag runtime override active', {
        flag: flagName,
        overrideValue: override.value,
        reason: override.reason,
        timestamp: override.timestamp
      });
      return override.value;
    }

    const isEnabled = this.flags[flagName];
    if (isEnabled === undefined) {
      logger.warn('Unknown feature flag requested', { flag: flagName });
      return false;
    }

    return isEnabled;
  }

  setRuntimeOverride(flagName, value, reason = 'Manual override') {
    const override = {
      value,
      reason,
      timestamp: new Date().toISOString(),
      originalValue: this.flags[flagName]
    };

    this.runtimeOverrides.set(flagName, override);

    logger.warn('Feature flag runtime override set', {
      flag: flagName,
      newValue: value,
      originalValue: override.originalValue,
      reason
    });

    return override;
  }

  removeRuntimeOverride(flagName) {
    const override = this.runtimeOverrides.get(flagName);
    if (override) {
      this.runtimeOverrides.delete(flagName);
      logger.info('Feature flag runtime override removed', {
        flag: flagName,
        restoredValue: this.flags[flagName]
      });
      return true;
    }
    return false;
  }

  getAllFlags() {
    const result = {};
    for (const [flagName, configValue] of Object.entries(this.flags)) {
      result[flagName] = {
        configured: configValue,
        active: this.isEnabled(flagName),
        hasOverride: this.runtimeOverrides.has(flagName)
      };
    }
    return result;
  }

  isHybridModeEnabled() {
    return this.isEnabled('graphEnabled') &&
           this.isEnabled('hybridSearch') &&
           this.isEnabled('entityExtraction');
  }

  isGraphExpansionAvailable() {
    return this.isHybridModeEnabled() && this.isEnabled('graphExpansion');
  }

  getSafeFallbackConfig() {
    return {
      useVector: true,
      useGraph: this.isEnabled('graphEnabled'),
      useHybridSearch: this.isEnabled('hybridSearch'),
      enableEntityExtraction: this.isEnabled('entityExtraction'),
      enableGraphExpansion: this.isEnabled('graphExpansion')
    };
  }

  emergencyRollback(reason = 'Emergency rollback initiated') {
    const rollbackFlags = [
      'hybridSearch',
      'entityExtraction',
      'graphExpansion',
      'graphEnabled'
    ];

    const rollbackTimestamp = new Date().toISOString();

    rollbackFlags.forEach(flag => {
      this.setRuntimeOverride(flag, false, `${reason} at ${rollbackTimestamp}`);
    });

    logger.error('Emergency rollback executed', {
      reason,
      timestamp: rollbackTimestamp,
      disabledFlags: rollbackFlags
    });

    return {
      timestamp: rollbackTimestamp,
      reason,
      disabledFlags: rollbackFlags,
      instruction: 'All Zero Vector 2.0 features disabled. System running in v1.0 compatibility mode.'
    };
  }

  isEnabledForRollout(flagName, rolloutPercentage = 100, userId = null) {
    if (!this.isEnabled(flagName)) {
      return false;
    }

    if (rolloutPercentage >= 100) {
      return true;
    }

    if (userId) {
      const hash = this.simpleHash(userId + flagName);
      return (hash % 100) < rolloutPercentage;
    }

    return Math.random() * 100 < rolloutPercentage;
  }

  simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  logCurrentFlags() {
    const enabledFlags = Object.entries(this.flags)
      .filter(([, value]) => value)
      .map(([name]) => name);

    const disabledFlags = Object.entries(this.flags)
      .filter(([, value]) => !value)
      .map(([name]) => name);

    logger.info('Feature flags initialized', {
      totalFlags: Object.keys(this.flags).length,
      enabledCount: enabledFlags.length,
      disabledCount: disabledFlags.length,
      enabledFlags,
      hybridModeEnabled: this.isHybridModeEnabled(),
      graphExpansionAvailable: this.isGraphExpansionAvailable()
    });
  }

  healthCheck() {
    const health = {
      status: 'healthy',
      checks: {
        configLoaded: Object.keys(this.flags).length > 0,
        hybridModeReady: this.isHybridModeEnabled(),
        runtimeOverridesActive: this.runtimeOverrides.size > 0,
        emergencyRollbackAvailable: true
      },
      details: {
        totalFlags: Object.keys(this.flags).length,
        enabledFlags: Object.entries(this.flags).filter(([, v]) => v).length,
        activeOverrides: this.runtimeOverrides.size,
        hybridModeEnabled: this.isHybridModeEnabled()
      }
    };

    if (this.runtimeOverrides.size > 0) {
      health.status = 'warning';
      health.warnings = ['Runtime overrides are active - check if emergency rollback was triggered'];
    }

    if (!health.checks.configLoaded) {
      health.status = 'error';
      health.errors = ['Feature flag configuration failed to load'];
    }

    return health;
  }
}

const featureFlags = new FeatureFlags();

module.exports = featureFlags;
