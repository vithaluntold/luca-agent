import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, jsonb, boolean, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  name: text("name").notNull(),
  subscriptionTier: text("subscription_tier").notNull().default("free"),
  isAdmin: boolean("is_admin").notNull().default(false),
  // Account lockout fields
  failedLoginAttempts: integer("failed_login_attempts").notNull().default(0),
  lockedUntil: timestamp("locked_until"),
  lastFailedLogin: timestamp("last_failed_login"),
  // MFA/2FA fields
  mfaEnabled: boolean("mfa_enabled").notNull().default(false),
  mfaSecret: text("mfa_secret"), // TOTP secret (encrypted)
  mfaBackupCodes: text("mfa_backup_codes").array(), // Encrypted backup codes
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const profiles = pgTable("profiles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  type: text("type").notNull(), // 'business', 'personal', 'family'
  description: text("description"),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  userIdIdx: index("profiles_user_id_idx").on(table.userId),
  typeIdx: index("profiles_type_idx").on(table.type),
  // Unique constraint: Only one personal profile per user
  uniquePersonalPerUser: uniqueIndex("profiles_user_personal_unique_idx")
    .on(table.userId)
    .where(sql`${table.type} = 'personal'`),
}));

export const profileMembers = pgTable("profile_members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  profileId: varchar("profile_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  email: text("email"),
  relationship: text("relationship"), // 'spouse', 'child', 'parent', 'other'
  role: text("role").notNull().default("member"), // 'owner', 'admin', 'member', 'viewer'
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  profileIdIdx: index("profile_members_profile_id_idx").on(table.profileId),
}));

export const conversations = pgTable("conversations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  profileId: varchar("profile_id").references(() => profiles.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  preview: text("preview"),
  pinned: boolean("pinned").notNull().default(false),
  isShared: boolean("is_shared").notNull().default(false),
  sharedToken: varchar("shared_token").unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  userIdProfileIdUpdatedAtIdx: index("conversations_user_profile_updated_idx")
    .on(table.userId, table.profileId, table.updatedAt),
  pinnedIdx: index("conversations_pinned_idx").on(table.pinned),
  sharedTokenIdx: index("conversations_shared_token_idx").on(table.sharedToken),
}));

