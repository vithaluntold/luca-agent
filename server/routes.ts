import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./pgStorage";
import { aiOrchestrator } from "./services/aiOrchestrator";
import { requireAuth, getCurrentUserId } from "./middleware/auth";
import { requireAdmin } from "./middleware/admin";
import { 
  setupSecurityMiddleware,
  authRateLimiter,
  fileUploadRateLimiter,
  chatRateLimiter,
  integrationRateLimiter
} from "./middleware/security";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import multer from "multer";
import { MFAService } from "./services/mfaService";
import { 
  insertUserSchema,
  insertSupportTicketSchema,
  insertTicketMessageSchema,
  insertUserLLMConfigSchema
} from "@shared/schema";
import { z } from "zod";
import { storeEncryptedFile, retrieveEncryptedFile, secureDeleteFile, calculateChecksum } from "./utils/fileEncryption";

// Extend session type to include OAuth and MFA properties
declare module 'express-session' {
  interface SessionData {
    oauthState?: string;
    oauthProvider?: string;
    oauthUserId?: string;
    tempMFASecret?: string;
  }
}

// Configure multer for memory storage (files are encrypted before disk storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max
  },
  fileFilter: (req, file, cb) => {
    // Allow only specific MIME types
    const allowedMimes = [
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain'
    ];
    
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only CSV, Excel, and text files are allowed.'));
    }
  }
});

