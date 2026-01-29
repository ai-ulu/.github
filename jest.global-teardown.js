// Global teardown for Jest tests
// This runs once after all tests complete

const { Client } = require('pg');

module.exports = async () => {
  console.log('🧹 Cleaning up test environment...');
  
  try {
    // Clean up test database
    const client = new Client({
      host: 'localhost',
      port: 5432,
      user: 'autoqa_user',
      password: 'autoqa_password_dev',
      database: 'postgres'
    });
    
    await client.connect();
    
    // Terminate all connections to test database
    await client.query(`
      SELECT pg_terminate_backend(pid)
      FROM pg_stat_activity
      WHERE datname = 'autoqa_pilot_test' AND pid <> pg_backend_pid()
    `);
    
    // Drop test database
    await client.query('DROP DATABASE IF EXISTS autoqa_pilot_test');
    console.log('✅ Test database cleaned up');
    
    await client.end();
    
  } catch (error) {
    console.warn('⚠️ Could not clean up test database:', error.message);
  }
  
  // Clean up test Redis
  try {
    const Redis = require('ioredis');
    const redis = new Redis({
      host: 'localhost',
      port: 6379,
      db: 1,
      maxRetriesPerRequest: 1,
      retryDelayOnFailover: 100,
      lazyConnect: true
    });
    
    await redis.connect();
    await redis.flushdb();
    await redis.quit();
    
    console.log('✅ Test Redis cleaned up');
  } catch (error) {
    console.warn('⚠️ Could not clean up Redis:', error.message);
  }
  
  // Clean up test MinIO bucket
  try {
    const Minio = require('minio');
    const minioClient = new Minio.Client({
      endPoint: 'localhost',
      port: 9000,
      useSSL: false,
      accessKey: 'autoqa_minio_user',
      secretKey: 'autoqa_minio_password_dev'
    });
    
    const testBucket = 'autoqa-test-storage';
    const bucketExists = await minioClient.bucketExists(testBucket);
    
    if (bucketExists) {
      // Remove all objects in bucket first
      const objectsList = [];
      const objectsStream = minioClient.listObjects(testBucket, '', true);
      
      for await (const obj of objectsStream) {
        objectsList.push(obj.name);
      }
      
      if (objectsList.length > 0) {
        await minioClient.removeObjects(testBucket, objectsList);
      }
      
      await minioClient.removeBucket(testBucket);
      console.log('✅ Test MinIO bucket cleaned up');
    }
    
  } catch (error) {
    console.warn('⚠️ Could not clean up MinIO:', error.message);
  }
  
  console.log('🎉 Test environment cleanup complete');
};