export const messages = pgTable("messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  content: text("content").notNull(),
  modelUsed: text("model_used"),
  routingDecision: jsonb("routing_decision"),
  calculationResults: jsonb("calculation_results"),
  tokensUsed: integer("tokens_used"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const modelRoutingLogs = pgTable("model_routing_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  messageId: varchar("message_id").notNull().references(() => messages.id, { onDelete: "cascade" }),
  queryClassification: jsonb("query_classification").notNull(),
  selectedModel: text("selected_model").notNull(),
  routingReason: text("routing_reason"),
  confidence: integer("confidence"),
  alternativeModels: jsonb("alternative_models"),
  processingTimeMs: integer("processing_time_ms"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const usageTracking = pgTable("usage_tracking", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  month: text("month").notNull(),
  queriesUsed: integer("queries_used").notNull().default(0),
  documentsAnalyzed: integer("documents_analyzed").notNull().default(0),
  tokensUsed: integer("tokens_used").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const userLLMConfig = pgTable("user_llm_config", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }).unique(),
  provider: text("provider").notNull().default("openai"),
  apiKey: text("api_key"),
  modelName: text("model_name"),
  endpoint: text("endpoint"),
  isEnabled: boolean("is_enabled").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const supportTickets = pgTable("support_tickets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  subject: text("subject").notNull(),
  description: text("description").notNull(),
  status: text("status").notNull().default("open"),
  priority: text("priority").notNull().default("medium"),
  category: text("category"),
  assignedTo: varchar("assigned_to").references(() => users.id),
  resolution: text("resolution"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at"),
});

export const ticketMessages = pgTable("ticket_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ticketId: varchar("ticket_id").notNull().references(() => supportTickets.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id),
  message: text("message").notNull(),
  isInternal: boolean("is_internal").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const auditLogs = pgTable("audit_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  action: text("action").notNull(),
  resourceType: text("resource_type"),
  resourceId: varchar("resource_id"),
  details: jsonb("details"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const accountingIntegrations = pgTable("accounting_integrations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  tokenExpiry: timestamp("token_expiry"),
  companyId: text("company_id"),
  companyName: text("company_name"),
  isActive: boolean("is_active").notNull().default(true),
  lastSync: timestamp("last_sync"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const gdprConsents = pgTable("gdpr_consents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  consentType: text("consent_type").notNull(),
  consented: boolean("consented").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const taxFileUploads = pgTable("tax_file_uploads", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  vendor: text("vendor").notNull(), // 'drake', 'turbotax', 'hrblock', 'adp'
  filename: text("filename").notNull(),
  originalFilename: text("original_filename").notNull(),
  mimeType: text("mime_type").notNull(),
  byteLength: integer("byte_length").notNull(),
  storageKey: text("storage_key").notNull(), // Encrypted file path/key
  encryptionNonce: text("encryption_nonce").notNull(), // IV for AES-256-GCM
  encryptedFileKey: text("encrypted_file_key").notNull(), // Per-file key encrypted with master key
  checksum: text("checksum").notNull(), // SHA-256 checksum for tamper detection
  scanStatus: text("scan_status").notNull().default("pending"), // 'pending', 'clean', 'infected', 'failed'
  scanDetails: jsonb("scan_details"),
  formType: text("form_type"), // '8949', 'client_data', 'w2', etc.
  importStatus: text("import_status").notNull().default("pending"), // 'pending', 'processing', 'completed', 'failed'
  importDetails: jsonb("import_details"),
  importedAt: timestamp("imported_at"),
  deletedAt: timestamp("deleted_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  userIdIdx: index("tax_file_uploads_user_id_idx").on(table.userId),
  scanStatusIdx: index("tax_file_uploads_scan_status_idx").on(table.scanStatus),
  importStatusIdx: index("tax_file_uploads_import_status_idx").on(table.importStatus),
  vendorIdx: index("tax_file_uploads_vendor_idx").on(table.vendor),
}));

// Analytics Tables for AI Response Quality, Sentiment Analysis, and Behavior Prediction

export const conversationAnalytics = pgTable("conversation_analytics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  
  // Quality Metrics
  qualityScore: integer("quality_score"), // 0-100
  responseRelevanceScore: integer("response_relevance_score"), // 0-100
  completenessScore: integer("completeness_score"), // 0-100
  clarityScore: integer("clarity_score"), // 0-100
  
  // Conversation Behavior Metrics
  totalMessages: integer("total_messages").notNull().default(0),
  averageResponseTime: integer("average_response_time"), // milliseconds
  conversationDuration: integer("conversation_duration"), // seconds
  wasAbandoned: boolean("was_abandoned").notNull().default(false),
  abandonmentPoint: integer("abandonment_point"), // message count when abandoned
  
  // User Satisfaction Indicators
  followUpQuestionCount: integer("follow_up_question_count").notNull().default(0),
  clarificationRequestCount: integer("clarification_request_count").notNull().default(0),
  userFrustrationDetected: boolean("user_frustration_detected").notNull().default(false),
  resolutionAchieved: boolean("resolution_achieved"),
  
  // Engagement Metrics
  topicsDiscussed: jsonb("topics_discussed"), // Array of topics
  domainCategories: jsonb("domain_categories"), // ['tax', 'audit', 'compliance', etc.]
  complexityLevel: text("complexity_level"), // 'simple', 'moderate', 'complex', 'expert'
  
  // AI Performance
  providerUsed: text("provider_used"), // Primary AI provider
  modelSwitchCount: integer("model_switch_count").notNull().default(0),
  fallbackTriggered: boolean("fallback_triggered").notNull().default(false),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  conversationIdIdx: index("conversation_analytics_conversation_id_idx").on(table.conversationId),
  userIdIdx: index("conversation_analytics_user_id_idx").on(table.userId),
  qualityScoreIdx: index("conversation_analytics_quality_score_idx").on(table.qualityScore),
  createdAtIdx: index("conversation_analytics_created_at_idx").on(table.createdAt),
}));

export const messageAnalytics = pgTable("message_analytics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  messageId: varchar("message_id").notNull().references(() => messages.id, { onDelete: "cascade" }),
  conversationId: varchar("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  
  // Sentiment Analysis
  userSentiment: text("user_sentiment"), // 'positive', 'neutral', 'negative', 'frustrated', 'satisfied'
  sentimentScore: integer("sentiment_score"), // -100 to 100
  emotionalTone: jsonb("emotional_tone"), // { anger: 0.1, joy: 0.7, etc. }
  
  // Message Quality (for assistant messages)
  responseQuality: integer("response_quality"), // 0-100
  accuracyScore: integer("accuracy_score"), // 0-100
  helpfulnessScore: integer("helpfulness_score"), // 0-100
  
  // User Intent Detection
  userIntent: text("user_intent"), // 'question', 'clarification', 'complaint', 'appreciation', etc.
  intentConfidence: integer("intent_confidence"), // 0-100
  
  // Response Characteristics
  responseLength: integer("response_length"), // characters
  technicalComplexity: text("technical_complexity"), // 'simple', 'moderate', 'advanced'
  containsCalculations: boolean("contains_calculations").notNull().default(false),
  containsCitations: boolean("contains_citations").notNull().default(false),
  
  // Timing
  processingTime: integer("processing_time"), // milliseconds
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  messageIdIdx: index("message_analytics_message_id_idx").on(table.messageId),
  conversationIdIdx: index("message_analytics_conversation_id_idx").on(table.conversationId),
  userIdIdx: index("message_analytics_user_id_idx").on(table.userId),
  sentimentIdx: index("message_analytics_sentiment_idx").on(table.userSentiment),
}));

export const userBehaviorPatterns = pgTable("user_behavior_patterns", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }).unique(),
  
  // Usage Patterns
  totalConversations: integer("total_conversations").notNull().default(0),
  averageConversationLength: integer("average_conversation_length"), // messages
  averageSessionDuration: integer("average_session_duration"), // minutes
  preferredTimeOfDay: text("preferred_time_of_day"), // 'morning', 'afternoon', 'evening', 'night'
  peakUsageDays: jsonb("peak_usage_days"), // Array of day names
  
  // Topic Preferences
  topTopics: jsonb("top_topics"), // Array of {topic: string, count: number}
  domainExpertise: jsonb("domain_expertise"), // {tax: 'intermediate', audit: 'beginner', etc.}
  
  // Engagement Metrics
  averageQualityScore: integer("average_quality_score"), // 0-100
  satisfactionTrend: text("satisfaction_trend"), // 'improving', 'declining', 'stable'
  churnRisk: text("churn_risk"), // 'low', 'medium', 'high'
  churnRiskScore: integer("churn_risk_score"), // 0-100
  
  // Behavioral Indicators
  frustrationFrequency: integer("frustration_frequency").notNull().default(0),
  abandonmentRate: integer("abandonment_rate"), // percentage
  followUpRate: integer("follow_up_rate"), // percentage
  
  // Predictions
  nextLikelyQuestion: text("next_likely_question"),
  nextLikelyTopic: text("next_likely_topic"),
  predictedReturnDate: timestamp("predicted_return_date"),
  
  // Value Indicators
  engagementScore: integer("engagement_score"), // 0-100
  potentialUpsellCandidate: boolean("potential_upsell_candidate").notNull().default(false),
  
  lastAnalyzedAt: timestamp("last_analyzed_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  userIdIdx: index("user_behavior_patterns_user_id_idx").on(table.userId),
  churnRiskIdx: index("user_behavior_patterns_churn_risk_idx").on(table.churnRisk),
  engagementScoreIdx: index("user_behavior_patterns_engagement_score_idx").on(table.engagementScore),
}));

export const sentimentTrends = pgTable("sentiment_trends", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  date: timestamp("date").notNull(),
  
  // Aggregated Sentiment Metrics
  averageSentimentScore: integer("average_sentiment_score"), // -100 to 100
  positiveMessageCount: integer("positive_message_count").notNull().default(0),
  neutralMessageCount: integer("neutral_message_count").notNull().default(0),
  negativeMessageCount: integer("negative_message_count").notNull().default(0),
  frustratedMessageCount: integer("frustrated_message_count").notNull().default(0),
  
  // Quality Trends
  averageQualityScore: integer("average_quality_score"), // 0-100
  conversationCount: integer("conversation_count").notNull().default(0),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  userIdDateIdx: index("sentiment_trends_user_id_date_idx").on(table.userId, table.date),
}));

// Password complexity validation helper
const passwordComplexitySchema = z.string()
  .min(12, "Password must be at least 12 characters long")
  .max(128, "Password must not exceed 128 characters")
  .regex(/[a-z]/, "Password must contain at least one lowercase letter")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[0-9]/, "Password must contain at least one number")
  .regex(/[^a-zA-Z0-9]/, "Password must contain at least one special character (!@#$%^&*)")
  .refine(
    (password) => {
      // Check for common weak passwords
      const weakPasswords = ['Password123!', 'Welcome123!', 'Admin123!', 'Qwerty123!'];
      return !weakPasswords.includes(password);
    },
    "This password is too common. Please choose a stronger password"
  );