export async function registerRoutes(app: Express): Promise<Server> {
  // Apply military-grade security middleware
  setupSecurityMiddleware(app);
  
  // Authentication routes (with rate limiting)
  app.post("/api/auth/register", authRateLimiter, async (req, res) => {
    try {
      const validatedData = insertUserSchema.parse(req.body);
      
      // Check if user exists
      const existing = await storage.getUserByEmail(validatedData.email);
      if (existing) {
        return res.status(400).json({ error: "Email already registered" });
      }
      
      // Hash password
      const hashedPassword = await bcrypt.hash(validatedData.password, 10);
      
      // Create user
      const user = await storage.createUser({
        ...validatedData,
        password: hashedPassword
      });
      
      // Establish session
      req.session.userId = user.id;
      
      // Don't send password back
      const { password, ...userWithoutPassword } = user;
      res.json({ user: userWithoutPassword });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Registration failed" });
    }
  });

  app.post("/api/auth/login", authRateLimiter, async (req, res) => {
    try {
      const { email, password } = req.body;
      
      const user = await storage.getUserByEmail(email);
      if (!user) {
        return res.status(401).json({ error: "Invalid credentials" });
      }
      
      // Check if account is locked
      const isLocked = await storage.isAccountLocked(user.id);
      if (isLocked) {
        const lockoutMinutes = user.lockedUntil 
          ? Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000)
          : 30;
        return res.status(423).json({ 
          error: `Account is locked due to too many failed login attempts. Please try again in ${lockoutMinutes} minutes.`,
          lockedUntil: user.lockedUntil
        });
      }
      
      const validPassword = await bcrypt.compare(password, user.password);
      if (!validPassword) {
        // Track failed login attempt
        await storage.incrementFailedLoginAttempts(user.id);
        const updatedUser = await storage.getUser(user.id);
        const remainingAttempts = 5 - (updatedUser?.failedLoginAttempts || 0);
        
        if (remainingAttempts <= 0) {
          return res.status(423).json({ 
            error: "Account locked due to too many failed login attempts. Please try again in 30 minutes."
          });
        } else if (remainingAttempts <= 2) {
          return res.status(401).json({ 
            error: `Invalid credentials. ${remainingAttempts} attempt${remainingAttempts === 1 ? '' : 's'} remaining before account lockout.`
          });
        }
        
        return res.status(401).json({ error: "Invalid credentials" });
      }
      
      // Check if MFA is enabled for this user
      if (user.mfaEnabled) {
        // Don't establish session yet - require MFA verification first
        return res.status(200).json({ 
          mfaRequired: true,
          userId: user.id,
          message: "Please enter your 2FA code"
        });
      }
      
      // Reset failed login attempts on successful login
      await storage.resetFailedLoginAttempts(user.id);
      
      // Establish session
      req.session.userId = user.id;
      
      const { password: _, mfaSecret, mfaBackupCodes, ...userWithoutSensitive } = user;
      res.json({ user: userWithoutSensitive });
    } catch (error) {
      res.status(500).json({ error: "Login failed" });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ error: "Logout failed" });
      }
      res.json({ success: true });
    });
  });

  app.get("/api/auth/me", requireAuth, async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      const { password, mfaSecret, mfaBackupCodes, ...userWithoutSensitive } = user;
      res.json({ user: userWithoutSensitive });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch user" });
    }
  });

  // MFA/2FA Routes
  app.post("/api/mfa/setup", requireAuth, async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Generate new MFA secret
      const { secret, otpauthUrl } = MFAService.generateSecret(user.email);
      const qrCode = await MFAService.generateQRCode(otpauthUrl);
      
      // Store secret temporarily in session for verification
      req.session.tempMFASecret = secret;
      
      res.json({ 
        secret, 
        qrCode,
        message: "Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.)"
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to setup MFA" });
    }
  });

  app.post("/api/mfa/enable", requireAuth, async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const { token } = req.body;
      const tempSecret = req.session.tempMFASecret;
      
      if (!tempSecret) {
        return res.status(400).json({ error: "No MFA setup in progress. Please start setup first." });
      }
      
      // Verify token
      const isValid = MFAService.verifyToken(tempSecret, token);
      if (!isValid) {
        return res.status(400).json({ error: "Invalid verification code. Please try again." });
      }
      
      // Generate backup codes
      const backupCodes = MFAService.generateBackupCodes(10);
      
      // Encrypt secret and backup codes
      const encryptedSecret = MFAService.encryptSecret(tempSecret);
      const encryptedBackupCodes = MFAService.encryptBackupCodes(backupCodes);
      
      // Enable MFA
      await storage.enableMFA(userId, encryptedSecret, encryptedBackupCodes);
      
      // Clear temp secret
      delete req.session.tempMFASecret;
      
      res.json({ 
        success: true,
        backupCodes,
        message: "MFA enabled successfully. Please save your backup codes in a secure location."
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to enable MFA" });
    }
  });

  app.post("/api/mfa/disable", requireAuth, async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const { password } = req.body;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Verify password before disabling MFA
      const validPassword = await bcrypt.compare(password, user.password);
      if (!validPassword) {
        return res.status(401).json({ error: "Invalid password" });
      }
      
      await storage.disableMFA(userId);
      
      res.json({ success: true, message: "MFA disabled successfully" });
    } catch (error) {
      res.status(500).json({ error: "Failed to disable MFA" });
    }
  });

  app.post("/api/mfa/verify", async (req, res) => {
    try {
      const { userId, token, useBackupCode } = req.body;
      
      if (!userId || !token) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      
      const user = await storage.getUser(userId);
      if (!user || !user.mfaEnabled || !user.mfaSecret) {
        return res.status(400).json({ error: "MFA not enabled for this user" });
      }
      
      let isValid = false;
      
      if (useBackupCode) {
        // Verify backup code
        const backupCodes = user.mfaBackupCodes || [];
        const result = MFAService.verifyBackupCode(token, backupCodes);
        
        if (result.valid) {
          // Update backup codes (remove used code)
          await storage.updateMFABackupCodes(userId, result.remainingCodes);
          isValid = true;
        }
      } else {
        // Verify TOTP token
        const decryptedSecret = MFAService.decryptSecret(user.mfaSecret);
        isValid = MFAService.verifyToken(decryptedSecret, token);
      }
      
      if (!isValid) {
        return res.status(401).json({ error: "Invalid verification code" });
      }
      
      // Reset failed login attempts on successful MFA
      await storage.resetFailedLoginAttempts(userId);
      
      // Establish session
      req.session.userId = userId;
      
      const { password: _, mfaSecret, mfaBackupCodes, ...userWithoutSensitive } = user;
      res.json({ user: userWithoutSensitive });
    } catch (error) {
      res.status(500).json({ error: "Failed to verify MFA" });
    }
  });

  // Conversation routes (auth required)
  app.get("/api/conversations", requireAuth, async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const conversations = await storage.getUserConversations(userId);
      res.json({ conversations });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch conversations" });
    }
  });

  app.post("/api/conversations", requireAuth, async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const { title, preview } = req.body;
      
      const conversation = await storage.createConversation({
        userId,
        title,
        preview
      });
      
      res.json({ conversation });
    } catch (error) {
      res.status(500).json({ error: "Failed to create conversation" });
    }
  });

  app.get("/api/conversations/:id/messages", requireAuth, async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const { id } = req.params;
      
      // Verify conversation ownership
      const conversation = await storage.getConversation(id);
      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }
      
      if (conversation.userId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      const messages = await storage.getConversationMessages(id);
      res.json({ messages });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch messages" });
    }
  });

  // Chat endpoint - the main intelligence interface (auth required)
  app.post("/api/chat", requireAuth, chatRateLimiter, async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const { conversationId, message } = req.body;
      
      if (!message) {
        return res.status(400).json({ error: "Message required" });
      }
      
      // Get user for subscription tier
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Check usage limits
      const currentMonth = new Date().toISOString().slice(0, 7);
      const usage = await storage.getUsageForMonth(userId, currentMonth);
      
      if (user.subscriptionTier === 'free' && usage && usage.queriesUsed >= 100) {
        return res.status(429).json({ 
          error: "Monthly query limit reached. Please upgrade to continue." 
        });
      }
      
      // Get conversation history
      let conversation;
      if (conversationId) {
        conversation = await storage.getConversation(conversationId);
        
        if (!conversation) {
          return res.status(404).json({ error: "Conversation not found" });
        }
        
        // Verify conversation ownership
        if (conversation.userId !== userId) {
          return res.status(403).json({ error: "Access denied" });
        }
      } else {
        // Create new conversation
        conversation = await storage.createConversation({
          userId,
          title: message.slice(0, 50) + (message.length > 50 ? '...' : ''),
          preview: message.slice(0, 100)
        });
      }
      
      const history = await storage.getConversationMessages(conversation.id);
      const conversationHistory = history.map(msg => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content
      }));
      
      // Save user message
      await storage.createMessage({
        conversationId: conversation.id,
        role: 'user',
        content: message,
        modelUsed: null,
        routingDecision: null,
        calculationResults: null,
        tokensUsed: null
      });
      
      // Process query through AI orchestrator
      const result = await aiOrchestrator.processQuery(
        message,
        conversationHistory,
        user.subscriptionTier
      );
      
      // Save assistant message
      const assistantMessage = await storage.createMessage({
        conversationId: conversation.id,
        role: 'assistant',
        content: result.response,
        modelUsed: result.modelUsed,
        routingDecision: result.routingDecision,
        calculationResults: result.calculationResults,
        tokensUsed: result.tokensUsed
      });
      
      // Create routing log
      await storage.createRoutingLog({
        messageId: assistantMessage.id,
        queryClassification: result.classification,
        selectedModel: result.modelUsed,
        routingReason: result.routingDecision.reasoning,
        confidence: Math.round(result.classification.confidence * 100),
        alternativeModels: result.routingDecision.fallbackModels,
        processingTimeMs: result.processingTimeMs
      });
      
      // Update usage tracking
      await storage.incrementUsage(userId, currentMonth, 1, 0, result.tokensUsed);
      
      // Update conversation
      await storage.updateConversation(conversation.id, {
        preview: message.slice(0, 100),
        updatedAt: new Date()
      });
      
      res.json({
        conversationId: conversation.id,
        message: {
          id: assistantMessage.id,
          role: 'assistant',
          content: result.response,
          timestamp: assistantMessage.createdAt
        },
        metadata: {
          modelUsed: result.modelUsed,
          classification: result.classification,
          calculationResults: result.calculationResults,
          tokensUsed: result.tokensUsed,
          processingTimeMs: result.processingTimeMs
        }
      });
    } catch (error: any) {
      console.error('Chat error:', error);
      res.status(500).json({ error: "Failed to process message" });
    }
  });

  // Usage tracking endpoint (auth required)
  app.get("/api/usage", requireAuth, async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const currentMonth = new Date().toISOString().slice(0, 7);
      const usage = await storage.getUsageForMonth(userId, currentMonth);
      
      res.json({ usage: usage || { queriesUsed: 0, documentsAnalyzed: 0, tokensUsed: 0 } });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch usage" });
    }
  });

  // Subscription management (auth required)
  app.post("/api/subscription/upgrade", requireAuth, async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const { tier } = req.body;
      
      const user = await storage.updateUserSubscription(userId, tier);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      const { password, ...userWithoutPassword } = user;
      res.json({ user: userWithoutPassword });
    } catch (error) {
      res.status(500).json({ error: "Failed to update subscription" });
    }
  });

  // User LLM Configuration routes (auth required)
  app.get("/api/llm-config", requireAuth, async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      if (!userId) return res.status(401).json({ error: "Not authenticated" });
      
      const config = await storage.getUserLLMConfig(userId, true);
      res.json({ config });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch LLM config" });
    }
  });

  app.post("/api/llm-config", requireAuth, async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      if (!userId) return res.status(401).json({ error: "Not authenticated" });
      
      const validatedData = insertUserLLMConfigSchema.omit({ userId: true }).parse(req.body);
      
      const config = await storage.upsertUserLLMConfig({
        userId,
        ...validatedData
      });
      
      await storage.createAuditLog({
        userId,
        action: 'UPDATE_LLM_CONFIG',
        resourceType: 'llm_config',
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      });
      
      const maskedConfig = await storage.getUserLLMConfig(userId, true);
      res.json({ config: maskedConfig });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Failed to update LLM config" });
    }
  });

  // Support Ticket routes (auth required)
  app.get("/api/tickets", requireAuth, async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      if (!userId) return res.status(401).json({ error: "Not authenticated" });
      
      const tickets = await storage.getUserSupportTickets(userId);
      res.json({ tickets });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch tickets" });
    }
  });

  app.post("/api/tickets", requireAuth, async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      if (!userId) return res.status(401).json({ error: "Not authenticated" });
      
      const validatedData = insertSupportTicketSchema.omit({ userId: true }).parse(req.body);
      
      const ticket = await storage.createSupportTicket({
        userId,
        ...validatedData
      });
      
      res.json({ ticket });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Failed to create ticket" });
    }
  });

  app.get("/api/tickets/:id", requireAuth, async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      if (!userId) return res.status(401).json({ error: "Not authenticated" });
      
      const ticket = await storage.getSupportTicket(req.params.id);
      if (!ticket || ticket.userId !== userId) {
        return res.status(404).json({ error: "Ticket not found" });
      }
      
      const messages = await storage.getTicketMessages(req.params.id);
      res.json({ ticket, messages });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch ticket" });
    }
  });

  app.post("/api/tickets/:id/messages", requireAuth, async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      if (!userId) return res.status(401).json({ error: "Not authenticated" });
      
      const ticket = await storage.getSupportTicket(req.params.id);
      if (!ticket || ticket.userId !== userId) {
        return res.status(404).json({ error: "Ticket not found" });
      }
      
      const validatedData = insertTicketMessageSchema.omit({ ticketId: true, userId: true }).parse(req.body);
      
      const ticketMessage = await storage.createTicketMessage({
        ticketId: req.params.id,
        userId,
        ...validatedData,
        isInternal: false
      });
      
      res.json({ message: ticketMessage });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Failed to send message" });
    }
  });

  // GDPR routes (auth required)
  app.post("/api/gdpr/consent", requireAuth, async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      if (!userId) return res.status(401).json({ error: "Not authenticated" });
      
      const schema = z.object({
        consentType: z.string().min(1),
        consented: z.boolean()
      });
      
      const validatedData = schema.parse(req.body);
      
      const consent = await storage.createGdprConsent({
        userId,
        ...validatedData,
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      });
      
      await storage.createAuditLog({
        userId,
        action: 'GDPR_CONSENT',
        resourceType: 'gdpr_consent',
        details: validatedData,
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      });
      
      res.json({ consent });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Failed to record consent" });
    }
  });

  app.get("/api/gdpr/export", requireAuth, async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      if (!userId) return res.status(401).json({ error: "Not authenticated" });
      
      await storage.createAuditLog({
        userId,
        action: 'GDPR_EXPORT_DATA',
        resourceType: 'user',
        resourceId: userId,
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      });
      
      const data = await storage.exportUserData(userId);
      
      res.json({ data });
    } catch (error) {
      res.status(500).json({ error: "Failed to export data" });
    }
  });

  app.delete("/api/gdpr/delete-account", requireAuth, async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      if (!userId) return res.status(401).json({ error: "Not authenticated" });
      
      await storage.createAuditLog({
        userId,
        action: 'GDPR_DELETE_ACCOUNT',
        resourceType: 'user',
        resourceId: userId,
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      });
      
      await storage.deleteUserData(userId);
      
      req.session.destroy(() => {});
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete account" });
    }
  });

  // Admin routes (admin access required)
  app.get("/api/admin/dashboard", requireAuth, requireAdmin, async (req, res) => {
    try {
      const kpis = await storage.getAdminKPIs();
      res.json({ kpis });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch dashboard data" });
    }
  });

  app.get("/api/admin/users", requireAuth, requireAdmin, async (req, res) => {
    try {
      const users = await storage.getAllUsers();
      const sanitizedUsers = users.map(({ password, ...user }) => user);
      res.json({ users: sanitizedUsers });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  app.get("/api/admin/tickets", requireAuth, requireAdmin, async (req, res) => {
    try {
      const tickets = await storage.getAllSupportTickets();
      res.json({ tickets });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch tickets" });
    }
  });

  app.patch("/api/admin/tickets/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      const schema = z.object({
        status: z.enum(['open', 'in_progress', 'resolved', 'closed']).optional(),
        priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
        assignedTo: z.string().nullable().optional(),
        resolution: z.string().optional()
      });
      
      const validatedData = schema.parse(req.body);
      const userId = getCurrentUserId(req);
      
      const updates: any = { ...validatedData };
      if (validatedData.status === 'resolved' || validatedData.status === 'closed') {
        updates.resolvedAt = new Date();
      }
      
      const ticket = await storage.updateSupportTicket(req.params.id, updates);
      
      await storage.createAuditLog({
        userId: userId || undefined,
        action: 'UPDATE_TICKET',
        resourceType: 'ticket',
        resourceId: req.params.id,
        details: updates,
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      });
      
      res.json({ ticket });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Failed to update ticket" });
    }
  });

  app.post("/api/admin/tickets/:id/messages", requireAuth, requireAdmin, async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      if (!userId) return res.status(401).json({ error: "Not authenticated" });
      
      const validatedData = insertTicketMessageSchema.omit({ ticketId: true, userId: true }).parse(req.body);
      
      const ticketMessage = await storage.createTicketMessage({
        ticketId: req.params.id,
        userId,
        ...validatedData
      });
      
      res.json({ message: ticketMessage });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Failed to send message" });
    }
  });

  app.get("/api/admin/audit-logs", requireAuth, requireAdmin, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const logs = await storage.getAuditLogs(limit);
      res.json({ logs });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch audit logs" });
    }
  });

  app.patch("/api/admin/users/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      const schema = z.object({
        subscriptionTier: z.enum(['free', 'professional', 'enterprise']).optional(),
        isAdmin: z.boolean().optional()
      });
      
      const validatedData = schema.parse(req.body);
      const adminUserId = getCurrentUserId(req);
      
      // Prevent removing own admin status
      if (req.params.id === adminUserId && validatedData.isAdmin === false) {
        return res.status(400).json({ error: "Cannot remove your own admin status" });
      }
      
      const user = await storage.getUser(req.params.id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Only update tier if provided
      if (validatedData.subscriptionTier) {
        await storage.updateUserSubscription(req.params.id, validatedData.subscriptionTier);
      }
      
      await storage.createAuditLog({
        userId: adminUserId || undefined,
        action: 'UPDATE_USER',
        resourceType: 'user',
        resourceId: req.params.id,
        details: validatedData,
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      });
      
      const updatedUser = await storage.getUser(req.params.id);
      const { password, ...sanitizedUser } = updatedUser!;
      res.json({ user: sanitizedUser });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Failed to update user" });
    }
  });

  // Accounting Integration Routes
  app.get("/api/integrations", requireAuth, async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      if (!userId) return res.status(401).json({ error: "Not authenticated" });
      
      const integrations = await storage.getUserAccountingIntegrations(userId);
      res.json({ integrations });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch integrations" });
    }
  });

  app.post("/api/integrations/:provider/initiate", requireAuth, integrationRateLimiter, async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      if (!userId) return res.status(401).json({ error: "Not authenticated" });
      
      const { provider } = req.params;
      const { AccountingIntegrationService } = await import('./services/accountingIntegrations');
      
      // Generate and store state for CSRF protection
      const state = crypto.randomBytes(32).toString('hex');
      req.session.oauthState = state;
      req.session.oauthProvider = provider;
      req.session.oauthUserId = userId;
      
      // Build redirect URI
      const baseUrl = process.env.REPLIT_DEV_DOMAIN 
        ? `https://${process.env.REPLIT_DEV_DOMAIN}`
        : `http://localhost:5000`;
      const redirectUri = `${baseUrl}/api/integrations/callback`;
      
      let authUrl: string;
      
      // Generate provider-specific OAuth URLs
      if (provider === 'quickbooks') {
        const clientId = process.env.QUICKBOOKS_CLIENT_ID || 'DEMO_QB_CLIENT_ID';
        const scope = 'com.intuit.quickbooks.accounting';
        authUrl = `https://appcenter.intuit.com/connect/oauth2?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}&state=${state}`;
      } else if (provider === 'xero') {
        const clientId = process.env.XERO_CLIENT_ID || 'DEMO_XERO_CLIENT_ID';
        const scope = 'offline_access accounting.transactions accounting.contacts accounting.settings';
        authUrl = `https://login.xero.com/identity/connect/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}&state=${state}`;
      } else if (provider === 'zoho') {
        const clientId = process.env.ZOHO_CLIENT_ID || 'DEMO_ZOHO_CLIENT_ID';
        const scope = 'ZohoBooks.fullaccess.all';
        const dataCenterLocation = process.env.ZOHO_DATA_CENTER || 'com';
        authUrl = `https://accounts.zoho.${dataCenterLocation}/oauth/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}&state=${state}&access_type=offline`;
      } else if (provider === 'adp') {
        authUrl = AccountingIntegrationService.getADPAuthUrl(redirectUri, state);
      } else {
        return res.status(400).json({ error: "Unsupported provider" });
      }
      
      res.json({ authUrl, provider });
    } catch (error) {
      res.status(500).json({ error: "Failed to initiate integration" });
    }
  });

  app.get("/api/integrations/callback", async (req, res) => {
    try {
      const { code, state, realmId } = req.query;
      
      // Verify state to prevent CSRF
      if (!state || state !== req.session.oauthState) {
        return res.status(400).send('Invalid state parameter');
      }
      
      const provider = req.session.oauthProvider;
      const userId = req.session.oauthUserId;
      
      if (!provider || !userId) {
        return res.status(400).send('Session expired. Please try again.');
      }
      
      // Exchange code for tokens
      const { AccountingIntegrationService } = await import('./services/accountingIntegrations');
      const { encryptApiKey } = await import('./utils/encryption');
      
      let accessToken: string;
      let refreshToken: string;
      let expiresIn: number;
      let companyId: string | null = null;
      let companyName: string | null = null;
      
      const baseUrl = process.env.REPLIT_DEV_DOMAIN 
        ? `https://${process.env.REPLIT_DEV_DOMAIN}`
        : `http://localhost:5000`;
      const redirectUri = `${baseUrl}/api/integrations/callback`;
      
      if (provider === 'quickbooks') {
        const config = {
          clientId: process.env.QUICKBOOKS_CLIENT_ID || 'DEMO_QB_CLIENT_ID',
          clientSecret: process.env.QUICKBOOKS_CLIENT_SECRET || 'DEMO_QB_SECRET',
          redirectUri,
          environment: (process.env.QUICKBOOKS_ENV as 'sandbox' | 'production') || 'sandbox'
        };
        
        const tokens = await AccountingIntegrationService.exchangeQuickBooksCode(config, code as string);
        accessToken = tokens.accessToken;
        refreshToken = tokens.refreshToken;
        expiresIn = tokens.expiresIn;
        companyId = realmId as string || null;
        
        // Fetch company info
        if (companyId) {
          try {
            const companyInfo = await AccountingIntegrationService.getQuickBooksCompanyInfo(
              accessToken,
              companyId,
              config.environment
            );
            companyName = companyInfo.name;
          } catch (err) {
            console.error('Failed to fetch QuickBooks company info:', err);
          }
        }
      } else if (provider === 'xero') {
        const config = {
          clientId: process.env.XERO_CLIENT_ID || 'DEMO_XERO_CLIENT_ID',
          clientSecret: process.env.XERO_CLIENT_SECRET || 'DEMO_XERO_SECRET',
          redirectUri
        };
        
        const tokens = await AccountingIntegrationService.exchangeXeroCode(config, code as string);
        accessToken = tokens.accessToken;
        refreshToken = tokens.refreshToken;
        expiresIn = tokens.expiresIn;
      } else if (provider === 'zoho') {
        const config = {
          clientId: process.env.ZOHO_CLIENT_ID || 'DEMO_ZOHO_CLIENT_ID',
          clientSecret: process.env.ZOHO_CLIENT_SECRET || 'DEMO_ZOHO_SECRET',
          redirectUri,
          dataCenterLocation: process.env.ZOHO_DATA_CENTER || 'com'
        };
        
        const tokens = await AccountingIntegrationService.exchangeZohoCode(config, code as string);
        accessToken = tokens.accessToken;
        refreshToken = tokens.refreshToken;
        expiresIn = tokens.expiresIn;
      } else if (provider === 'adp') {
        const tokens = await AccountingIntegrationService.exchangeADPCode(code as string, redirectUri);
        accessToken = tokens.accessToken;
        refreshToken = tokens.refreshToken;
        expiresIn = tokens.expiresIn;
        
        // Fetch company info
        try {
          const companyInfo = await AccountingIntegrationService.fetchADPCompanyInfo(accessToken);
          companyId = companyInfo.companyId;
          companyName = companyInfo.companyName;
        } catch (err) {
          console.error('Failed to fetch ADP company info:', err);
        }
      } else {
        return res.status(400).send('Unsupported provider');
      }
      
      // Encrypt tokens before storing
      const encryptedAccessToken = encryptApiKey(accessToken);
      const encryptedRefreshToken = encryptApiKey(refreshToken);
      
      // Store integration in database
      const tokenExpiry = new Date(Date.now() + expiresIn * 1000);
      await storage.createAccountingIntegration({
        userId,
        provider,
        accessToken: encryptedAccessToken,
        refreshToken: encryptedRefreshToken,
        tokenExpiry,
        companyId,
        companyName
      });
      
      // Audit log
      await storage.createAuditLog({
        userId,
        action: 'CONNECT_INTEGRATION',
        resourceType: 'integration',
        resourceId: provider,
        details: { provider, companyName },
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      });
      
      // Clear session
      delete req.session.oauthState;
      delete req.session.oauthProvider;
      delete req.session.oauthUserId;
      
      // Redirect back to integrations page
      res.redirect('/integrations?success=true&provider=' + provider);
    } catch (error) {
      console.error('OAuth callback error:', error);
      res.redirect('/integrations?error=true&message=' + encodeURIComponent((error as Error).message));
    }
  });

  app.delete("/api/integrations/:id", requireAuth, async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      if (!userId) return res.status(401).json({ error: "Not authenticated" });
      
      const success = await storage.deleteAccountingIntegration(req.params.id);
      
      await storage.createAuditLog({
        userId,
        action: 'DELETE_INTEGRATION',
        resourceType: 'integration',
        resourceId: req.params.id,
        details: {},
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      });
      
      res.json({ success });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete integration" });
    }
  });

  // Tax File Upload Routes (Drake, TurboTax, H&R Block, ADP)
  app.post("/api/tax-files/upload", requireAuth, fileUploadRateLimiter, upload.single('file'), async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      if (!userId) return res.status(401).json({ error: "Not authenticated" });
      
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }
      
      const { vendor, formType } = req.body;
      
      if (!vendor || !['drake', 'turbotax', 'hrblock', 'adp'].includes(vendor)) {
        return res.status(400).json({ error: "Invalid vendor" });
      }
      
      // Validate file size
      if (req.file.size > 50 * 1024 * 1024) {
        return res.status(400).json({ error: "File too large. Maximum size is 50MB" });
      }
      
      // Calculate checksum before encryption
      const checksum = calculateChecksum(req.file.buffer);
      
      // Encrypt and store file
      const { storageKey, nonce, encryptedFileKey } = await storeEncryptedFile(
        req.file.buffer,
        req.file.originalname
      );
      
      // Create database record
      const fileUpload = await storage.createTaxFileUpload({
        userId,
        vendor,
        filename: `${vendor}-${Date.now()}-${req.file.originalname}`,
        originalFilename: req.file.originalname,
        mimeType: req.file.mimetype as 'text/csv' | 'application/vnd.ms-excel' | 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' | 'text/plain',
        byteLength: req.file.size,
        storageKey,
        encryptionNonce: nonce,
        encryptedFileKey,
        checksum,
        formType: formType || null
      });
      
      // Audit log
      await storage.createAuditLog({
        userId,
        action: 'UPLOAD_TAX_FILE',
        resourceType: 'tax_file',
        resourceId: fileUpload.id,
        details: { vendor, filename: req.file.originalname, size: req.file.size },
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      });
      
      res.json({ 
        success: true, 
        file: {
          id: fileUpload.id,
          filename: fileUpload.originalFilename,
          vendor: fileUpload.vendor,
          size: fileUpload.byteLength,
          scanStatus: fileUpload.scanStatus,
          uploadedAt: fileUpload.createdAt
        }
      });
    } catch (error) {
      console.error('File upload error:', error);
      res.status(500).json({ error: "File upload failed" });
    }
  });

  app.get("/api/tax-files", requireAuth, async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      if (!userId) return res.status(401).json({ error: "Not authenticated" });
      
      const { vendor } = req.query;
      const files = await storage.getUserTaxFileUploads(userId, vendor as string | undefined);
      
      // Filter out deleted files and sensitive metadata
      const sanitizedFiles = files
        .filter(f => !f.deletedAt)
        .map(f => ({
          id: f.id,
          vendor: f.vendor,
          filename: f.originalFilename,
          formType: f.formType,
          size: f.byteLength,
          scanStatus: f.scanStatus,
          importStatus: f.importStatus,
          uploadedAt: f.createdAt
        }));
      
      res.json({ files: sanitizedFiles });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch files" });
    }
  });

  app.get("/api/tax-files/:id/download", requireAuth, async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      if (!userId) return res.status(401).json({ error: "Not authenticated" });
      
      const fileUpload = await storage.getTaxFileUpload(req.params.id);
      
      if (!fileUpload) {
        return res.status(404).json({ error: "File not found" });
      }
      
      if (fileUpload.userId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      if (fileUpload.deletedAt) {
        return res.status(404).json({ error: "File has been deleted" });
      }
      
      // Only allow download of clean files
      if (fileUpload.scanStatus !== 'clean') {
        return res.status(403).json({ 
          error: "File not available for download",
          scanStatus: fileUpload.scanStatus 
        });
      }
      
      // Decrypt and retrieve file
      const decryptedData = await retrieveEncryptedFile(
        fileUpload.storageKey,
        fileUpload.encryptedFileKey,
        fileUpload.encryptionNonce
      );
      
      // Verify checksum
      const fileChecksum = calculateChecksum(decryptedData);
      if (fileChecksum !== fileUpload.checksum) {
        throw new Error('File integrity check failed');
      }
      
      // Send file
      res.setHeader('Content-Type', fileUpload.mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${fileUpload.originalFilename}"`);
      res.send(decryptedData);
      
      // Audit log
      await storage.createAuditLog({
        userId,
        action: 'DOWNLOAD_TAX_FILE',
        resourceType: 'tax_file',
        resourceId: fileUpload.id,
        details: { filename: fileUpload.originalFilename },
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      });
    } catch (error) {
      console.error('File download error:', error);
      res.status(500).json({ error: "File download failed" });
    }
  });

  app.delete("/api/tax-files/:id", requireAuth, async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      if (!userId) return res.status(401).json({ error: "Not authenticated" });
      
      const fileUpload = await storage.getTaxFileUpload(req.params.id);
      
      if (!fileUpload) {
        return res.status(404).json({ error: "File not found" });
      }
      
      if (fileUpload.userId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      // Soft delete in database
      await storage.deleteTaxFileUpload(req.params.id);
      
      // Securely delete physical file
      await secureDeleteFile(fileUpload.storageKey);
      
      // Audit log
      await storage.createAuditLog({
        userId,
        action: 'DELETE_TAX_FILE',
        resourceType: 'tax_file',
        resourceId: req.params.id,
        details: { filename: fileUpload.originalFilename },
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      });
      
      res.json({ success: true });
    } catch (error) {
      console.error('File deletion error:', error);
      res.status(500).json({ error: "File deletion failed" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
