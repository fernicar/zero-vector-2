class VectorSimilarity {
  constructor() {
    this.magnitudeCache = new Map();
    this.cacheHits = 0;
    this.cacheMisses = 0;
  }

  cosineSimilarity(vectorA, vectorB, idA = null, idB = null) {
    if (vectorA.length !== vectorB.length) {
      throw new Error('Vectors must have the same dimensions');
    }

    const dotProd = this.dotProduct(vectorA, vectorB);
    const magA = this.getMagnitude(vectorA, idA);
    const magB = this.getMagnitude(vectorB, idB);

    if (magA === 0 || magB === 0) {
      return 0;
    }

    return dotProd / (magA * magB);
  }

  euclideanDistance(vectorA, vectorB) {
    if (vectorA.length !== vectorB.length) {
      throw new Error('Vectors must have the same dimensions');
    }

    let sumSquaredDiffs = 0;
    for (let i = 0; i < vectorA.length; i++) {
      const diff = vectorA[i] - vectorB[i];
      sumSquaredDiffs += diff * diff;
    }

    return Math.sqrt(sumSquaredDiffs);
  }

  dotProduct(vectorA, vectorB) {
    if (vectorA.length !== vectorB.length) {
      throw new Error('Vectors must have the same dimensions');
    }

    let result = 0;

    if (vectorA instanceof Float32Array && vectorB instanceof Float32Array) {
      const len = vectorA.length;
      let i = 0;

      for (; i < len - 3; i += 4) {
        result += vectorA[i] * vectorB[i] +
                  vectorA[i + 1] * vectorB[i + 1] +
                  vectorA[i + 2] * vectorB[i + 2] +
                  vectorA[i + 3] * vectorB[i + 3];
      }

      for (; i < len; i++) {
        result += vectorA[i] * vectorB[i];
      }
    } else {
      for (let i = 0; i < vectorA.length; i++) {
        result += vectorA[i] * vectorB[i];
      }
    }

    return result;
  }

  getMagnitude(vector, id = null) {
    if (id !== null && this.magnitudeCache.has(id)) {
      this.cacheHits++;
      return this.magnitudeCache.get(id);
    }

    let magnitude;

    if (vector instanceof Float32Array) {
      let sumSquares = 0;
      for (let i = 0; i < vector.length; i++) {
        sumSquares += vector[i] * vector[i];
      }
      magnitude = Math.sqrt(sumSquares);
    } else {
      magnitude = Math.sqrt(
        vector.reduce((sum, val) => sum + val * val, 0)
      );
    }

    if (id !== null) {
      this.magnitudeCache.set(id, magnitude);
      this.cacheMisses++;
    }

    return magnitude;
  }

  calculateSimilarity(vectorA, vectorB, metric = 'cosine', idA = null, idB = null) {
    switch (metric.toLowerCase()) {
      case 'cosine':
        return this.cosineSimilarity(vectorA, vectorB, idA, idB);

      case 'euclidean':
        const distance = this.euclideanDistance(vectorA, vectorB);
        return 1 / (1 + distance);

      case 'dot':
        return this.dotProduct(vectorA, vectorB);

      default:
        throw new Error(`Unsupported similarity metric: ${metric}`);
    }
  }

  normalizeVector(vector) {
    const magnitude = this.getMagnitude(vector);

    if (magnitude === 0) {
      return new Float32Array(vector.length);
    }

    const normalized = new Float32Array(vector.length);
    for (let i = 0; i < vector.length; i++) {
      normalized[i] = vector[i] / magnitude;
    }

    return normalized;
  }

  batchSimilarity(queryVector, targetVectors, metric = 'cosine', queryId = null) {
    const results = [];

    for (let i = 0; i < targetVectors.length; i++) {
      const target = targetVectors[i];
      const similarity = this.calculateSimilarity(
        queryVector,
        target.vector,
        metric,
        queryId,
        target.id
      );

      results.push({
        id: target.id,
        similarity: similarity,
        metadata: target.metadata
      });
    }

    return results;
  }

  clearCache() {
    this.magnitudeCache.clear();
    this.cacheHits = 0;
    this.cacheMisses = 0;
  }

  getCacheStats() {
    const total = this.cacheHits + this.cacheMisses;
    return {
      size: this.magnitudeCache.size,
      hits: this.cacheHits,
      misses: this.cacheMisses,
      hitRate: total > 0 ? this.cacheHits / total : 0
    };
  }

  cleanupCache(maxSize = 10000) {
    if (this.magnitudeCache.size > maxSize) {
      const entries = Array.from(this.magnitudeCache.entries());

      const toRemove = Math.floor(entries.length / 2);
      for (let i = 0; i < toRemove; i++) {
        this.magnitudeCache.delete(entries[i][0]);
      }
    }
  }
}

module.exports = VectorSimilarity;