// Zod schemas
export const insertUserSchema = createInsertSchema(users).pick({
  email: true,
  password: true,
  name: true,
}).extend({
  email: z.string().email("Please enter a valid email address"),
  password: passwordComplexitySchema,
  name: z.string().min(1, "Name is required"),
});

export const insertProfileSchema = createInsertSchema(profiles).pick({
  userId: true,
  name: true,
  type: true,
  description: true,
  isDefault: true,
}).extend({
  name: z.string().min(1, "Profile name is required").max(100),
  type: z.enum(['business', 'personal', 'family']),
  description: z.string().max(500).optional(),
});

export const insertProfileMemberSchema = createInsertSchema(profileMembers).pick({
  profileId: true,
  name: true,
  email: true,
  relationship: true,
  role: true,
}).extend({
  name: z.string().min(1, "Member name is required").max(100),
  email: z.string().email().optional(),
  relationship: z.enum(['spouse', 'child', 'parent', 'other']).optional(),
  role: z.enum(['owner', 'admin', 'member', 'viewer']).default('member'),
});

export const insertConversationSchema = createInsertSchema(conversations).pick({
  userId: true,
  profileId: true,
  title: true,
  preview: true,
});

export const insertMessageSchema = createInsertSchema(messages).pick({
  conversationId: true,
  role: true,
  content: true,
  modelUsed: true,
  routingDecision: true,
  calculationResults: true,
  tokensUsed: true,
});

