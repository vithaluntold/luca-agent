import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { aiOrchestrator } from "./services/aiOrchestrator";
import { requireAuth, getCurrentUserId } from "./middleware/auth";
import bcrypt from "bcryptjs";
import { insertUserSchema } from "@shared/schema";
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

  const httpServer = createServer(app);
  return httpServer;
}
