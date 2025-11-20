/**
 * Background Job Queue with Bull + Redis
 * Handles async tasks: title generation, analytics, file processing
 */

import Bull, { Queue, Job } from 'bull';
import Redis from 'ioredis';
import { generateConversationTitle } from './conversationTitleGenerator';
import { storage } from '../pgStorage';
import { AnalyticsProcessor } from './analyticsProcessor';

// Redis connection (optional for local dev)
const REDIS_URL = process.env.REDIS_URL;
const isRedisEnabled = !!REDIS_URL;

let redisClient: Redis | null = null;

if (isRedisEnabled) {
  redisClient = new Redis(REDIS_URL, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    retryStrategy: (times) => {
      // Stop retrying after 5 attempts in development
      if (process.env.NODE_ENV !== 'production' && times > 5) {
        console.warn('[Redis] Max retries reached. Running without Redis.');
        return null;
      }
      return Math.min(times * 50, 2000);
    },
    lazyConnect: true, // Don't auto-connect
  });

  redisClient.on('error', (error) => {
    if (process.env.NODE_ENV === 'production') {
      console.error('[Redis] Connection error:', error);
    }
  });

  redisClient.on('connect', () => {
    console.log('[Redis] ✓ Connected successfully');
  });

  // Attempt connection
  redisClient.connect().catch((error) => {
    console.warn('[Redis] ⚠️  Not available - job queues disabled:', error.message);
    redisClient = null;
  });
} else {
  console.log('[Redis] ⚠️  REDIS_URL not set - running without job queues (dev mode)');
}

// Job Queues (only create if Redis is available)
export let titleGenerationQueue: Queue | null = null;
export let analyticsQueue: Queue | null = null;
export let fileProcessingQueue: Queue | null = null;

if (isRedisEnabled && REDIS_URL) {
  titleGenerationQueue = new Bull('conversation-titles', REDIS_URL, {
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000
      },
      removeOnComplete: 100, // Keep last 100 completed jobs
      removeOnFail: 500 // Keep last 500 failed jobs for debugging
    }
  });

  analyticsQueue = new Bull('analytics', REDIS_URL, {
    defaultJobOptions: {
      attempts: 2,
      backoff: {
        type: 'fixed',
        delay: 5000
      },
      removeOnComplete: 50,
      removeOnFail: 200
    }
  });

  fileProcessingQueue = new Bull('file-processing', REDIS_URL, {
    defaultJobOptions: {
      attempts: 2,
      timeout: 60000, // 1 minute timeout
      removeOnComplete: 50,
      removeOnFail: 200
    }
  });

  // Job Processors

  /**
   * Process conversation title generation
   */
  titleGenerationQueue.process(async (job: Job) => {
  const { conversationId, query } = job.data;
  
  console.log(`[TitleQueue] Processing job ${job.id} for conversation ${conversationId}`);
  
  try {
    const { title, metadata } = await generateConversationTitle(query);
    await storage.updateConversation(conversationId, { title, metadata });
    
    console.log(`[TitleQueue] ✓ Generated title: "${title}"`);
    return { success: true, title, metadata };
  } catch (error) {
    console.error(`[TitleQueue] ✗ Failed for conversation ${conversationId}:`, error);
    throw error; // Will trigger retry
  }
  });

  /**
   * Process analytics calculations
   */
  analyticsQueue.process(async (job: Job) => {
  const { messageId, conversationId, userId, role, content, previousMessages } = job.data;
  
  console.log(`[AnalyticsQueue] Processing message ${messageId}`);
  
  try {
    await AnalyticsProcessor.processMessage({
      messageId,
      conversationId,
      userId,
      role,
      content,
      previousMessages
    });
    
    return { success: true };
  } catch (error) {
    console.error(`[AnalyticsQueue] Failed for message ${messageId}:`, error);
    // Don't retry analytics - it's non-critical
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
  });

  /**
   * Process file uploads (virus scanning, encryption, analysis)
   */
  fileProcessingQueue.process(async (job: Job) => {
  const { fileId, filePath, userId } = job.data;
  
  console.log(`[FileQueue] Processing file ${fileId}`);
  
  try {
    // File processing logic here (virus scan, encryption, etc.)
    // This would integrate with existing file processing services
    
    return { success: true, fileId };
  } catch (error) {
    console.error(`[FileQueue] Failed for file ${fileId}:`, error);
    throw error;
  }
  });

  // Queue Event Handlers

  titleGenerationQueue.on('completed', (job, result) => {
    console.log(`[TitleQueue] Job ${job.id} completed:`, result.title);
  });

  titleGenerationQueue.on('failed', (job, err) => {
    console.error(`[TitleQueue] Job ${job?.id} failed after ${job?.attemptsMade} attempts:`, err.message);
  });

  analyticsQueue.on('failed', (job, err) => {
    console.error(`[AnalyticsQueue] Job ${job?.id} failed:`, err.message);
  });

  fileProcessingQueue.on('failed', (job, err) => {
    console.error(`[FileQueue] Job ${job?.id} failed:`, err.message);
  });
}

// Monitoring & Health Check

export async function getQueueStats() {
  if (!isRedisEnabled || !titleGenerationQueue || !analyticsQueue || !fileProcessingQueue) {
    return {
      titleGeneration: { waiting: 0, active: 0, completed: 0, failed: 0 },
      analytics: { waiting: 0, active: 0, completed: 0, failed: 0 },
      fileProcessing: { waiting: 0, active: 0, completed: 0, failed: 0 },
      redis: {
        status: 'disabled',
        ready: false
      }
    };
  }
  
  const [titleStats, analyticsStats, fileStats] = await Promise.all([
    titleGenerationQueue.getJobCounts(),
    analyticsQueue.getJobCounts(),
    fileProcessingQueue.getJobCounts()
  ]);
  
  return {
    titleGeneration: titleStats,
    analytics: analyticsStats,
    fileProcessing: fileStats,
    redis: {
      status: redisClient?.status || 'disconnected',
      ready: redisClient?.status === 'ready'
    }
  };
}

// Graceful Shutdown

async function gracefulShutdown() {
  console.log('[Queue] Gracefully shutting down queues...');
  
  if (isRedisEnabled && titleGenerationQueue && analyticsQueue && fileProcessingQueue) {
    await Promise.all([
      titleGenerationQueue.close(),
      analyticsQueue.close(),
      fileProcessingQueue.close(),
      redisClient?.quit()
    ]);
  }
  
  console.log('[Queue] All queues closed');
}

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

export { redisClient };
