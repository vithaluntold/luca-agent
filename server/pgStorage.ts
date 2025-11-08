import { eq, and, desc } from "drizzle-orm";
import { db } from "./db";
import { 
  users, 
  conversations, 
  messages, 
  modelRoutingLogs, 
  usageTracking,
  type User,
  type Conversation,
  type Message,
  type InsertUser,
  type InsertConversation,
  type InsertMessage
} from "@shared/schema";
import type { IStorage } from "./storage";

export class PostgresStorage implements IStorage {
  // User methods
  async getUser(id: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return result[0] || undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
    return result[0] || undefined;
  }

  async createUser(data: InsertUser): Promise<User> {
    const result = await db.insert(users).values(data).returning();
    return result[0];
  }

  async updateUserSubscription(id: string, tier: string): Promise<User | undefined> {
    const result = await db
      .update(users)
      .set({ subscriptionTier: tier })
      .where(eq(users.id, id))
      .returning();
    return result[0] || undefined;
  }

  // Conversation methods
  async getConversation(id: string): Promise<Conversation | undefined> {
    const result = await db.select().from(conversations).where(eq(conversations.id, id)).limit(1);
    return result[0] || undefined;
  }

  async getUserConversations(userId: string): Promise<Conversation[]> {
    return db
      .select()
      .from(conversations)
      .where(eq(conversations.userId, userId))
      .orderBy(desc(conversations.updatedAt));
  }

  async createConversation(data: InsertConversation): Promise<Conversation> {
    const result = await db.insert(conversations).values(data).returning();
    return result[0];
  }

  async updateConversation(id: string, data: Partial<Conversation>): Promise<Conversation | undefined> {
    const result = await db
      .update(conversations)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(conversations.id, id))
      .returning();
    return result[0] || undefined;
  }

  async deleteConversation(id: string): Promise<boolean> {
    const result = await db.delete(conversations).where(eq(conversations.id, id)).returning();
    return result.length > 0;
  }

  // Message methods
  async getConversationMessages(conversationId: string): Promise<Message[]> {
    return db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(messages.createdAt);
  }

  async createMessage(data: InsertMessage): Promise<Message> {
    const result = await db.insert(messages).values(data).returning();
    return result[0];
  }

  // Routing logs
  async createRoutingLog(data: {
    messageId: string;
    queryClassification: any;
    selectedModel: string;
    routingReason: string;
    confidence: number;
    alternativeModels: string[];
    processingTimeMs: number;
  }) {
    const result = await db.insert(modelRoutingLogs).values(data).returning();
    return result[0];
  }

  // Usage tracking
  async getUsageForMonth(userId: string, month: string) {
    const result = await db
      .select()
      .from(usageTracking)
      .where(and(eq(usageTracking.userId, userId), eq(usageTracking.month, month)))
      .limit(1);
    
    return result[0] || undefined;
  }

  async incrementUsage(
    userId: string,
    month: string,
    queries: number = 0,
    documents: number = 0,
    tokens: number = 0
  ) {
    const existing = await this.getUsageForMonth(userId, month);
    
    if (existing) {
      const result = await db
        .update(usageTracking)
        .set({
          queriesUsed: existing.queriesUsed + queries,
          documentsAnalyzed: existing.documentsAnalyzed + documents,
          tokensUsed: existing.tokensUsed + tokens,
          updatedAt: new Date()
        })
        .where(and(
          eq(usageTracking.userId, userId),
          eq(usageTracking.month, month)
        ))
        .returning();
      return result[0];
    } else {
      const result = await db.insert(usageTracking).values({
        userId,
        month,
        queriesUsed: queries,
        documentsAnalyzed: documents,
        tokensUsed: tokens
      }).returning();
      return result[0];
    }
  }
}

export const storage = new PostgresStorage();
