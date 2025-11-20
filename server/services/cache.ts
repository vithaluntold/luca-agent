/**
 * Redis Caching Layer
 * Handles caching for conversations, users, AI responses
 */

import NodeCache from 'node-cache';
import { redisClient } from './jobQueue';
import type { Conversation, User } from '@shared/schema';

// Fallback to memory cache if Redis unavailable
const memoryCache = new NodeCache({
  stdTTL: 300, // 5 minutes default
  checkperiod: 60,
  useClones: false
});

export class CacheService {
  /**
   * Get from cache with fallback to memory
   */
  static async get<T>(key: string): Promise<T | null> {
    try {
      // Try Redis first
      const redisValue = await redisClient.get(key);
      if (redisValue) {
        return JSON.parse(redisValue) as T;
      }
    } catch (error) {
      console.warn('[Cache] Redis get failed, using memory:', error);
    }
    
    // Fallback to memory cache
    const memValue = memoryCache.get<T>(key);
    return memValue || null;
  }

  /**
   * Set in cache with TTL
   */
  static async set(key: string, value: any, ttlSeconds: number = 300): Promise<void> {
    const serialized = JSON.stringify(value);
    
    try {
      // Set in Redis
      await redisClient.setex(key, ttlSeconds, serialized);
    } catch (error) {
      console.warn('[Cache] Redis set failed, using memory:', error);
    }
    
    // Also set in memory cache as fallback
    memoryCache.set(key, value, ttlSeconds);
  }

  /**
   * Delete from cache
   */
  static async del(key: string | string[]): Promise<void> {
    const keys = Array.isArray(key) ? key : [key];
    
    try {
      await redisClient.del(...keys);
    } catch (error) {
      console.warn('[Cache] Redis del failed:', error);
    }
    
    keys.forEach(k => memoryCache.del(k));
  }

  /**
   * Clear all caches
   */
  static async flush(): Promise<void> {
    try {
      await redisClient.flushdb();
    } catch (error) {
      console.warn('[Cache] Redis flush failed:', error);
    }
    
    memoryCache.flushAll();
  }

  /**
   * Get cache stats
   */
  static getStats() {
    return {
      memory: memoryCache.getStats(),
      redis: {
        status: redisClient.status,
        ready: redisClient.status === 'ready'
      }
    };
  }
}

/**
 * Domain-specific cache functions
 */

export const ConversationCache = {
  /**
   * Cache user's conversation list
   */
  async getUserConversations(userId: string): Promise<Conversation[] | null> {
    return CacheService.get<Conversation[]>(`user:${userId}:conversations`);
  },

  async setUserConversations(userId: string, conversations: Conversation[]): Promise<void> {
    await CacheService.set(`user:${userId}:conversations`, conversations, 300); // 5 min
  },

  async invalidateUserConversations(userId: string): Promise<void> {
    await CacheService.del(`user:${userId}:conversations`);
  },

  /**
   * Cache single conversation
   */
  async getConversation(conversationId: string): Promise<Conversation | null> {
    return CacheService.get<Conversation>(`conversation:${conversationId}`);
  },

  async setConversation(conversation: Conversation): Promise<void> {
    await CacheService.set(`conversation:${conversation.id}`, conversation, 600); // 10 min
  },

  async invalidateConversation(conversationId: string): Promise<void> {
    await CacheService.del(`conversation:${conversationId}`);
  }
};

export const UserCache = {
  /**
   * Cache user data
   */
  async getUser(userId: string): Promise<User | null> {
    return CacheService.get<User>(`user:${userId}`);
  },

  async setUser(user: User): Promise<void> {
    await CacheService.set(`user:${user.id}`, user, 1800); // 30 min
  },

  async invalidateUser(userId: string): Promise<void> {
    await CacheService.del(`user:${userId}`);
  }
};

export const AIResponseCache = {
  /**
   * Cache AI responses for duplicate queries
   */
  getCacheKey(query: string, chatMode: string, userTier: string): string {
    // Simple hash for cache key
    const normalized = query.toLowerCase().trim().replace(/\s+/g, ' ');
    const hash = Buffer.from(normalized).toString('base64').substring(0, 50);
    return `ai:${chatMode}:${userTier}:${hash}`;
  },

  async get(query: string, chatMode: string, userTier: string): Promise<string | null> {
    const key = this.getCacheKey(query, chatMode, userTier);
    return CacheService.get<string>(key);
  },

  async set(query: string, chatMode: string, userTier: string, response: string): Promise<void> {
    const key = this.getCacheKey(query, chatMode, userTier);
    // Shorter TTL for AI responses (questions change frequently)
    await CacheService.set(key, response, 1800); // 30 min
  }
};

export default CacheService;
