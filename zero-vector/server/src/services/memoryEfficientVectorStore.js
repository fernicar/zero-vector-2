const VectorSimilarity = require('../utils/vectorSimilarity');
const { logVectorOperation, logMemoryUsage, logError } = require('../utils/logger');

class MemoryEfficientVectorStore {
  constructor(maxMemoryMB = 2048, dimensions = 1536) {
    this.maxMemoryBytes = maxMemoryMB * 1024 * 1024;
    this.dimensions = dimensions;
    this.vectorSize = dimensions * 4;
    this.maxVectors = Math.floor(this.maxMemoryBytes / this.vectorSize);

    this.buffer = new ArrayBuffer(this.maxMemoryBytes);
    this.vectors = new Float32Array(this.buffer);

    this.metadata = new Map();
    this.freeSlots = [];
    this.nextSlot = 0;
    this.vectorCount = 0;

    this.similarity = new VectorSimilarity();

    this.stats = {
      insertions: 0,
      deletions: 0,
      searches: 0,
      lastCleanup: Date.now()
    };

    console.log(`Initialized VectorStore: ${maxMemoryMB}MB, ${this.maxVectors} max vectors, ${dimensions}D`);
  }

  addVector(vector, id, metadata = {}) {
    const startTime = Date.now();

    try {
      this.validateVector(vector, id);

      if (this.metadata.has(id)) {
        throw new Error(`Vector with id '${id}' already exists`);
      }

      const slotIndex = this.allocateSlot();

      const vectorArray = vector instanceof Float32Array ? vector : new Float32Array(vector);

      const startIndex = slotIndex * this.dimensions;
      for (let i = 0; i < this.dimensions; i++) {
        this.vectors[startIndex + i] = vectorArray[i];
      }

      this.metadata.set(id, {
        slotIndex,
        dimensions: this.dimensions,
        timestamp: Date.now(),
        ...metadata
      });

      this.vectorCount++;
      this.stats.insertions++;

      const duration = Date.now() - startTime;
      logVectorOperation('insert', 1, this.dimensions, duration, { id, slotIndex });

      return {
        id,
        slotIndex,
        success: true
      };

    } catch (error) {
      logError(error, { operation: 'addVector', id, vectorLength: vector?.length });
      throw error;
    }
  }

  getVector(id, includeMetadata = false) {
    const vectorMeta = this.metadata.get(id);
    if (!vectorMeta) {
      return null;
    }

    const startIndex = vectorMeta.slotIndex * this.dimensions;
    const endIndex = startIndex + this.dimensions;
    const vector = this.vectors.slice(startIndex, endIndex);

    if (includeMetadata) {
      return {
        id,
        vector,
        metadata: vectorMeta
      };
    }

    return vector;
  }

  deleteVector(id) {
    const vectorMeta = this.metadata.get(id);
    if (!vectorMeta) {
      return false;
    }

    this.freeSlots.push(vectorMeta.slotIndex);

    const startIndex = vectorMeta.slotIndex * this.dimensions;
    for (let i = 0; i < this.dimensions; i++) {
      this.vectors[startIndex + i] = 0;
    }

    this.metadata.delete(id);

    this.similarity.magnitudeCache.delete(id);

    this.vectorCount--;
    this.stats.deletions++;

    logVectorOperation('delete', 1, this.dimensions, 0, { id });

    return true;
  }

  updateVector(id, vector, metadata = {}) {
    const existingMeta = this.metadata.get(id);
    if (!existingMeta) {
      throw new Error(`Vector with id '${id}' not found`);
    }

    this.validateVector(vector, id);

    const vectorArray = vector instanceof Float32Array ? vector : new Float32Array(vector);
    const startIndex = existingMeta.slotIndex * this.dimensions;

    for (let i = 0; i < this.dimensions; i++) {
      this.vectors[startIndex + i] = vectorArray[i];
    }

    this.metadata.set(id, {
      ...existingMeta,
      ...metadata,
      updatedAt: Date.now()
    });

    this.similarity.magnitudeCache.delete(id);

    logVectorOperation('update', 1, this.dimensions, 0, { id });

    return true;
  }

