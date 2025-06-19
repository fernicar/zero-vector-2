const VectorSimilarity = require('../utils/vectorSimilarity');

class HNSWIndex {
  constructor(options = {}) {
    this.M = options.M || 16;
    this.maxM = this.M;
    this.maxM0 = this.M * 2;
    this.ml = 1.0 / Math.log(2.0);
    this.efConstruction = options.efConstruction || 200;
    this.efSearch = options.efSearch || 50;
    this.distanceFunction = options.distanceFunction || 'cosine';

    this.layers = new Map();
    this.nodes = new Map();
    this.entryPoint = null;
    this.nodeCount = 0;

    this.similarity = new VectorSimilarity();

    this.stats = {
      searchCount: 0,
      insertCount: 0,
      totalSearchTime: 0,
      avgSearchTime: 0,
      layerDistribution: new Map()
    };

    console.log(`HNSW Index initialized: M=${this.M}, efConstruction=${this.efConstruction}, efSearch=${this.efSearch}`);
  }

  insert(vector, id, metadata = {}) {
    const startTime = Date.now();

    try {
      const level = this.generateLevel();

      const node = {
        id,
        vector: new Float32Array(vector),
        level,
        metadata,
        insertTime: Date.now()
      };

      this.nodes.set(id, node);

      for (let lc = 0; lc <= level; lc++) {
        if (!this.layers.has(lc)) {
          this.layers.set(lc, new Map());
        }
        this.layers.get(lc).set(id, new Set());
      }

      if (this.entryPoint === null) {
        this.entryPoint = { id, level };
        this.nodeCount++;
        this.stats.insertCount++;
        return true;
      }

      let currentClosest = [this.entryPoint.id];

      for (let lc = this.entryPoint.level; lc > level; lc--) {
        currentClosest = this.searchLayer(vector, currentClosest, 1, lc);
      }

      for (let lc = Math.min(level, this.entryPoint.level); lc >= 0; lc--) {
        const candidates = this.searchLayer(vector, currentClosest, this.efConstruction, lc);

        const selectedNeighbors = this.selectNeighbors(
          vector,
          candidates,
          lc === 0 ? this.maxM0 : this.maxM
        );

        for (const neighborId of selectedNeighbors) {
          this.addConnection(id, neighborId, lc);
          this.addConnection(neighborId, id, lc);

          this.pruneConnections(neighborId, lc);
        }

        currentClosest = selectedNeighbors;
      }

      if (level > this.entryPoint.level) {
        this.entryPoint = { id, level };
      }

      this.nodeCount++;
      this.stats.insertCount++;

      if (!this.stats.layerDistribution.has(level)) {
        this.stats.layerDistribution.set(level, 0);
      }
      this.stats.layerDistribution.set(level, this.stats.layerDistribution.get(level) + 1);

      const duration = Date.now() - startTime;
      return { success: true, level, duration };

    } catch (error) {
      throw new Error(`Failed to insert vector ${id}: ${error.message}`);
    }
  }

  search(queryVector, k = 10, ef = null) {
    const startTime = Date.now();

    if (this.entryPoint === null || this.nodeCount === 0) {
      return [];
    }

    const searchEf = ef || Math.max(k, this.efSearch);

    try {
      let currentClosest = [this.entryPoint.id];

      for (let lc = this.entryPoint.level; lc > 0; lc--) {
        currentClosest = this.searchLayer(queryVector, currentClosest, 1, lc);
      }

      const candidates = this.searchLayer(queryVector, currentClosest, searchEf, 0);

      const results = candidates.slice(0, k).map(nodeId => {
        const node = this.nodes.get(nodeId);
        const similarity = this.calculateDistance(queryVector, node.vector);

        return {
          id: nodeId,
          similarity: this.distanceFunction === 'cosine' ? similarity : 1 / (1 + similarity),
          metadata: node.metadata,
          level: node.level
        };
      });

      this.stats.searchCount++;
      const duration = Date.now() - startTime;
      this.stats.totalSearchTime += duration;
      this.stats.avgSearchTime = this.stats.totalSearchTime / this.stats.searchCount;

      return results;

    } catch (error) {
      throw new Error(`HNSW search failed: ${error.message}`);
    }
  }

  searchLayer(queryVector, entryPoints, numClosest, layer) {
    const visited = new Set();
    const candidates = [];
    const dynamic = [];

    for (const nodeId of entryPoints) {
      const distance = this.calculateDistance(queryVector, this.nodes.get(nodeId).vector);

      candidates.push({ id: nodeId, distance });
      dynamic.push({ id: nodeId, distance });
      visited.add(nodeId);
    }

    candidates.sort((a, b) => a.distance - b.distance);
    dynamic.sort((a, b) => b.distance - a.distance);

    while (candidates.length > 0) {
      const current = candidates.shift();

      if (dynamic.length >= numClosest && current.distance > dynamic[0].distance) {
        break;
      }

      const connections = this.layers.get(layer)?.get(current.id) || new Set();

      for (const neighborId of connections) {
        if (!visited.has(neighborId)) {
          visited.add(neighborId);

          const distance = this.calculateDistance(queryVector, this.nodes.get(neighborId).vector);

          if (dynamic.length < numClosest || distance < dynamic[0].distance) {
            candidates.push({ id: neighborId, distance });
            dynamic.push({ id: neighborId, distance });

            candidates.sort((a, b) => a.distance - b.distance);
            dynamic.sort((a, b) => b.distance - a.distance);

            if (dynamic.length > numClosest) {
              dynamic.shift();
            }
          }
        }
      }
    }

    return dynamic.reverse().map(item => item.id);
  }

