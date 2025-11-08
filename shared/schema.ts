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
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  userIdProfileIdUpdatedAtIdx: index("conversations_user_profile_updated_idx")
    .on(table.userId, table.profileId, table.updatedAt),
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
