import { eq, and, desc, sql as drizzleSql, count } from "drizzle-orm";
import { db } from "./db";
import { encryptApiKey, decryptApiKey, maskApiKey } from "./utils/encryption";
import { 
  users, 
  conversations, 
  messages, 
  modelRoutingLogs, 
  usageTracking,
  userLLMConfig,
  supportTickets,
  ticketMessages,
  auditLogs,
  accountingIntegrations,
  gdprConsents,
  taxFileUploads,
  type User,
  type Conversation,
  type Message,
  type InsertUser,
  type InsertConversation,
  type InsertMessage,
  type UserLLMConfig,
  type InsertUserLLMConfig,
  type SupportTicket,
  type InsertSupportTicket,
  type TicketMessage,
  type InsertTicketMessage,
  type AuditLog,
  type AccountingIntegration,
  type InsertAccountingIntegration,
  type GdprConsent,
  type TaxFileUpload,
  type InsertTaxFileUpload
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

  // Admin methods
  async getAllUsers(): Promise<User[]> {
    return db.select().from(users).orderBy(desc(users.createdAt));
  }

  async getAdminKPIs() {
    const totalUsers = await db.select({ count: count() }).from(users);
    const totalConversations = await db.select({ count: count() }).from(conversations);
    const totalMessages = await db.select({ count: count() }).from(messages);
    
    const subscriptionCounts = await db
      .select({
        tier: users.subscriptionTier,
        count: drizzleSql<number>`cast(count(*) as int)`
      })
      .from(users)
      .groupBy(users.subscriptionTier);

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const activeUsers = await db
      .select({ count: count() })
      .from(conversations)
      .where(drizzleSql`${conversations.createdAt} >= ${thirtyDaysAgo}`);

    return {
      totalUsers: totalUsers[0].count,
      totalConversations: totalConversations[0].count,
      totalMessages: totalMessages[0].count,
      subscriptionCounts,
      activeUsersLast30Days: activeUsers[0].count
    };
  }

  // User LLM Config methods
  async getUserLLMConfig(userId: string, includeMasked: boolean = true): Promise<UserLLMConfig & { apiKeyMasked?: string } | undefined> {
    const result = await db
      .select()
      .from(userLLMConfig)
      .where(eq(userLLMConfig.userId, userId))
      .limit(1);
    
    if (!result[0]) return undefined;
    
    const config = result[0];
    
    if (includeMasked && config.apiKey) {
      const decrypted = decryptApiKey(config.apiKey);
      return {
        ...config,
        apiKey: undefined as any,
        apiKeyMasked: maskApiKey(decrypted)
      };
    }
    
    return config;
  }

  async upsertUserLLMConfig(data: InsertUserLLMConfig): Promise<UserLLMConfig> {
    const dataToStore = { ...data };
    
    if (data.apiKey) {
      dataToStore.apiKey = encryptApiKey(data.apiKey);
    }
    
    const existing = await this.getUserLLMConfig(data.userId, false);
    
    if (existing) {
      const result = await db
        .update(userLLMConfig)
        .set({ ...dataToStore, updatedAt: new Date() })
        .where(eq(userLLMConfig.userId, data.userId))
        .returning();
      return result[0];
    } else {
      const result = await db.insert(userLLMConfig).values(dataToStore).returning();
      return result[0];
    }
  }

  async getDecryptedLLMConfig(userId: string): Promise<UserLLMConfig | undefined> {
    const config = await this.getUserLLMConfig(userId, false);
    if (!config || !config.apiKey) return config;
    
    return {
      ...config,
      apiKey: decryptApiKey(config.apiKey)
    };
  }

  // Support Ticket methods
  async createSupportTicket(data: InsertSupportTicket): Promise<SupportTicket> {
    const result = await db.insert(supportTickets).values(data).returning();
    return result[0];
  }

  async getSupportTicket(id: string): Promise<SupportTicket | undefined> {
    const result = await db
      .select()
      .from(supportTickets)
      .where(eq(supportTickets.id, id))
      .limit(1);
    return result[0] || undefined;
  }

  async getUserSupportTickets(userId: string): Promise<SupportTicket[]> {
    return db
      .select()
      .from(supportTickets)
      .where(eq(supportTickets.userId, userId))
      .orderBy(desc(supportTickets.createdAt));
  }

  async getAllSupportTickets(): Promise<SupportTicket[]> {
    return db
      .select()
      .from(supportTickets)
      .orderBy(desc(supportTickets.createdAt));
  }

  async updateSupportTicket(id: string, data: Partial<SupportTicket>): Promise<SupportTicket | undefined> {
    const result = await db
      .update(supportTickets)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(supportTickets.id, id))
      .returning();
    return result[0] || undefined;
  }

  async createTicketMessage(data: InsertTicketMessage): Promise<TicketMessage> {
    const result = await db.insert(ticketMessages).values(data).returning();
    return result[0];
  }

  async getTicketMessages(ticketId: string): Promise<TicketMessage[]> {
    return db
      .select()
      .from(ticketMessages)
      .where(eq(ticketMessages.ticketId, ticketId))
      .orderBy(ticketMessages.createdAt);
  }

  // Audit Log methods
  async createAuditLog(data: {
    userId?: string;
    action: string;
    resourceType?: string;
    resourceId?: string;
    details?: any;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<AuditLog> {
    const result = await db.insert(auditLogs).values(data).returning();
    return result[0];
  }

  async getAuditLogs(limit: number = 100): Promise<AuditLog[]> {
    return db
      .select()
      .from(auditLogs)
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit);
  }

  async getUserAuditLogs(userId: string, limit: number = 100): Promise<AuditLog[]> {
    return db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.userId, userId))
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit);
  }

  // Accounting Integration methods
  async createAccountingIntegration(data: InsertAccountingIntegration): Promise<AccountingIntegration> {
    const result = await db.insert(accountingIntegrations).values(data).returning();
    return result[0];
  }

  async getUserAccountingIntegrations(userId: string): Promise<AccountingIntegration[]> {
    return db
      .select()
      .from(accountingIntegrations)
      .where(eq(accountingIntegrations.userId, userId));
  }

  async updateAccountingIntegration(
    id: string,
    data: Partial<AccountingIntegration>
  ): Promise<AccountingIntegration | undefined> {
    const result = await db
      .update(accountingIntegrations)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(accountingIntegrations.id, id))
      .returning();
    return result[0] || undefined;
  }

  async deleteAccountingIntegration(id: string): Promise<boolean> {
    const result = await db
      .delete(accountingIntegrations)
      .where(eq(accountingIntegrations.id, id))
      .returning();
    return result.length > 0;
  }

  // GDPR Consent methods
  async createGdprConsent(data: {
    userId: string;
    consentType: string;
    consented: boolean;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<GdprConsent> {
    const result = await db.insert(gdprConsents).values(data).returning();
    return result[0];
  }

  async getUserGdprConsents(userId: string): Promise<GdprConsent[]> {
    return db
      .select()
      .from(gdprConsents)
      .where(eq(gdprConsents.userId, userId))
      .orderBy(desc(gdprConsents.createdAt));
  }

  async deleteUserData(userId: string): Promise<boolean> {
    await db.delete(users).where(eq(users.id, userId));
    return true;
  }

  async exportUserData(userId: string) {
    const user = await this.getUser(userId);
    const userConversations = await this.getUserConversations(userId);
    const tickets = await this.getUserSupportTickets(userId);
    const integrations = await this.getUserAccountingIntegrations(userId);
    const llmConfig = await this.getUserLLMConfig(userId);
    const consents = await this.getUserGdprConsents(userId);

    return {
      user,
      conversations: userConversations,
      tickets,
      integrations,
      llmConfig,
      consents
    };
  }

  // Tax file upload methods
  async createTaxFileUpload(data: InsertTaxFileUpload): Promise<TaxFileUpload> {
    const result = await db.insert(taxFileUploads).values(data).returning();
    return result[0];
  }

  async getTaxFileUpload(id: string): Promise<TaxFileUpload | undefined> {
    const result = await db
      .select()
      .from(taxFileUploads)
      .where(eq(taxFileUploads.id, id))
      .limit(1);
    return result[0] || undefined;
  }

  async getUserTaxFileUploads(userId: string, vendor?: string): Promise<TaxFileUpload[]> {
    if (vendor) {
      return db
        .select()
        .from(taxFileUploads)
        .where(and(
          eq(taxFileUploads.userId, userId),
          eq(taxFileUploads.vendor, vendor)
        ))
        .orderBy(desc(taxFileUploads.createdAt));
    }
    return db
      .select()
      .from(taxFileUploads)
      .where(eq(taxFileUploads.userId, userId))
      .orderBy(desc(taxFileUploads.createdAt));
  }

  async updateTaxFileUpload(
    id: string,
    data: Partial<TaxFileUpload>
  ): Promise<TaxFileUpload | undefined> {
    const result = await db
      .update(taxFileUploads)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(taxFileUploads.id, id))
      .returning();
    return result[0] || undefined;
  }

  async deleteTaxFileUpload(id: string): Promise<boolean> {
    const result = await db
      .update(taxFileUploads)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(taxFileUploads.id, id))
      .returning();
    return result.length > 0;
  }
}

export const storage = new PostgresStorage();