export const insertUserLLMConfigSchema = createInsertSchema(userLLMConfig).pick({
  userId: true,
  provider: true,
  apiKey: true,
  modelName: true,
  endpoint: true,
  isEnabled: true,
});

export const insertSupportTicketSchema = createInsertSchema(supportTickets).pick({
  userId: true,
  subject: true,
  description: true,
  priority: true,
  category: true,
}).extend({
  subject: z.string().min(1).max(200),
  description: z.string().min(10),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
});

export const insertTicketMessageSchema = createInsertSchema(ticketMessages).pick({
  ticketId: true,
  userId: true,
  message: true,
  isInternal: true,
});

export const insertAccountingIntegrationSchema = createInsertSchema(accountingIntegrations).pick({
  userId: true,
  provider: true,
  accessToken: true,
  refreshToken: true,
  tokenExpiry: true,
  companyId: true,
  companyName: true,
});

export const insertTaxFileUploadSchema = createInsertSchema(taxFileUploads).pick({
  userId: true,
  vendor: true,
  filename: true,
  originalFilename: true,
  mimeType: true,
  byteLength: true,
  storageKey: true,
  encryptionNonce: true,
  encryptedFileKey: true,
  checksum: true,
  formType: true,
}).extend({
  vendor: z.enum(['drake', 'turbotax', 'hrblock', 'adp']),
  mimeType: z.enum(['text/csv', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/plain']),
  byteLength: z.number().max(50 * 1024 * 1024), // 50MB max
});

export const insertConversationAnalyticsSchema = createInsertSchema(conversationAnalytics).pick({
  conversationId: true,
  userId: true,
  qualityScore: true,
  responseRelevanceScore: true,
  completenessScore: true,
  clarityScore: true,
  totalMessages: true,
  averageResponseTime: true,
  conversationDuration: true,
  wasAbandoned: true,
  abandonmentPoint: true,
  followUpQuestionCount: true,
  clarificationRequestCount: true,
  userFrustrationDetected: true,
  resolutionAchieved: true,
  topicsDiscussed: true,
  domainCategories: true,
  complexityLevel: true,
  providerUsed: true,
  modelSwitchCount: true,
  fallbackTriggered: true,
});

export const insertMessageAnalyticsSchema = createInsertSchema(messageAnalytics).pick({
  messageId: true,
  conversationId: true,
  userId: true,
  userSentiment: true,
  sentimentScore: true,
  emotionalTone: true,
  responseQuality: true,
  accuracyScore: true,
  helpfulnessScore: true,
  userIntent: true,
  intentConfidence: true,
  responseLength: true,
  technicalComplexity: true,
  containsCalculations: true,
  containsCitations: true,
  processingTime: true,
});

export const insertUserBehaviorPatternsSchema = createInsertSchema(userBehaviorPatterns).pick({
  userId: true,
  totalConversations: true,
  averageConversationLength: true,
  averageSessionDuration: true,
  preferredTimeOfDay: true,
  peakUsageDays: true,
  topTopics: true,
  domainExpertise: true,
  averageQualityScore: true,
  satisfactionTrend: true,
  churnRisk: true,
  churnRiskScore: true,
  frustrationFrequency: true,
  abandonmentRate: true,
  followUpRate: true,
  nextLikelyQuestion: true,
  nextLikelyTopic: true,
  predictedReturnDate: true,
  engagementScore: true,
  potentialUpsellCandidate: true,
});

export const insertSentimentTrendsSchema = createInsertSchema(sentimentTrends).pick({
  userId: true,
  date: true,
  averageSentimentScore: true,
  positiveMessageCount: true,
  neutralMessageCount: true,
  negativeMessageCount: true,
  frustratedMessageCount: true,
  averageQualityScore: true,
  conversationCount: true,
});

// Types
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type Profile = typeof profiles.$inferSelect;
export type InsertProfile = z.infer<typeof insertProfileSchema>;
export type ProfileMember = typeof profileMembers.$inferSelect;
export type InsertProfileMember = z.infer<typeof insertProfileMemberSchema>;
export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = z.infer<typeof insertConversationSchema>;
export type Message = typeof messages.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type ModelRoutingLog = typeof modelRoutingLogs.$inferSelect;
export type UsageTracking = typeof usageTracking.$inferSelect;
export type UserLLMConfig = typeof userLLMConfig.$inferSelect;
export type InsertUserLLMConfig = z.infer<typeof insertUserLLMConfigSchema>;
export type SupportTicket = typeof supportTickets.$inferSelect;
export type InsertSupportTicket = z.infer<typeof insertSupportTicketSchema>;
export type TicketMessage = typeof ticketMessages.$inferSelect;
export type InsertTicketMessage = z.infer<typeof insertTicketMessageSchema>;
export type AuditLog = typeof auditLogs.$inferSelect;
export type AccountingIntegration = typeof accountingIntegrations.$inferSelect;
export type InsertAccountingIntegration = z.infer<typeof insertAccountingIntegrationSchema>;
export type GdprConsent = typeof gdprConsents.$inferSelect;
export type TaxFileUpload = typeof taxFileUploads.$inferSelect;
export type InsertTaxFileUpload = z.infer<typeof insertTaxFileUploadSchema>;

// Analytics Types
export type ConversationAnalytics = typeof conversationAnalytics.$inferSelect;
export type InsertConversationAnalytics = z.infer<typeof insertConversationAnalyticsSchema>;
export type MessageAnalytics = typeof messageAnalytics.$inferSelect;
export type InsertMessageAnalytics = z.infer<typeof insertMessageAnalyticsSchema>;
export type UserBehaviorPatterns = typeof userBehaviorPatterns.$inferSelect;
export type InsertUserBehaviorPatterns = z.infer<typeof insertUserBehaviorPatternsSchema>;
export type SentimentTrends = typeof sentimentTrends.$inferSelect;
export type InsertSentimentTrends = z.infer<typeof insertSentimentTrendsSchema>;
