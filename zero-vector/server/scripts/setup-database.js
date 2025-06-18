const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..__LITERAL_0__rc__LITERAL_1__database');
const { logger } = require('..__LITERAL_2__tils/logger');
async function setupDatabase() {
  let database = null;
  try {
    logger.info('Starting database setup...');
    database = new DatabaseRepository();
    await database.initialize();
    logger.info('Database setup completed successfully');
    logger.info('Running basic database tests...');
    const crypto = require('crypto');
    const testVectorId = 'test-vector-' + crypto.randomBytes(8).toString('hex');
    await database.insertVectorMetadata({
      id: testVectorId,
      dimensions: 1536,
      personaId: null,
      contentType: 'test',
      source: 'setup-script',
      tags: ['test', 'setup'],
      customMetadata: { test: true }
    });
    const retrievedMetadata = await database.getVectorMetadata(testVectorId);
    if (retrievedMetadata && retrievedMetadata.id === testVectorId) {
      logger.info('Vector metadata test passed');
    } else {
      throw new Error('Vector metadata test failed');
    }
    logger.info('Test data created (cleanup skipped)');
    const bcrypt = require('bcrypt');
    const defaultUserId = 'default-user';
    const defaultUserPassword = await bcrypt.hash('admin123', 12);
    await database.insertUser({
      id: defaultUserId,
      email: 'admin@zero-vector.com',
      passwordHash: defaultUserPassword,
      role: 'admin'
    });
    logger.info('Default admin user created: admin@zero-vector.com (password: admin123)');
    const testApiKey = 'vdb_test_' + crypto.randomBytes(16).toString('hex');
    const hashedKey = await bcrypt.hash(testApiKey, 12);
    await database.insertApiKey({
      id: crypto.randomUUID(),
      keyHash: hashedKey,
      userId: defaultUserId,
      name: 'Test API Key',
      permissions: ['read', 'write'],
      rateLimit: 1000,
      expiresAt: Date.now() + (365 * 24 * 60 * 60 * 1000)
    });
    logger.info('Sample API key created (save this for testing):');
    logger.info(`API Key: ${testApiKey}`);
    logger.info('Database setup and testing completed successfully!');
  } catch (error) {
    logger.error('Database setup failed:', error);
    process.exit(1);
  } finally {
    if (database) {
      await database.close();
    }
  }
}
if (require.main === module) {
  setupDatabase().catch((error) => {
    console.error('Setup failed:', error);
    process.exit(1);
  });
}
module.exports = setupDatabase;
