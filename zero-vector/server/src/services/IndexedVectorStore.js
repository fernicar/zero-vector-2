const MemoryEfficientVectorStore = require('.__LITERAL_0__algorithms__LITERAL_1__tils' });
          searchMethod = ' this.searchStats.hnswSearches;
        } catch (hnswError) {
          logError(hnswError, { operation: 'hnswSearch' });
          searchMethod = 'linear_fallback';
        }
      }
      if (results.length === 0 || searchMethod !== 'hnsw') {
        searchMethod = searchMethod === 'hnsw' ? 'linear_fallback' : 'linear';
        results = super.search(queryVector, options);
        this.searchStats.linearSearches++;
        const linearDuration = Date.now() - startTime;
        this.searchStats.linearTime += linearDuration;
        this.searchStats.avgLinearTime = this.searchStats.linearTime __LITERAL_3__${total} vectors...`);
          }
        } catch (error) {
          logError(error, { operation: 'rebuildIndex', id });
        }
      }
      const duration = Date.now() - startTime;
      console.log(`Index rebuild completed: ${indexed}__LITERAL_4__ this.searchStats.avgHnswTime).toFixed(2) + 'x'
          : 'N/A'
      }
    };
  }
  batchInsert(vectors) {
    const startTime = Date.now();
    const originalAutoIndex = this.autoIndex;
    this.autoIndex = false;
    try {
      const result = super.batchInsert(vectors);
      if (this.indexEnabled && result.successful.length > 0) {
        console.log(`Batch indexing ${result.successful.length} vectors...`);
        let indexed = 0;
        for (const successResult of result.successful) {
          try {
            const vectorData = vectors.find(v => v.id === successResult.id);
            if (vectorData) {
              this.hnswIndex.insert(vectorData.vector, successResult.id, vectorData.metadata || {});
              indexed++;
            }
          } catch (indexError) {
            logError(indexError, { operation: 'batchIndex', id: successResult.id });
          }
        }
        console.log(`Batch indexing completed: ${indexed}/${result.successful.length} vectors`);
      }
      this.autoIndex = originalAutoIndex;
      const duration = Date.now() - startTime;
      logVectorOperation(__LITERAL_15__, result.successful.length, this.dimensions, duration, {
        totalAttempted: vectors.length,
        indexed: this.indexEnabled
      });
      return result;
    } catch (error) {
      this.autoIndex = originalAutoIndex;
      throw error;
    }
  }
  hybridSearch(queryVector, options = {}) {
    const {
      limit = 10,
      threshold = 0.0,
      hnswCandidates = limit * 3,
      linearBackup = false,
      ...otherOptions
    } = options;
    let results = [];
    if (this.indexEnabled && this.hnswIndex.nodeCount >= this.indexThreshold) {
      const hnswResults = this.search(queryVector, {
        ...otherOptions,
        limit: hnswCandidates,
        threshold: threshold * 0.8,
        useIndex: true
      });
      results = hnswResults.slice(0, limit);
    }
    if (linearBackup && results.length < limit) {
      const linearResults = this.search(queryVector, {
        ...otherOptions,
        limit: limit - results.length,
        threshold,
        useIndex: false
      });
      const existingIds = new Set(results.map(r => r.id));
      const newResults = linearResults.filter(r => !existingIds.has(r.id));
      results = [...results, ...newResults];
    }
    return results;
  }
  cleanup() {
    super.cleanup();
    const indexStats = this.hnswIndex.getStats();
    console.log(`HNSW Index: ${indexStats.nodeCount} nodes, ${indexStats.layerCount} layers`);
  }
}
module.exports = IndexedVectorStore;
