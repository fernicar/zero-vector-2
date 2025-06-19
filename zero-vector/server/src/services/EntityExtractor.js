const { v4: uuidv4 } = require('uuid');
const { logger, logError } = require('../utils/logger');

class EntityExtractor {
  constructor(embeddingService) {
    this.embeddingService = embeddingService;

    this.entityTypes = {
      PERSON: 'PERSON',
      CONCEPT: 'CONCEPT',
      EVENT: 'EVENT',
      OBJECT: 'OBJECT',
      PLACE: 'PLACE'
    };

    this.initializePatterns();
  }

  initializePatterns() {
    this.patterns = {
      PERSON: [
        /(?:(?:Mr|Mrs|Ms|Dr|Prof|Professor|Captain|President|CEO|Director|Manager)\.?\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g,
        /(?:named|called|person named|someone named|user named)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/gi,
        /([a-zA-Z][a-zA-Z0-9._-]*[a-zA-Z])@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
        /@([a-zA-Z0-9_]+)/g
      ],

      CONCEPT: [
        /"([^"]+)"/g,
        /(?:concept of|idea of|principle of|theory of|approach of|method of|technique of|strategy of)\s+([a-zA-Z\s]+?)(?:\s|$|\.|\,)/gi,
        /\b(JavaScript|Python|React|Node\.js|TypeScript|Java|C\+\+|Swift|Kotlin|Ruby|PHP|Go|Rust|SQL|NoSQL|MongoDB|PostgreSQL|MySQL|Redis|Docker|Kubernetes|AWS|Azure|GCP|API|REST|GraphQL|JSON|XML|HTML|CSS|Git|GitHub|Linux|Windows|macOS|iOS|Android)\b/gi,
        /\b(machine learning|artificial intelligence|deep learning|neural network|algorithm|database|software|hardware|cloud computing|cybersecurity|blockchain|cryptocurrency|data science|analytics|visualization|automation|optimization|scalability|performance|efficiency|productivity|innovation|strategy|management|leadership|marketing|sales|finance|operations)\b/gi
      ],

      EVENT: [
        /(?:meeting|conference|workshop|seminar|presentation|session|call|interview|discussion)\s+(?:about|on|regarding)\s+([^.!?]+)/gi,
        /(?:on|at|during|in)\s+((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4})/gi,
        /(?:yesterday|today|tomorrow|last\s+week|next\s+week|this\s+week|last\s+month|next\s+month|this\s+month)\s+([^.!?]+)/gi,
        /(?:happened|occurred|took place|scheduled|planned|organized|executed|completed|finished|started|began|initiated)\s+([^.!?]+)/gi
      ],

      OBJECT: [
        /([a-zA-Z0-9_-]+\.(?:js|ts|py|java|cpp|c|h|html|css|json|xml|txt|pdf|doc|docx|xls|xlsx|ppt|pptx|zip|tar|gz))/gi,
        /(?:using|with|via|through|in)\s+((?:[A-Z][a-zA-Z0-9]*\s*)+)(?:\s|$|\.|\,)/g,
        /\b([A-Z][a-zA-Z0-9]*(?:\s+[A-Z][a-zA-Z0-9]*)*)\s+(?:application|app|software|tool|system|platform|service|product)\b/gi,
        /using\s+"([^"]+)"/gi
      ],

      PLACE: [
        /\b(?:in|at|from|to|located in|based in|headquarters in|office in)\s+([A-Z][a-zA-Z\s]+?),?\s+(?:[A-Z]{2}|[A-Z][a-zA-Z\s]+)(?:\s|$|\.|\,)/g,
        /\b([A-Z][a-zA-Z0-9&\s]+(?:Inc|LLC|Corp|Corporation|Ltd|Limited|Company|Co|Group|Systems|Technologies|Solutions|Services|Consulting)\.?)\b/g,
        /\b((?:University of|[A-Z][a-zA-Z\s]+University|[A-Z][a-zA-Z\s]+College|[A-Z][a-zA-Z\s]+Institute|[A-Z][a-zA-Z\s]+School))\b/g,
        /https?:\/\/(?:www\.)?([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g
      ]
    };
  }

  async extractEntities(text, personaId, vectorId = null) {
    try {
      logger.info('Starting entity extraction', {
        personaId,
        textLength: text.length,
        vectorId
      });

      const entities = [];
      const extractedNames = new Set();

      for (const [entityType, patterns] of Object.entries(this.patterns)) {
        for (const pattern of patterns) {
          const matches = [...text.matchAll(pattern)];

          for (const match of matches) {
            let entityName = this.cleanEntityName(match[1] || match[0], entityType);

            if (entityName && this.isValidEntity(entityName, entityType)) {
              const entityKey = `${entityType}:${entityName.toLowerCase()}`;

              if (!extractedNames.has(entityKey)) {
                extractedNames.add(entityKey);

                const entity = {
                  id: uuidv4(),
                  personaId,
                  vectorId,
                  type: entityType,
                  name: entityName,
                  confidence: this.calculateConfidence(entityName, entityType, match),
                  properties: {
                    extractedFrom: 'pattern_matching',
                    originalMatch: match[0],
                    matchIndex: match.index,
                    context: this.extractContext(text, match.index, match[0].length)
                  }
                };

                entities.push(entity);
              }
            }
          }
        }
      }

      entities.sort((a, b) => b.confidence - a.confidence);
      const maxEntities = 20;
      const finalEntities = entities.slice(0, maxEntities);

      logger.info('Entity extraction completed', {
        personaId,
        totalEntities: finalEntities.length,
        entityTypes: this.groupEntitiesByType(finalEntities)
      });

      return finalEntities;

    } catch (error) {
      logError(error, {
        operation: 'extractEntities',
        personaId,
        textLength: text?.length
      });
      return [];
    }
  }

  cleanEntityName(name, entityType) {
    if (!name || typeof name !== 'string') return null;

    name = name.trim()
      .replace(/\s+/g, ' ')
      .replace(/[^\w\s.-]/g, '')
      .trim();

    switch (entityType) {
      case this.entityTypes.PERSON:
        name = name.replace(/^(the|an|a)\s+/i, '');
        name = name.split(' ').map(word =>
          word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
        ).join(' ');
        break;

      case this.entityTypes.CONCEPT:
        name = name.toLowerCase().split(' ').map(word =>
          word.charAt(0).toUpperCase() + word.slice(1)
        ).join(' ');
        break;

      case this.entityTypes.PLACE:
        name = name.split(' ').map(word =>
          word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
        ).join(' ');
        break;

      case this.entityTypes.OBJECT:
        break;

      case this.entityTypes.EVENT:
        name = name.toLowerCase();
        break;
    }

    return name;
  }

  isValidEntity(name, entityType) {
    if (!name || name.length < 2) return false;
    if (name.length > 100) return false;

    const commonWords = new Set([
      'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
      'by', 'from', 'up', 'about', 'into', 'through', 'during', 'before',
      'after', 'above', 'below', 'between', 'among', 'this', 'that', 'these',
      'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her',
      'us', 'them', 'my', 'your', 'his', 'her', 'its', 'our', 'their', 'mine',
      'yours', 'hers', 'ours', 'theirs', 'am', 'is', 'are', 'was', 'were',
      'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
      'would', 'could', 'should', 'may', 'might', 'must', 'can', 'not', 'no',
      'yes', 'very', 'too', 'so', 'just', 'now', 'here', 'there', 'where',
      'when', 'why', 'how', 'what', 'who', 'which', 'whose', 'whom'
    ]);

    const lowerName = name.toLowerCase();

    if (commonWords.has(lowerName)) return false;

    if (name.length === 1) return false;

    if (/^\d+$/.test(name)) return false;

    switch (entityType) {
      case this.entityTypes.PERSON:
        if (!/^[A-Z]/.test(name)) return false;
        if (name.split(' ').length === 1 && commonWords.has(lowerName)) return false;
        break;

      case this.entityTypes.PLACE:
        if (!/^[A-Z]/.test(name)) return false;
        break;

      case this.entityTypes.CONCEPT:
        if (name.length < 3) return false;
        break;

      case this.entityTypes.OBJECT:
        break;

      case this.entityTypes.EVENT:
        if (name.length < 5) return false;
        break;
    }

    return true;
  }

  calculateConfidence(name, entityType, match) {
    let confidence = 0.5;

    if (name.length >= 3 && name.length <= 50) confidence += 0.1;
    if (name.split(' ').length > 1) confidence += 0.1;

    switch (entityType) {
      case this.entityTypes.PERSON:
        if (/^[A-Z][a-z]+(\s[A-Z][a-z]+)+$/.test(name)) confidence += 0.2;
        if (/^[A-Z][a-z]+\s[A-Z][a-z]+$/.test(name)) confidence += 0.1;
        break;

      case this.entityTypes.CONCEPT:
        if (match[0].includes('"')) confidence += 0.2;
        if (/\b(API|SDK|framework|library|database|algorithm|protocol)\b/i.test(name)) confidence += 0.15;
        break;

      case this.entityTypes.PLACE:
        if (/\b(Inc|LLC|Corp|Corporation|Ltd|Limited|Company|Co|Group)\b/i.test(name)) confidence += 0.2;
        if (/\b(University|College|Institute|School|City|State|Country)\b/i.test(name)) confidence += 0.15;
        break;

      case this.entityTypes.OBJECT:
        if (/\.[a-zA-Z]{2,4}$/.test(name)) confidence += 0.3;
        break;

      case this.entityTypes.EVENT:
        if (/\b(January|February|March|April|May|June|July|August|September|October|November|December|\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2})\b/i.test(match[0])) {
          confidence += 0.2;
        }
        break;
    }

    const contextIndicators = [
      'named', 'called', 'using', 'with', 'about', 'regarding', 'concerning',
      'meeting', 'discussion', 'project', 'system', 'application', 'service'
    ];

    for (const indicator of contextIndicators) {
      if (match[0].toLowerCase().includes(indicator)) {
        confidence += 0.05;
        break;
      }
    }

    return Math.min(Math.max(confidence, 0.1), 1.0);
  }

  extractContext(text, matchIndex, matchLength, contextLength = 100) {
    const start = Math.max(0, matchIndex - contextLength);
    const end = Math.min(text.length, matchIndex + matchLength + contextLength);

    let context = text.substring(start, end);

    if (start > 0) context = '...' + context;
    if (end < text.length) context = context + '...';

    return context;
  }

  groupEntitiesByType(entities) {
    const grouped = {};
    for (const entity of entities) {
      if (!grouped[entity.type]) grouped[entity.type] = 0;
      grouped[entity.type]++;
    }
    return grouped;
  }

  async findEntityRelationships(entities, originalText) {
    try {
      const relationships = [];

      for (let i = 0; i < entities.length; i++) {
        for (let j = i + 1; j < entities.length; j++) {
          const entity1 = entities[i];
          const entity2 = entities[j];

          if (entity1.name === entity2.name) continue;

          const relationship = this.detectRelationship(entity1, entity2, originalText);
          if (relationship) {
            relationships.push({
              id: uuidv4(),
              personaId: entity1.personaId,
              sourceEntityId: entity1.id,
              targetEntityId: entity2.id,
              relationshipType: relationship.type,
              strength: relationship.strength,
              context: relationship.context,
              properties: {
                extractedFrom: 'pattern_matching',
                confidence: relationship.strength
              }
            });
          }
        }
      }

      logger.info('Relationship extraction completed', {
        totalRelationships: relationships.length
      });

      return relationships;

    } catch (error) {
      logError(error, {
        operation: 'findEntityRelationships',
        entityCount: entities?.length
      });
      return [];
    }
  }

  detectRelationship(entity1, entity2, text) {
    const name1 = entity1.name.toLowerCase();
    const name2 = entity2.name.toLowerCase();

    const regex1 = new RegExp(`\\b${name1.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    const regex2 = new RegExp(`\\b${name2.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');

    const matches1 = [...text.matchAll(regex1)];
    const matches2 = [...text.matchAll(regex2)];

    let closestDistance = Infinity;
    let bestContext = '';

    for (const match1 of matches1) {
      for (const match2 of matches2) {
        const distance = Math.abs(match1.index - match2.index);
        if (distance < closestDistance) {
          closestDistance = distance;
          const start = Math.min(match1.index, match2.index);
          const end = Math.max(match1.index + match1[0].length, match2.index + match2[0].length);
          bestContext = text.substring(start, end);
        }
      }
    }

    if (closestDistance > 200) return null;

    let relationshipType = 'MENTIONS';
    let strength = 0.3;

    if (entity1.type === 'PERSON' && entity2.type === 'PERSON') {
      relationshipType = 'KNOWS';
      strength = 0.6;
    } else if (entity1.type === 'PERSON' && entity2.type === 'CONCEPT') {
      relationshipType = 'WORKS_WITH';
      strength = 0.7;
    } else if (entity1.type === 'PERSON' && entity2.type === 'PLACE') {
      relationshipType = 'LOCATED_AT';
      strength = 0.5;
    } else if (entity1.type === 'CONCEPT' && entity2.type === 'OBJECT') {
      relationshipType = 'IMPLEMENTED_IN';
      strength = 0.8;
    } else if (entity1.type === 'EVENT' && entity2.type === 'PERSON') {
      relationshipType = 'INVOLVES';
      strength = 0.7;
    }

    const contextLower = bestContext.toLowerCase();
    if (contextLower.includes(' and ') || contextLower.includes(' with ')) {
      strength += 0.1;
    }
    if (contextLower.includes(' uses ') || contextLower.includes(' using ')) {
      relationshipType = 'USES';
      strength += 0.2;
    }
    if (contextLower.includes(' works ') || contextLower.includes(' working ')) {
      relationshipType = 'WORKS_WITH';
      strength += 0.1;
    }

    if (closestDistance < 50) strength += 0.1;
    if (closestDistance < 20) strength += 0.1;

    strength = Math.min(Math.max(strength, 0.1), 1.0);

    return {
      type: relationshipType,
      strength,
      context: bestContext
    };
  }
}

module.exports = EntityExtractor;