  search(queryVector, options = {}) {
    const startTime = Date.now();

    try {
      const {
        limit = 10,
        threshold = 0.0,
        metric = 'cosine',
        filters = {},
        includeValues = false
      } = options;

      this.validateVector(queryVector, 'query');

      const queryArray = queryVector instanceof Float32Array ? queryVector : new Float32Array(queryVector);
      const results = [];

      for (const [id, meta] of this.metadata) {
        if (!this.matchesFilters(meta, filters)) {
          continue;
        }

        const vector = this.getVector(id);
        const similarity = this.similarity.calculateSimilarity(
          queryArray,
          vector,
          metric,
          'query',
          id
        );

        if (similarity >= threshold) {
          const result = {
            id,
            similarity,
            metadata: { ...meta }
          };

          if (includeValues) {
            result.vector = Array.from(vector);
          }

          results.push(result);
        }
      }

      results.sort((a, b) => b.similarity - a.similarity);

      const limitedResults = results.slice(0, limit);

      this.stats.searches++;
      const duration = Date.now() - startTime;

      logVectorOperation('search', limitedResults.length, this.dimensions, duration, {
        queryDimensions: queryVector.length,
        totalCandidates: this.vectorCount,
        threshold,
        metric
      });

      return limitedResults;

    } catch (error) {
      logError(error, { operation: 'search', queryLength: queryVector?.length });
      throw error;
    }
  }

  batchInsert(vectors) {
    const startTime = Date.now();
    const results = [];
    const errors = [];

    for (const vectorData of vectors) {
      try {
        const { id, vector, metadata = {} } = vectorData;
        const result = this.addVector(vector, id, metadata);
        results.push(result);
      } catch (error) {
        errors.push({
          id: vectorData.id,
          error: error.message
        });
      }
    }

    const duration = Date.now() - startTime;
    logVectorOperation('batch_insert', results.length, this.dimensions, duration, {
      totalAttempted: vectors.length,
      errors: errors.length
    });

    return {
      successful: results,
      errors: errors,
      summary: {
        total: vectors.length,
        successful: results.length,
        failed: errors.length
      }
    };
  }

  getAllIds(filters = {}) {
    const ids = [];

    for (const [id, meta] of this.metadata) {
      if (this.matchesFilters(meta, filters)) {
        ids.push(id);
      }
    }

    return ids;
  }

  getStats() {
    const usedSlots = this.vectorCount;
    const usedMemory = usedSlots * this.vectorSize;
    const similarityStats = this.similarity.getCacheStats();

    const stats = {
      totalMemory: this.maxMemoryBytes,
      usedMemory,
      freeMemory: this.maxMemoryBytes - usedMemory,
      memoryUtilization: (usedMemory / this.maxMemoryBytes) * 100,

      vectorCount: this.vectorCount,
      maxVectors: this.maxVectors,
      dimensions: this.dimensions,
      freeSlots: this.freeSlots.length,

      operations: { ...this.stats },
      similarityCache: similarityStats,

      uptime: Date.now() - (this.stats.lastCleanup || Date.now())
    };

    logMemoryUsage(stats);

    return stats;
  }

  cleanup() {
    const startTime = Date.now();

    this.similarity.cleanupCache(10000);

    if (this.freeSlots.length > 1000) {
      this.freeSlots.sort((a, b) => a - b);
    }

    this.stats.lastCleanup = Date.now();

    const duration = Date.now() - startTime;
    logVectorOperation('cleanup', 0, 0, duration);
  }

  validateVector(vector, id) {
    if (!vector || !Array.isArray(vector) && !(vector instanceof Float32Array)) {
      throw new Error(`Invalid vector format for ${id}`);
    }

    if (vector.length !== this.dimensions) {
      throw new Error(`Vector ${id} has ${vector.length} dimensions, expected ${this.dimensions}`);
    }

    for (let i = 0; i < vector.length; i++) {
      if (!isFinite(vector[i])) {
        throw new Error(`Vector ${id} contains invalid value at index ${i}: ${vector[i]}`);
      }
    }
  }

  allocateSlot() {
    let slotIndex;

    if (this.freeSlots.length > 0) {
      slotIndex = this.freeSlots.pop();
    } else if (this.nextSlot < this.maxVectors) {
      slotIndex = this.nextSlot++;
    } else {
      throw new Error(`Vector store is full. Maximum capacity: ${this.maxVectors} vectors`);
    }

    return slotIndex;
  }

  matchesFilters(metadata, filters) {
    for (const [key, value] of Object.entries(filters)) {
      if (key === 'timestamp') {
        if (typeof value === 'object' && value !== null) {
          if (value.$gte && metadata.timestamp < value.$gte) return false;
          if (value.$lte && metadata.timestamp > value.$lte) return false;
          if (value.$lt && metadata.timestamp >= value.$lt) return false;
          if (value.$gt && metadata.timestamp <= value.$gt) return false;
        } else {
          if (metadata.timestamp !== value) return false;
        }
      } else {
        if (metadata[key] !== value) return false;
      }
    }
    return true;
  }
}

module.exports = MemoryEfficientVectorStore;
