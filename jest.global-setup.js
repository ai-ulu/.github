// Global setup for Jest tests
// This runs once before all tests

const { execSync } = require('child_process');
const { Client } = require('pg');

module.exports = async () => {
  console.log('🧪 Setting up test environment...');
  
  try {
    // Set up test database
    const client = new Client({
      host: 'localhost',
      port: 5432,
      user: 'autoqa_user',
      password: 'autoqa_password_dev',
      database: 'postgres' // Connect to default database first
    });
    
    await client.connect();
    
    // Create test database if it doesn't exist
    try {
      await client.query('CREATE DATABASE autoqa_pilot_test');
      console.log('✅ Test database created');
    } catch (error) {
      if (error.code === '42P04') {
        console.log('✅ Test database already exists');
      } else {
        throw error;
      }
    }
    
    await client.end();
    
    // Run database migrations for test database
    process.env.DATABASE_URL = 'postgresql://autoqa_user:autoqa_password_dev@localhost:5432/autoqa_pilot_test';
    
    // This will be uncommented when we set up Prisma migrations
    // execSync('npx prisma migrate deploy', { stdio: 'inherit' });
    
    console.log('✅ Test database setup complete');
    
  } catch (error) {
    console.warn('⚠️ Could not set up test database:', error.message);
    console.warn('Tests will run with mocked database');
  }
  
  // Set up test Redis (if available)
  try {
    const Redis = require('ioredis');
    const redis = new Redis({
      host: 'localhost',
      port: 6379,
      db: 1, // Use database 1 for tests
      maxRetriesPerRequest: 1,
      retryDelayOnFailover: 100,
      lazyConnect: true
    });
    
    await redis.connect();
    await redis.flushdb(); // Clear test database
    await redis.quit();
    
    console.log('✅ Test Redis setup complete');
  } catch (error) {
    console.warn('⚠️ Could not connect to Redis:', error.message);
    console.warn('Tests will run with mocked Redis');
  }
  
  // Set up test MinIO bucket (if available)
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
    
    if (!bucketExists) {
      await minioClient.makeBucket(testBucket);
      console.log('✅ Test MinIO bucket created');
    } else {
      console.log('✅ Test MinIO bucket already exists');
    }
    
  } catch (error) {
    console.warn('⚠️ Could not set up MinIO:', error.message);
    console.warn('Tests will run with mocked MinIO');
  }
  
  console.log('🎉 Test environment setup complete');
};