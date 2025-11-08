import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./pgStorage";
import { aiOrchestrator } from "./services/aiOrchestrator";
import { requireAuth, getCurrentUserId } from "./middleware/auth";
import { requireAdmin } from "./middleware/admin";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { 
  insertUserSchema,
  insertSupportTicketSchema,
  insertTicketMessageSchema,
  insertUserLLMConfigSchema
} from "@shared/schema";
import { z } from "zod";

export async function registerRoutes(app: Express): Promise<Server> {
  // Authentication routes (no auth required)
  app.post("/api/auth/register", async (req, res) => {
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

  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = req.body;
      
      const user = await storage.getUserByEmail(email);
      if (!user) {
        return res.status(401).json({ error: "Invalid credentials" });
      }
      
      const validPassword = await bcrypt.compare(password, user.password);
      if (!validPassword) {
        return res.status(401).json({ error: "Invalid credentials" });
      }
      
      // Establish session
      req.session.userId = user.id;
      
      const { password: _, ...userWithoutPassword } = user;
      res.json({ user: userWithoutPassword });
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
      
      const { password, ...userWithoutPassword } = user;
      res.json({ user: userWithoutPassword });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch user" });
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
  app.post("/api/chat", requireAuth, async (req, res) => {
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

  app.post("/api/integrations/:provider/initiate", requireAuth, async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      if (!userId) return res.status(401).json({ error: "Not authenticated" });
      
      const { provider } = req.params;
      
      // Store state in session for OAuth callback verification
      req.session.oauthState = crypto.randomBytes(32).toString('hex');
      req.session.oauthProvider = provider;
      
      // For now, return placeholder - actual OAuth requires environment configuration
      res.json({ 
        message: "OAuth integration coming soon",
        provider,
        note: "Please ensure ENCRYPTION_KEY is set and configure OAuth credentials for " + provider
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to initiate integration" });
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

  const httpServer = createServer(app);
  return httpServer;
}