  selectNeighbors(queryVector, candidates, maxConnections) {
    const candidateDistances = candidates.map(nodeId => ({
      id: nodeId,
      distance: this.calculateDistance(queryVector, this.nodes.get(nodeId).vector)
    }));

    candidateDistances.sort((a, b) => a.distance - b.distance);

    return candidateDistances.slice(0, maxConnections).map(item => item.id);
  }

  addConnection(nodeId1, nodeId2, layer) {
    if (!this.layers.has(layer)) {
      this.layers.set(layer, new Map());
    }

    const layerGraph = this.layers.get(layer);

    if (!layerGraph.has(nodeId1)) {
      layerGraph.set(nodeId1, new Set());
    }

    layerGraph.get(nodeId1).add(nodeId2);
  }

  pruneConnections(nodeId, layer) {
    const connections = this.layers.get(layer)?.get(nodeId);
    if (!connections) return;

    const maxConnections = layer === 0 ? this.maxM0 : this.maxM;

    if (connections.size <= maxConnections) return;

    const nodeVector = this.nodes.get(nodeId).vector;

    const connectionDistances = Array.from(connections).map(connectedId => ({
      id: connectedId,
      distance: this.calculateDistance(nodeVector, this.nodes.get(connectedId).vector)
    }));

    connectionDistances.sort((a, b) => a.distance - b.distance);
    const keepConnections = connectionDistances.slice(0, maxConnections);

    const newConnections = new Set(keepConnections.map(item => item.id));
    this.layers.get(layer).set(nodeId, newConnections);

    const prunedConnections = connectionDistances.slice(maxConnections);
    for (const pruned of prunedConnections) {
      const prunedConnections = this.layers.get(layer)?.get(pruned.id);
      if (prunedConnections) {
        prunedConnections.delete(nodeId);
      }
    }
  }

  generateLevel() {
    let level = 0;
    while (Math.random() < 0.5 && level < 16) {
      level++;
    }
    return level;
  }

  calculateDistance(vectorA, vectorB) {
    switch (this.distanceFunction) {
      case 'cosine':
        return 1 - this.similarity.cosineSimilarity(vectorA, vectorB);
      case 'euclidean':
        return this.similarity.euclideanDistance(vectorA, vectorB);
      case 'dot':
        return -this.similarity.dotProduct(vectorA, vectorB);
      default:
        return 1 - this.similarity.cosineSimilarity(vectorA, vectorB);
    }
  }

  remove(nodeId) {
    const node = this.nodes.get(nodeId);
    if (!node) return false;

    for (let layer = 0; layer <= node.level; layer++) {
      const connections = this.layers.get(layer)?.get(nodeId) || new Set();

      for (const connectedId of connections) {
        const connectedConnections = this.layers.get(layer)?.get(connectedId);
        if (connectedConnections) {
          connectedConnections.delete(nodeId);
        }
      }

      this.layers.get(layer)?.delete(nodeId);
    }

    this.nodes.delete(nodeId);
    this.nodeCount--;

    if (this.entryPoint && this.entryPoint.id === nodeId) {
      this.findNewEntryPoint();
    }

    return true;
  }

  findNewEntryPoint() {
    let newEntryPoint = null;
    let maxLevel = -1;

    for (const [nodeId, node] of this.nodes) {
      if (node.level > maxLevel) {
        maxLevel = node.level;
        newEntryPoint = { id: nodeId, level: node.level };
      }
    }

    this.entryPoint = newEntryPoint;
  }

  getStats() {
    const layerCounts = {};
    for (const [level, count] of this.stats.layerDistribution) {
      layerCounts[level] = count;
    }

    return {
      nodeCount: this.nodeCount,
      layerCount: this.layers.size,
      entryPointLevel: this.entryPoint?.level || 0,
      parameters: {
        M: this.M,
        maxM0: this.maxM0,
        efConstruction: this.efConstruction,
        efSearch: this.efSearch,
        distanceFunction: this.distanceFunction
      },
      performance: {
        searchCount: this.stats.searchCount,
        insertCount: this.stats.insertCount,
        avgSearchTime: this.stats.avgSearchTime
      },
      layerDistribution: layerCounts
    };
  }

  clear() {
    this.layers.clear();
    this.nodes.clear();
    this.entryPoint = null;
    this.nodeCount = 0;
    this.stats = {
      searchCount: 0,
      insertCount: 0,
      totalSearchTime: 0,
      avgSearchTime: 0,
      layerDistribution: new Map()
    };
  }
}

module.exports = HNSWIndex;
