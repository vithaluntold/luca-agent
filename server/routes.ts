import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./pgStorage";
import { aiOrchestrator } from "./services/aiOrchestrator";
import { AnalyticsProcessor } from "./services/analyticsProcessor";
import { providerHealthMonitor, aiProviderRegistry, AIProviderName } from "./services/aiProviders";
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
import { DocumentExporter } from "./services/documentExporter";
import { 
  insertUserSchema,
  insertSupportTicketSchema,
  insertTicketMessageSchema,
  insertUserLLMConfigSchema,
  updateConversationFeedbackSchema
} from "@shared/schema";
import { z } from "zod";
import { storeEncryptedFile, retrieveEncryptedFile, secureDeleteFile, calculateChecksum } from "./utils/fileEncryption";
// WebSocket removed - now using SSE for chat streaming
// import { setupWebSocket } from "./websocket";

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
    // Supports: Azure Document Intelligence formats + Excel/CSV for data analysis
    const allowedMimes = [
      // Azure Document Intelligence supported formats
      'application/pdf',
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/tiff',
      'image/tif',
      // Spreadsheet formats for financial data
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'application/vnd.ms-excel', // .xls
      'text/csv', // .csv
      'text/plain' // .txt
    ];
    
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Supported formats: PDF, PNG, JPEG, TIFF, Excel (XLSX, XLS), CSV, TXT'));
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
      
      // CRITICAL: Explicitly save session before responding
      await new Promise<void>((resolve, reject) => {
        req.session.save((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      
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
      
      // CRITICAL: Explicitly save session before responding
      await new Promise<void>((resolve, reject) => {
        req.session.save((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      
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
      
      // CRITICAL: Explicitly save session before responding
      await new Promise<void>((resolve, reject) => {
        req.session.save((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      
      const { password: _, mfaSecret, mfaBackupCodes, ...userWithoutSensitive } = user;
      res.json({ user: userWithoutSensitive });
    } catch (error) {
      res.status(500).json({ error: "Failed to verify MFA" });
    }
  });

  // Profile routes (auth required)
  app.get("/api/profiles", requireAuth, async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const profiles = await storage.getUserProfiles(userId);
      res.json({ profiles });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch profiles" });
    }
  });

  app.get("/api/profiles/:id", requireAuth, async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const profile = await storage.getProfile(req.params.id);
      if (!profile || profile.userId !== userId) {
        return res.status(404).json({ error: "Profile not found" });
      }
      
      res.json({ profile });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch profile" });
    }
  });

  app.post("/api/profiles", requireAuth, async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const { name, type, description, isDefault } = req.body;
      
      // Validate profile type
      if (!['business', 'personal', 'family'].includes(type)) {
        return res.status(400).json({ error: "Invalid profile type" });
      }
      
      // Ensure only one personal profile per user
      if (type === 'personal') {
        const existingProfiles = await storage.getUserProfiles(userId);
        const personalExists = existingProfiles.some(p => p.type === 'personal');
        if (personalExists) {
          return res.status(409).json({ error: "User already has a personal profile" });
        }
      }
      
      const profile = await storage.createProfile({
        userId,
        name,
        type,
        description,
        isDefault: isDefault || false
      });
      
      res.json({ profile });
    } catch (error: any) {
      // Handle constraint violations
      if (error.message && error.message.includes('already has a personal profile')) {
        return res.status(409).json({ error: "User already has a personal profile" });
      }
      // Handle database unique constraint violation (23505)
      if (error.code === '23505' && error.constraint === 'profiles_user_personal_unique_idx') {
        return res.status(409).json({ error: "User already has a personal profile" });
      }
      res.status(500).json({ error: "Failed to create profile" });
    }
  });

  app.patch("/api/profiles/:id", requireAuth, async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const profile = await storage.getProfile(req.params.id);
      if (!profile || profile.userId !== userId) {
        return res.status(404).json({ error: "Profile not found" });
      }
      
      const { name, type, description, isDefault } = req.body;
      const updated = await storage.updateProfile(req.params.id, {
        name,
        type,
        description,
        isDefault
      });
      
      res.json({ profile: updated });
    } catch (error: any) {
      // Handle constraint violations
      if (error.message && error.message.includes('already has a personal profile')) {
        return res.status(409).json({ error: "User already has a personal profile" });
      }
      // Handle database unique constraint violation (23505)
      if (error.code === '23505' && error.constraint === 'profiles_user_personal_unique_idx') {
        return res.status(409).json({ error: "User already has a personal profile" });
      }
      res.status(500).json({ error: "Failed to update profile" });
    }
  });

  app.delete("/api/profiles/:id", requireAuth, async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const profile = await storage.getProfile(req.params.id);
      if (!profile || profile.userId !== userId) {
        return res.status(404).json({ error: "Profile not found" });
      }
      
      // Prevent deletion of default profile
      if (profile.isDefault) {
        return res.status(400).json({ error: "Cannot delete default profile" });
      }
      
      await storage.deleteProfile(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete profile" });
    }
  });

  // Profile member routes (auth required)
  app.get("/api/profiles/:profileId/members", requireAuth, async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const profile = await storage.getProfile(req.params.profileId);
      if (!profile || profile.userId !== userId) {
        return res.status(404).json({ error: "Profile not found" });
      }
      
      const members = await storage.getProfileMembers(req.params.profileId);
      res.json({ members });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch profile members" });
    }
  });

  app.post("/api/profiles/:profileId/members", requireAuth, async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const profile = await storage.getProfile(req.params.profileId);
      if (!profile || profile.userId !== userId) {
        return res.status(404).json({ error: "Profile not found" });
      }
      
      // Only family profiles can have members
      if (profile.type !== 'family') {
        return res.status(400).json({ error: "Only family profiles can have members" });
      }
      
      const { name, email, relationship, role } = req.body;
      const member = await storage.createProfileMember({
        profileId: req.params.profileId,
        name,
        email,
        relationship,
        role: role || 'member'
      });
      
      res.json({ member });
    } catch (error) {
      res.status(500).json({ error: "Failed to add member" });
    }
  });

  app.patch("/api/profiles/:profileId/members/:id", requireAuth, async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const profile = await storage.getProfile(req.params.profileId);
      if (!profile || profile.userId !== userId) {
        return res.status(404).json({ error: "Profile not found" });
      }
      
      const { name, email, relationship, role } = req.body;
      const updated = await storage.updateProfileMember(req.params.id, {
        name,
        email,
        relationship,
        role
      });
      
      res.json({ member: updated });
    } catch (error) {
      res.status(500).json({ error: "Failed to update member" });
    }
  });

  app.delete("/api/profiles/:profileId/members/:id", requireAuth, async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const profile = await storage.getProfile(req.params.profileId);
      if (!profile || profile.userId !== userId) {
        return res.status(404).json({ error: "Profile not found" });
      }
      
      await storage.deleteProfileMember(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to remove member" });
    }
  });

  // Conversation routes (auth required)
  app.get("/api/conversations", requireAuth, async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      // Optional profile filter: ?profileId=xxx or ?profileId=null
      const profileIdParam = req.query.profileId as string | undefined;
      let profileId: string | null | undefined = undefined;
      if (profileIdParam !== undefined) {
        profileId = profileIdParam === 'null' ? null : profileIdParam;
      }
      
      const conversations = await storage.getUserConversations(userId, profileId);
      
      // Sort conversations: pinned first, then by updatedAt descending
      const sortedConversations = conversations.sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      });
      
      res.json({ conversations: sortedConversations });
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
      
      const { title, preview, profileId } = req.body;
      
      // Validate profileId ownership if provided
      if (profileId) {
        const profile = await storage.getProfile(profileId);
        if (!profile) {
          return res.status(400).json({ error: "Invalid profile ID" });
        }
        if (profile.userId !== userId) {
          return res.status(403).json({ error: "Access denied: Profile does not belong to user" });
        }
      }
      
      const conversation = await storage.createConversation({
        userId,
        title,
        preview,
        profileId: profileId || null
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
      
      const { conversationId, message, profileId, chatMode, documentAttachment } = req.body;
      
      if (!message) {
        return res.status(400).json({ error: "Message required" });
      }
      
      // Log chat mode for debugging
      if (chatMode && chatMode !== 'standard') {
        console.log(`[API] Professional mode selected: ${chatMode}`);
      }
      
      // Convert document attachment from base64 to Buffer for AI processing
      // Future enhancement: Use temporary encrypted storage with attachmentId lookup
      let attachmentBuffer: Buffer | undefined;
      let attachmentMetadata: { filename: string; mimeType: string; documentType?: string } | undefined;
      
      if (documentAttachment) {
        try {
          // Security validation: Check attachment size and type
          const ALLOWED_MIME_TYPES = [
            // Azure Document Intelligence supported formats
            'application/pdf',
            'image/png',
            'image/jpeg',
            'image/jpg',
            'image/tiff',
            'image/tif',
            // Spreadsheet formats for financial data
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
            'application/vnd.ms-excel', // .xls
            'text/csv', // .csv
            'text/plain' // .txt
          ];
          const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10MB limit
          
          // Validate MIME type
          if (!ALLOWED_MIME_TYPES.includes(documentAttachment.type)) {
            return res.status(400).json({ 
              error: "Invalid file type. Allowed types: PDF, PNG, JPEG, TIFF, Excel (XLSX, XLS), CSV, TXT" 
            });
          }
          
          // Convert base64 data to Buffer
          attachmentBuffer = Buffer.from(documentAttachment.data, 'base64');
          
          // Validate size
          if (attachmentBuffer.byteLength > MAX_SIZE_BYTES) {
            return res.status(400).json({ 
              error: "File too large. Maximum size is 10MB" 
            });
          }
          
          attachmentMetadata = {
            filename: documentAttachment.filename,
            mimeType: documentAttachment.type,
            documentType: documentAttachment.type // Use MIME type as document type for now
          };
          
          console.log(`[API] Document attachment validated: ${documentAttachment.filename} (${attachmentBuffer.byteLength} bytes)`);
        } catch (error) {
          console.error('[API] Error processing document attachment:', error);
          return res.status(400).json({ error: "Invalid document attachment data" });
        }
      }
      
      // Validate profileId ownership if provided
      if (profileId) {
        const profile = await storage.getProfile(profileId);
        if (!profile) {
          return res.status(400).json({ error: "Invalid profile ID" });
        }
        if (profile.userId !== userId) {
          return res.status(403).json({ error: "Access denied: Profile does not belong to user" });
        }
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
        // Create new conversation with profileId
        conversation = await storage.createConversation({
          userId,
          profileId: profileId !== undefined ? profileId : null,
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
      const userMessage = await storage.createMessage({
        conversationId: conversation.id,
        role: 'user',
        content: message,
        modelUsed: null,
        routingDecision: null,
        calculationResults: null,
        tokensUsed: null
      });
      
      // CRITICAL DEBUG: Log attachment status before calling processQuery
      console.log(`[API] About to call processQuery with attachment:`, attachmentBuffer && attachmentMetadata ? `YES (${attachmentMetadata.filename})` : 'NO');
      console.log(`[API] attachmentBuffer exists:`, !!attachmentBuffer);
      console.log(`[API] attachmentMetadata exists:`, !!attachmentMetadata);
      
      // Process query through AI orchestrator with chat mode
      const result = await aiOrchestrator.processQuery(
        message,
        conversationHistory,
        user.subscriptionTier,
        attachmentBuffer && attachmentMetadata ? {
          attachment: {
            buffer: attachmentBuffer,
            filename: attachmentMetadata.filename,
            mimeType: attachmentMetadata.mimeType,
            documentType: attachmentMetadata.documentType
          },
          chatMode: chatMode || 'standard'
        } : {
          chatMode: chatMode || 'standard'
        }
      );
      
      // Save assistant message with full metadata
      const assistantMessage = await storage.createMessage({
        conversationId: conversation.id,
        role: 'assistant',
        content: result.response,
        modelUsed: result.modelUsed,
        routingDecision: result.routingDecision,
        calculationResults: result.calculationResults,
        tokensUsed: result.tokensUsed,
        metadata: result.metadata // Store full metadata (showInOutputPane, visualization, etc.)
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
      
      // Fire-and-forget async analytics processing and auto-title generation (don't block response)
      setImmediate(async () => {
        try {
          // Auto-generate title after first message
          if (conversationHistory.length === 0) {
            try {
              const provider = aiProviderRegistry.getProvider(AIProviderName.GEMINI);
              const titleResponse = await provider.generateCompletion({
                messages: [{
                  role: 'user',
                  content: `Generate a very short, concise title (max 6 words) for this accounting question. Only respond with the title, nothing else:\n\n"${message}"`
                }],
                temperature: 0.3,
                maxTokens: 50
              });
              
              const generatedTitle = titleResponse.content.trim().replace(/^["']|["']$/g, '');
              await storage.updateConversation(conversation.id, { title: generatedTitle });
              console.log(`[AutoTitle] Generated title: "${generatedTitle}"`);
            } catch (error) {
              console.error('[AutoTitle] Failed to generate title:', error);
            }
          }
          
          // Process user message analytics
          await AnalyticsProcessor.processMessage({
            messageId: userMessage.id,
            conversationId: conversation.id,
            userId,
            role: 'user',
            content: message,
            previousMessages: conversationHistory
          });
          
          // Process assistant message analytics
          await AnalyticsProcessor.processMessage({
            messageId: assistantMessage.id,
            conversationId: conversation.id,
            userId,
            role: 'assistant',
            content: result.response,
            previousMessages: [...conversationHistory, { role: 'user', content: message }]
          });
          
          // Analyze conversation every 5 messages
          if (conversationHistory.length % 5 === 0) {
            await AnalyticsProcessor.analyzeConversation(conversation.id);
          }
        } catch (error) {
          console.error('[Analytics] Background analytics processing error:', error);
        }
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

  // Chat file upload endpoint
  app.post("/api/chat/upload-file", requireAuth, chatRateLimiter, upload.single('file'), async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      if (!userId) return res.status(401).json({ error: "Not authenticated" });
      
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }
      
      // Validate MIME type - Support Azure Document Intelligence formats + spreadsheets
      const ALLOWED_MIME_TYPES = [
        // Azure Document Intelligence supported formats
        'application/pdf',
        'image/png',
        'image/jpeg',
        'image/jpg',
        'image/tiff',
        'image/tif',
        // Spreadsheet formats for financial data
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
        'application/vnd.ms-excel', // .xls
        'text/csv', // .csv
        'text/plain' // .txt
      ];
      
      if (!ALLOWED_MIME_TYPES.includes(req.file.mimetype)) {
        return res.status(400).json({ 
          error: "Invalid file type. Supported formats: PDF, PNG, JPEG, TIFF, Excel (XLSX, XLS), CSV, TXT" 
        });
      }
      
      // Validate file size (10MB limit for chat)
      if (req.file.size > 10 * 1024 * 1024) {
        return res.status(400).json({ error: "File too large. Maximum size is 10MB" });
      }
      
      // Convert file buffer to base64 for Azure Document Intelligence
      const base64Data = req.file.buffer.toString('base64');
      
      // Detect document type from filename and mimetype
      let documentType = 'document';
      const filename = req.file.originalname.toLowerCase();
      if (filename.includes('invoice')) documentType = 'invoice';
      else if (filename.includes('receipt')) documentType = 'receipt';
      else if (filename.includes('w-2') || filename.includes('w2')) documentType = 'w2';
      else if (filename.includes('1040')) documentType = '1040';
      else if (filename.includes('1098')) documentType = '1098';
      else if (filename.includes('1099')) documentType = '1099';
      else if (req.file.mimetype === 'application/pdf') documentType = 'document';
      
      res.json({
        success: true,
        file: {
          name: req.file.originalname,
          size: req.file.size,
          type: req.file.mimetype,
          base64Data,
          documentType
        }
      });
    } catch (error) {
      console.error('Chat file upload error:', error);
      res.status(500).json({ error: "File upload failed" });
    }
  });

  // Export content endpoint
  app.post("/api/export", requireAuth, async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      if (!userId) return res.status(401).json({ error: "Not authenticated" });
      
      const { content, visualization, format, title } = req.body;
      
      if (!content && !visualization) {
        return res.status(400).json({ error: "Content or visualization is required" });
      }
      
      if (!format || !['docx', 'pdf', 'pptx', 'xlsx', 'csv', 'txt'].includes(format)) {
        return res.status(400).json({ error: "Invalid format" });
      }

      // Handle simple text formats with visualization support
      if (format === 'txt' || format === 'csv') {
        let fileContent = content || '';
        let mimeType = 'text/plain';
        
        // Add visualization data as text table if present
        if (visualization && visualization.data && visualization.data.length > 0) {
          if (fileContent) fileContent += '\n\n';
          if (visualization.title) fileContent += visualization.title + '\n\n';
          
          // Get all unique keys from the data
          const allKeys = Array.from(
            new Set(visualization.data.flatMap((obj: any) => Object.keys(obj)))
          );
          
          if (format === 'csv') {
            // CSV format: proper comma-separated values
            fileContent += allKeys.join(',') + '\n';
            for (const row of visualization.data) {
              fileContent += allKeys.map((key: string) => {
                const value = row[key];
                const strValue = typeof value === 'number' ? value.toString() : (value || '');
                return `"${strValue.toString().replace(/"/g, '""')}"`;
              }).join(',') + '\n';
            }
          } else {
            // TXT format: readable table
            fileContent += allKeys.join('\t') + '\n';
            for (const row of visualization.data) {
              fileContent += allKeys.map((key: string) => row[key] ?? '').join('\t') + '\n';
            }
          }
        } else if (format === 'csv') {
          const lines = fileContent.split('\n').filter((l: string) => l.trim());
          fileContent = lines.map((line: string) => `"${line.replace(/"/g, '""')}"`).join('\n');
        }
        
        if (format === 'csv') mimeType = 'text/csv';
        
        const buffer = Buffer.from(fileContent, 'utf-8');
        res.setHeader('Content-Type', mimeType);
        res.setHeader('Content-Disposition', `attachment; filename="luca-output-${Date.now()}.${format}"`);
        return res.send(buffer);
      }

      // Use DocumentExporter for complex formats
      const buffer = await DocumentExporter.export({
        content: content || '',
        visualization,
        format: format as any,
        title: title || 'Luca Output'
      });
      
      const mimeTypes: Record<string, string> = {
        docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        pdf: 'application/pdf',
        pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      };
      
      res.setHeader('Content-Type', mimeTypes[format] || 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="luca-output-${Date.now()}.${format}"`);
      res.send(buffer);
    } catch (error) {
      console.error('Export error:', error);
      res.status(500).json({ error: "Failed to export content" });
    }
  });

  // Conversation Management Endpoints
  
  // Pin/Unpin conversation
  app.patch("/api/conversations/:id/pin", requireAuth, async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      if (!userId) return res.status(401).json({ error: "Not authenticated" });
      
      const { id } = req.params;
      const conversation = await storage.getConversation(id);
      
      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }
      
      if (conversation.userId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      await storage.updateConversation(id, { pinned: !conversation.pinned });
      res.json({ success: true, pinned: !conversation.pinned });
    } catch (error) {
      console.error('Pin conversation error:', error);
      res.status(500).json({ error: "Failed to pin conversation" });
    }
  });
  
  // Rename conversation
  app.patch("/api/conversations/:id/rename", requireAuth, async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      if (!userId) return res.status(401).json({ error: "Not authenticated" });
      
      const { id } = req.params;
      const { title } = req.body;
      
      if (!title || title.trim().length === 0) {
        return res.status(400).json({ error: "Title is required" });
      }
      
      const conversation = await storage.getConversation(id);
      
      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }
      
      if (conversation.userId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      await storage.updateConversation(id, { title: title.trim() });
      res.json({ success: true, title: title.trim() });
    } catch (error) {
      console.error('Rename conversation error:', error);
      res.status(500).json({ error: "Failed to rename conversation" });
    }
  });

  // Update conversation feedback (rating, resolved, user feedback)
  app.patch("/api/conversations/:id/feedback", requireAuth, async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      if (!userId) return res.status(401).json({ error: "Not authenticated" });
      
      const { id } = req.params;
      
      // Validate feedback data using Zod schema
      const validation = updateConversationFeedbackSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ 
          error: "Invalid feedback data", 
          details: validation.error.errors 
        });
      }
      
      const conversation = await storage.getConversation(id);
      
      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }
      
      if (conversation.userId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      // Update feedback fields
      await storage.updateConversation(id, validation.data);
      
      res.json({ 
        success: true, 
        feedback: validation.data 
      });
    } catch (error) {
      console.error('Update conversation feedback error:', error);
      res.status(500).json({ error: "Failed to update conversation feedback" });
    }
  });
  
  // Share conversation (create share link)
  app.post("/api/conversations/:id/share", requireAuth, async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      if (!userId) return res.status(401).json({ error: "Not authenticated" });
      
      const { id } = req.params;
      const conversation = await storage.getConversation(id);
      
      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }
      
      if (conversation.userId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      // Generate unique share token
      const crypto = await import('crypto');
      const sharedToken = crypto.randomBytes(32).toString('hex');
      
      await storage.updateConversation(id, { 
        isShared: true, 
        sharedToken 
      });
      
      const shareUrl = `${req.protocol}://${req.get('host')}/shared/${sharedToken}`;
      res.json({ success: true, shareUrl, sharedToken });
    } catch (error) {
      console.error('Share conversation error:', error);
      res.status(500).json({ error: "Failed to share conversation" });
    }
  });
  
  // Unshare conversation
  app.delete("/api/conversations/:id/share", requireAuth, async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      if (!userId) return res.status(401).json({ error: "Not authenticated" });
      
      const { id } = req.params;
      const conversation = await storage.getConversation(id);
      
      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }
      
      if (conversation.userId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      await storage.updateConversation(id, { 
        isShared: false, 
        sharedToken: null 
      });
      
      res.json({ success: true });
    } catch (error) {
      console.error('Unshare conversation error:', error);
      res.status(500).json({ error: "Failed to unshare conversation" });
    }
  });
  
  // Delete conversation
  app.delete("/api/conversations/:id", requireAuth, async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      if (!userId) return res.status(401).json({ error: "Not authenticated" });
      
      const { id } = req.params;
      const conversation = await storage.getConversation(id);
      
      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }
      
      if (conversation.userId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      await storage.deleteConversation(id);
      res.json({ success: true });
    } catch (error) {
      console.error('Delete conversation error:', error);
      res.status(500).json({ error: "Failed to delete conversation" });
    }
  });
  
  // Auto-generate conversation title (called after first message)
  app.post("/api/conversations/:id/auto-title", requireAuth, async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      if (!userId) return res.status(401).json({ error: "Not authenticated" });
      
      const { id } = req.params;
      const conversation = await storage.getConversation(id);
      
      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }
      
      if (conversation.userId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      // Get the first user message
      const messages = await storage.getConversationMessages(id);
      const firstUserMessage = messages.find(m => m.role === 'user');
      
      if (!firstUserMessage) {
        return res.status(400).json({ error: "No messages found" });
      }
      
      // Generate a concise title using AI
      try {
        const provider = aiProviderRegistry.getProvider(AIProviderName.GEMINI);
        const response = await provider.generateCompletion({
          messages: [{
            role: 'user',
            content: `Generate a very short, concise title (max 6 words) for this accounting question. Only respond with the title, nothing else:\n\n"${firstUserMessage.content}"`
          }],
          temperature: 0.3,
          maxTokens: 50
        });
        
        const generatedTitle = response.content.trim().replace(/^["']|["']$/g, '');
        await storage.updateConversation(id, { title: generatedTitle });
        
        res.json({ success: true, title: generatedTitle });
      } catch (error) {
        // Fallback to simple truncation if AI fails
        const fallbackTitle = firstUserMessage.content.slice(0, 50) + 
          (firstUserMessage.content.length > 50 ? '...' : '');
        await storage.updateConversation(id, { title: fallbackTitle });
        
        res.json({ success: true, title: fallbackTitle });
      }
    } catch (error) {
      console.error('Auto-title error:', error);
      res.status(500).json({ error: "Failed to generate title" });
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

  // Analytics API Endpoints (Admin only)
  
  app.get("/api/admin/analytics/overview", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { db } = await import("./db");
      const { conversationAnalytics, userBehaviorPatterns } = await import("@shared/schema");
      const { sql } = await import("drizzle-orm");
      
      // Get aggregate statistics
      const totalConversations = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(conversationAnalytics);
      
      const avgQuality = await db
        .select({ avg: sql<number>`avg(${conversationAnalytics.qualityScore})::int` })
        .from(conversationAnalytics)
        .where(sql`${conversationAnalytics.qualityScore} IS NOT NULL`);
      
      const highChurnUsers = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(userBehaviorPatterns)
        .where(sql`${userBehaviorPatterns.churnRisk} = 'high'`);
      
      const upsellCandidates = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(userBehaviorPatterns)
        .where(sql`${userBehaviorPatterns.potentialUpsellCandidate} = true`);
      
      res.json({
        overview: {
          totalConversations: totalConversations[0]?.count || 0,
          averageQualityScore: avgQuality[0]?.avg || 0,
          highChurnUsers: highChurnUsers[0]?.count || 0,
          upsellCandidates: upsellCandidates[0]?.count || 0
        }
      });
    } catch (error) {
      console.error('Analytics overview error:', error);
      res.status(500).json({ error: "Failed to fetch analytics overview" });
    }
  });
  
  app.get("/api/admin/analytics/users/:userId", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { db } = await import("./db");
      const { userBehaviorPatterns, conversationAnalytics } = await import("@shared/schema");
      const { eq, desc } = await import("drizzle-orm");
      
      const userId = req.params.userId;
      
      // Get user behavior patterns
      const [behavior] = await db
        .select()
        .from(userBehaviorPatterns)
        .where(eq(userBehaviorPatterns.userId, userId))
        .limit(1);
      
      // Get recent conversations
      const recentConversations = await db
        .select()
        .from(conversationAnalytics)
        .where(eq(conversationAnalytics.userId, userId))
        .orderBy(desc(conversationAnalytics.createdAt))
        .limit(10);
      
      res.json({
        behavior,
        recentConversations
      });
    } catch (error) {
      console.error('User analytics error:', error);
      res.status(500).json({ error: "Failed to fetch user analytics" });
    }
  });
  
  app.get("/api/admin/analytics/churn-risks", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { db } = await import("./db");
      const { userBehaviorPatterns } = await import("@shared/schema");
      const { eq, desc } = await import("drizzle-orm");
      
      // Get high churn risk users
      const highRiskUsers = await db
        .select()
        .from(userBehaviorPatterns)
        .where(eq(userBehaviorPatterns.churnRisk, 'high'))
        .orderBy(desc(userBehaviorPatterns.churnRiskScore))
        .limit(50);
      
      res.json({ highRiskUsers });
    } catch (error) {
      console.error('Churn risk analytics error:', error);
      res.status(500).json({ error: "Failed to fetch churn risk analytics" });
    }
  });
  
  app.post("/api/admin/analytics/batch-process", requireAuth, requireAdmin, async (req, res) => {
    try {
      // Trigger batch analytics processing
      setImmediate(() => {
        AnalyticsProcessor.runBatchAnalytics().catch(error => {
          console.error('[Analytics] Batch processing failed:', error);
        });
      });
      
      res.json({ message: "Batch analytics processing initiated" });
    } catch (error) {
      console.error('Batch processing error:', error);
      res.status(500).json({ error: "Failed to initiate batch processing" });
    }
  });

  // User Analytics Endpoints (for regular users to view their own analytics)
  
  app.get("/api/analytics", requireAuth, async (req, res) => {
    try {
      const { db } = await import("./db");
      const { userBehaviorPatterns, conversationAnalytics, sentimentTrends, messageAnalytics, conversations: conversationsTable } = await import("@shared/schema");
      const { eq, desc, gte, sql, isNotNull } = await import("drizzle-orm");
      
      const userId = getCurrentUserId(req);
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      // Get user behavior patterns
      const [behavior] = await db
        .select()
        .from(userBehaviorPatterns)
        .where(eq(userBehaviorPatterns.userId, userId))
        .limit(1);
      
      // Get conversation analytics (last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const conversations = await db
        .select()
        .from(conversationAnalytics)
        .where(eq(conversationAnalytics.userId, userId))
        .orderBy(desc(conversationAnalytics.createdAt))
        .limit(100);
      
      // Get sentiment trends (last 30 days)
      const sentimentData = await db
        .select()
        .from(sentimentTrends)
        .where(eq(sentimentTrends.userId, userId))
        .orderBy(desc(sentimentTrends.date))
        .limit(30);
      
      // Get message analytics for detailed insights
      const messageStats = await db
        .select()
        .from(messageAnalytics)
        .where(eq(messageAnalytics.userId, userId))
        .orderBy(desc(messageAnalytics.createdAt))
        .limit(100);
      
      // Calculate summary statistics
      const totalConversations = conversations.length;
      const avgQuality = conversations.filter(c => c.qualityScore).length > 0
        ? Math.round(conversations.filter(c => c.qualityScore).reduce((sum, c) => sum + (c.qualityScore || 0), 0) / conversations.filter(c => c.qualityScore).length)
        : null;
      
      const topicsCount = new Map<string, number>();
      conversations.forEach(c => {
        if (c.topicsDiscussed) {
          (c.topicsDiscussed as string[]).forEach(topic => {
            topicsCount.set(topic, (topicsCount.get(topic) || 0) + 1);
          });
        }
      });
      
      const topTopics = Array.from(topicsCount.entries())
        .map(([topic, count]) => ({ topic, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);
      
      // Get user feedback stats using SQL aggregation (all-time, no date filter for complete picture)
      const [feedbackStats] = await db
        .select({
          totalConversations: sql<number>`count(*)::int`,
          resolvedCount: sql<number>`count(*) filter (where ${conversationsTable.resolved} = true)::int`,
          avgRating: sql<string>`round(avg(${conversationsTable.qualityScore}), 1)`,
          totalRated: sql<number>`count(*) filter (where ${conversationsTable.qualityScore} is not null)::int`,
          rating1Count: sql<number>`count(*) filter (where ${conversationsTable.qualityScore} = 1)::int`,
          rating2Count: sql<number>`count(*) filter (where ${conversationsTable.qualityScore} = 2)::int`,
          rating3Count: sql<number>`count(*) filter (where ${conversationsTable.qualityScore} = 3)::int`,
          rating4Count: sql<number>`count(*) filter (where ${conversationsTable.qualityScore} = 4)::int`,
          rating5Count: sql<number>`count(*) filter (where ${conversationsTable.qualityScore} = 5)::int`,
        })
        .from(conversationsTable)
        .where(eq(conversationsTable.userId, userId));
      
      const totalUserConversations = feedbackStats.totalConversations;
      const resolvedCount = feedbackStats.resolvedCount;
      const resolutionRate = totalUserConversations > 0 
        ? Math.round((resolvedCount / totalUserConversations) * 100)
        : 0;
      
      const ratingDistribution = [
        { rating: 1, count: feedbackStats.rating1Count },
        { rating: 2, count: feedbackStats.rating2Count },
        { rating: 3, count: feedbackStats.rating3Count },
        { rating: 4, count: feedbackStats.rating4Count },
        { rating: 5, count: feedbackStats.rating5Count },
      ];
      
      const avgUserRating = feedbackStats.totalRated > 0 ? feedbackStats.avgRating : null;
      
      res.json({
        behavior: behavior || null,
        conversations,
        sentimentTrends: sentimentData,
        messageStats,
        summary: {
          totalConversations,
          averageQualityScore: avgQuality,
          topTopics
        },
        userFeedback: {
          resolvedCount,
          resolutionRate,
          ratingDistribution,
          averageUserRating: avgUserRating,
          totalRated: feedbackStats.totalRated,
          totalConversations: totalUserConversations
        }
      });
    } catch (error) {
      console.error('User analytics error:', error);
      res.status(500).json({ error: "Failed to fetch analytics" });
    }
  });

  // AI Provider Health Monitoring Endpoints (Admin only)
  
  app.get("/api/admin/ai-providers/health", requireAuth, requireAdmin, async (req, res) => {
    try {
      const healthStatus = providerHealthMonitor.getAllHealthStatus();
      res.json({ providers: healthStatus });
    } catch (error) {
      console.error('Provider health status error:', error);
      res.status(500).json({ error: "Failed to fetch provider health status" });
    }
  });
  
  app.post("/api/admin/ai-providers/:provider/reset-health", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { AIProviderName } = await import("./services/aiProviders");
      const providerName = req.params.provider as any;
      
      // Validate provider name
      if (!Object.values(AIProviderName).includes(providerName)) {
        return res.status(400).json({ error: "Invalid provider name" });
      }
      
      providerHealthMonitor.resetProviderHealth(providerName);
      res.json({ message: `Health metrics reset for ${providerName}` });
    } catch (error) {
      console.error('Reset health error:', error);
      res.status(500).json({ error: "Failed to reset provider health" });
    }
  });

  // Admin user management - tier update
  app.patch("/api/admin/users/:id/tier", requireAuth, requireAdmin, async (req, res) => {
    try {
      const schema = z.object({
        tier: z.enum(['free', 'payg', 'plus', 'professional', 'enterprise'])
      });
      
      const { tier } = schema.parse(req.body);
      const adminUserId = getCurrentUserId(req);
      
      const user = await storage.getUser(req.params.id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      await storage.updateUserSubscription(req.params.id, tier);
      
      await storage.createAuditLog({
        userId: adminUserId || undefined,
        action: 'UPDATE_USER_TIER',
        resourceType: 'user',
        resourceId: req.params.id,
        details: { tier },
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      });
      
      res.json({ success: true });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Failed to update user tier" });
    }
  });

  // Admin user management - toggle admin status
  app.patch("/api/admin/users/:id/toggle-admin", requireAuth, requireAdmin, async (req, res) => {
    try {
      const adminUserId = getCurrentUserId(req);
      
      // Prevent toggling own admin status
      if (req.params.id === adminUserId) {
        return res.status(400).json({ error: "Cannot toggle your own admin status" });
      }
      
      const user = await storage.getUser(req.params.id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      const newAdminStatus = !user.isAdmin;
      await storage.updateUser(req.params.id, { isAdmin: newAdminStatus });
      
      await storage.createAuditLog({
        userId: adminUserId || undefined,
        action: newAdminStatus ? 'GRANT_ADMIN' : 'REVOKE_ADMIN',
        resourceType: 'user',
        resourceId: req.params.id,
        details: { isAdmin: newAdminStatus },
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      });
      
      res.json({ success: true, isAdmin: newAdminStatus });
    } catch (error) {
      res.status(500).json({ error: "Failed to toggle admin status" });
    }
  });

  // Admin subscriptions list with user info
  app.get("/api/admin/subscriptions", requireAuth, requireAdmin, async (req, res) => {
    try {
      const subscriptions = await storage.getAllSubscriptions();
      res.json(subscriptions);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch subscriptions" });
    }
  });

  // Coupon Management Endpoints (Admin only)
  
  app.get("/api/admin/coupons", requireAuth, requireAdmin, async (req, res) => {
    try {
      const coupons = await storage.getAllCoupons();
      res.json({ coupons });
    } catch (error) {
      console.error('Fetch coupons error:', error);
      res.status(500).json({ error: "Failed to fetch coupons" });
    }
  });

  app.get("/api/admin/coupons/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      const coupon = await storage.getCoupon(req.params.id);
      if (!coupon) {
        return res.status(404).json({ error: "Coupon not found" });
      }
      res.json({ coupon });
    } catch (error) {
      console.error('Fetch coupon error:', error);
      res.status(500).json({ error: "Failed to fetch coupon" });
    }
  });

  app.post("/api/admin/coupons", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { insertCouponSchema } = await import("@shared/schema");
      const userId = getCurrentUserId(req);
      
      const validatedData = insertCouponSchema.parse({
        ...req.body,
        createdBy: userId
      });
      
      const coupon = await storage.createCoupon(validatedData);
      res.json({ coupon });
    } catch (error: any) {
      console.error('Create coupon error:', error);
      if (error.code === '23505') {
        return res.status(400).json({ error: "Coupon code already exists" });
      }
      res.status(500).json({ error: "Failed to create coupon" });
    }
  });

  app.patch("/api/admin/coupons/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { insertCouponSchema } = await import("@shared/schema");
      const updateSchema = insertCouponSchema.partial();
      const validatedData = updateSchema.parse(req.body);
      
      const coupon = await storage.updateCoupon(req.params.id, validatedData);
      if (!coupon) {
        return res.status(404).json({ error: "Coupon not found" });
      }
      res.json({ coupon });
    } catch (error) {
      console.error('Update coupon error:', error);
      res.status(500).json({ error: "Failed to update coupon" });
    }
  });

  app.delete("/api/admin/coupons/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      const success = await storage.deleteCoupon(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Coupon not found" });
      }
      res.json({ message: "Coupon deleted successfully" });
    } catch (error) {
      console.error('Delete coupon error:', error);
      res.status(500).json({ error: "Failed to delete coupon" });
    }
  });

  app.get("/api/admin/coupons/:id/usage", requireAuth, requireAdmin, async (req, res) => {
    try {
      const usage = await storage.getCouponUsageHistory(req.params.id);
      res.json({ usage });
    } catch (error) {
      console.error('Fetch coupon usage error:', error);
      res.status(500).json({ error: "Failed to fetch coupon usage" });
    }
  });

  // Coupon Pre-Validation Endpoint (Lightweight check before plan selection)
  app.get("/api/coupons/pre-validate", requireAuth, async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      if (!userId) return res.status(401).json({ error: "Not authenticated" });
      
      const { code, currency } = req.query;
      
      if (!code || !currency) {
        return res.status(400).json({ error: "Missing required parameters" });
      }
      
      const coupon = await storage.getCouponByCode((code as string).toUpperCase());
      
      if (!coupon) {
        return res.status(404).json({ valid: false, error: "Invalid coupon code" });
      }
      
      if (!coupon.isActive) {
        return res.status(400).json({ valid: false, error: "Coupon is inactive" });
      }
      
      const now = new Date();
      if (coupon.validFrom && new Date(coupon.validFrom) > now) {
        return res.status(400).json({ valid: false, error: "Coupon not yet valid" });
      }
      
      if (coupon.validUntil && new Date(coupon.validUntil) < now) {
        return res.status(400).json({ valid: false, error: "Coupon has expired" });
      }
      
      if (coupon.applicableCurrencies && !coupon.applicableCurrencies.includes(currency as string)) {
        return res.status(400).json({ valid: false, error: "Coupon not applicable to this currency" });
      }
      
      if (coupon.maxUses && coupon.usageCount >= coupon.maxUses) {
        return res.status(400).json({ valid: false, error: "Coupon usage limit reached" });
      }
      
      const userUsageCount = await storage.getCouponUsageCount(coupon.id, userId);
      if (coupon.maxUsesPerUser && userUsageCount >= coupon.maxUsesPerUser) {
        return res.status(400).json({ valid: false, error: "You have already used this coupon" });
      }
      
      // Pre-validation passed - return basic coupon info
      res.json({
        valid: true,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
        description: coupon.description
      });
    } catch (error) {
      console.error('Pre-validate coupon error:', error);
      res.status(500).json({ valid: false, error: "Failed to validate coupon" });
    }
  });

  // Coupon Validation Endpoint (For users during checkout)
  app.post("/api/coupons/validate", requireAuth, async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      if (!userId) return res.status(401).json({ error: "Not authenticated" });
      
      const { code, plan, currency, amount } = req.body;
      
      if (!code || !plan || !currency || !amount) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      
      const coupon = await storage.getCouponByCode(code.toUpperCase());
      
      if (!coupon) {
        return res.status(404).json({ error: "Invalid coupon code" });
      }
      
      if (!coupon.isActive) {
        return res.status(400).json({ error: "Coupon is inactive" });
      }
      
      const now = new Date();
      if (coupon.validFrom && new Date(coupon.validFrom) > now) {
        return res.status(400).json({ error: "Coupon not yet valid" });
      }
      
      if (coupon.validUntil && new Date(coupon.validUntil) < now) {
        return res.status(400).json({ error: "Coupon has expired" });
      }
      
      if (coupon.applicablePlans && !coupon.applicablePlans.includes(plan)) {
        return res.status(400).json({ error: "Coupon not applicable to this plan" });
      }
      
      if (coupon.applicableCurrencies && !coupon.applicableCurrencies.includes(currency)) {
        return res.status(400).json({ error: "Coupon not applicable to this currency" });
      }
      
      if (coupon.maxUses && coupon.usageCount >= coupon.maxUses) {
        return res.status(400).json({ error: "Coupon usage limit reached" });
      }
      
      const userUsageCount = await storage.getCouponUsageCount(coupon.id, userId);
      if (coupon.maxUsesPerUser && userUsageCount >= coupon.maxUsesPerUser) {
        return res.status(400).json({ error: "You have already used this coupon" });
      }
      
      if (coupon.minPurchaseAmount && amount < coupon.minPurchaseAmount) {
        return res.status(400).json({ 
          error: `Minimum purchase amount is ${coupon.minPurchaseAmount / 100} ${currency}` 
        });
      }
      
      let discountAmount = 0;
      if (coupon.discountType === 'percentage') {
        discountAmount = Math.floor(amount * coupon.discountValue / 100);
        if (coupon.maxDiscountAmount && discountAmount > coupon.maxDiscountAmount) {
          discountAmount = coupon.maxDiscountAmount;
        }
      } else if (coupon.discountType === 'fixed' && coupon.currency === currency) {
        discountAmount = coupon.discountValue;
      } else {
        return res.status(400).json({ error: "Coupon currency mismatch" });
      }
      
      const finalAmount = Math.max(0, amount - discountAmount);
      
      res.json({ 
        valid: true, 
        coupon: {
          id: coupon.id,
          code: coupon.code,
          description: coupon.description,
          discountType: coupon.discountType,
          discountValue: coupon.discountValue
        },
        discountAmount,
        finalAmount
      });
    } catch (error) {
      console.error('Validate coupon error:', error);
      res.status(500).json({ error: "Failed to validate coupon" });
    }
  });

  // ===============================================
  // MVP FEATURE ROUTES
  // ===============================================

  // Scenario Simulator Routes
  app.post("/api/scenarios/playbooks", requireAuth, async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      const { db } = await import("./db");
      const { scenarioPlaybooks, insertScenarioPlaybookSchema } = await import("@shared/schema");
      
      const validatedData = insertScenarioPlaybookSchema.parse({
        ...req.body,
        userId
      });
      
      const [playbook] = await db.insert(scenarioPlaybooks).values(validatedData).returning();
      res.json(playbook);
    } catch (error) {
      console.error('Create playbook error:', error);
      res.status(500).json({ error: "Failed to create scenario playbook" });
    }
  });

  app.get("/api/scenarios/playbooks", requireAuth, async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      const { db } = await import("./db");
      const { scenarioPlaybooks } = await import("@shared/schema");
      const { eq, desc } = await import("drizzle-orm");
      
      const playbooks = await db
        .select()
        .from(scenarioPlaybooks)
        .where(eq(scenarioPlaybooks.userId, userId))
        .orderBy(desc(scenarioPlaybooks.createdAt));
      
      res.json(playbooks);
    } catch (error) {
      console.error('Fetch playbooks error:', error);
      res.status(500).json({ error: "Failed to fetch scenario playbooks" });
    }
  });

  app.post("/api/scenarios/playbooks/:playbookId/variants", requireAuth, async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      const { db } = await import("./db");
      const { scenarioVariants, scenarioPlaybooks } = await import("@shared/schema");
      const { eq, and } = await import("drizzle-orm");
      
      // Verify playbook ownership
      const [playbook] = await db
        .select()
        .from(scenarioPlaybooks)
        .where(and(
          eq(scenarioPlaybooks.id, req.params.playbookId),
          eq(scenarioPlaybooks.userId, userId)
        ))
        .limit(1);
      
      if (!playbook) {
        return res.status(404).json({ error: "Playbook not found" });
      }
      
      const [variant] = await db.insert(scenarioVariants).values({
        playbookId: req.params.playbookId,
        ...req.body
      }).returning();
      
      res.json(variant);
    } catch (error) {
      console.error('Create variant error:', error);
      res.status(500).json({ error: "Failed to create scenario variant" });
    }
  });

  app.post("/api/scenarios/playbooks/:playbookId/simulate", requireAuth, async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      const { ScenarioSolver } = await import("./services/scenarioSolver");
      const { db } = await import("./db");
      const { scenarioPlaybooks, scenarioRuns, scenarioMetrics } = await import("@shared/schema");
      const { eq, and } = await import("drizzle-orm");
      
      // Verify playbook ownership
      const [playbook] = await db
        .select()
        .from(scenarioPlaybooks)
        .where(and(
          eq(scenarioPlaybooks.id, req.params.playbookId),
          eq(scenarioPlaybooks.userId, userId)
        ))
        .limit(1);
      
      if (!playbook) {
        return res.status(404).json({ error: "Playbook not found" });
      }
      
      // Run simulation
      const result = await ScenarioSolver.runSimulation(playbook, req.body.variantIds || []);
      
      res.json(result);
    } catch (error) {
      console.error('Simulation error:', error);
      res.status(500).json({ error: "Failed to run simulation" });
    }
  });

  // Deliverable Composer Routes
  app.get("/api/deliverables/templates", requireAuth, async (req, res) => {
    try {
      const { db } = await import("./db");
      const { deliverableTemplates } = await import("@shared/schema");
      const { or, eq, isNull } = await import("drizzle-orm");
      
      // Get system templates and user's custom templates
      const templates = await db
        .select()
        .from(deliverableTemplates)
        .where(or(
          eq(deliverableTemplates.isSystem, true),
          isNull(deliverableTemplates.ownerUserId)
        ));
      
      res.json(templates);
    } catch (error) {
      console.error('Fetch templates error:', error);
      res.status(500).json({ error: "Failed to fetch deliverable templates" });
    }
  });

  app.post("/api/deliverables/generate", requireAuth, async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      const { DeliverableGenerator } = await import("./services/deliverableGenerator");
      const { db } = await import("./db");
      const { deliverableInstances } = await import("@shared/schema");
      
      const { templateId, variables } = req.body;
      
      // Generate deliverable using AI
      const result = await DeliverableGenerator.generate(templateId, variables, userId);
      
      // Store instance
      const [instance] = await db.insert(deliverableInstances).values({
        userId,
        templateId,
        title: result.title || 'Untitled Document',
        type: result.type || 'general',
        variableValues: variables,
        contentMarkdown: result.content,
        status: 'draft'
      }).returning();
      
      res.json(instance);
    } catch (error) {
      console.error('Generate deliverable error:', error);
      res.status(500).json({ error: "Failed to generate deliverable" });
    }
  });

  app.get("/api/deliverables/instances", requireAuth, async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      const { db } = await import("./db");
      const { deliverableInstances } = await import("@shared/schema");
      const { eq, desc } = await import("drizzle-orm");
      
      const instances = await db
        .select()
        .from(deliverableInstances)
        .where(eq(deliverableInstances.userId, userId))
        .orderBy(desc(deliverableInstances.createdAt));
      
      res.json(instances);
    } catch (error) {
      console.error('Fetch instances error:', error);
      res.status(500).json({ error: "Failed to fetch deliverable instances" });
    }
  });

  app.post("/api/deliverables/instances/:instanceId/export", requireAuth, async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      const { DocumentExporter } = await import("./services/documentExporter");
      const { db } = await import("./db");
      const { deliverableInstances, deliverableAssets } = await import("@shared/schema");
      const { eq, and } = await import("drizzle-orm");
      
      // Verify instance ownership
      const [instance] = await db
        .select()
        .from(deliverableInstances)
        .where(and(
          eq(deliverableInstances.id, req.params.instanceId),
          eq(deliverableInstances.userId, userId)
        ))
        .limit(1);
      
      if (!instance) {
        return res.status(404).json({ error: "Deliverable not found" });
      }
      
      const { format } = req.body; // 'docx' or 'pdf'
      
      // Export to requested format
      const asset = await DocumentExporter.export(instance, format);
      
      res.json(asset);
    } catch (error) {
      console.error('Export deliverable error:', error);
      res.status(500).json({ error: "Failed to export deliverable" });
    }
  });

  // Forensic Intelligence Routes
  app.post("/api/forensics/cases", requireAuth, async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      const { db } = await import("./db");
      const { forensicCases, insertForensicCaseSchema } = await import("@shared/schema");
      
      const validatedData = insertForensicCaseSchema.parse({
        ...req.body,
        userId
      });
      
      const [forensicCase] = await db.insert(forensicCases).values(validatedData).returning();
      res.json(forensicCase);
    } catch (error) {
      console.error('Create forensic case error:', error);
      res.status(500).json({ error: "Failed to create forensic case" });
    }
  });

  app.get("/api/forensics/cases", requireAuth, async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      const { db } = await import("./db");
      const { forensicCases } = await import("@shared/schema");
      const { eq, desc } = await import("drizzle-orm");
      
      const cases = await db
        .select()
        .from(forensicCases)
        .where(eq(forensicCases.userId, userId))
        .orderBy(desc(forensicCases.createdAt));
      
      res.json(cases);
    } catch (error) {
      console.error('Fetch forensic cases error:', error);
      res.status(500).json({ error: "Failed to fetch forensic cases" });
    }
  });

  app.post("/api/forensics/cases/:caseId/documents", requireAuth, fileUploadRateLimiter, upload.single('file'), async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      const { db } = await import("./db");
      const { forensicCases, forensicDocuments } = await import("@shared/schema");
      const { eq, and } = await import("drizzle-orm");
      
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }
      
      // Verify case ownership
      const [forensicCase] = await db
        .select()
        .from(forensicCases)
        .where(and(
          eq(forensicCases.id, req.params.caseId),
          eq(forensicCases.userId, userId)
        ))
        .limit(1);
      
      if (!forensicCase) {
        return res.status(404).json({ error: "Case not found" });
      }
      
      // Store encrypted file
      const storageKey = await storeEncryptedFile(req.file.buffer, req.file.mimetype);
      const checksum = calculateChecksum(req.file.buffer);
      
      // Store document record
      const [document] = await db.insert(forensicDocuments).values({
        caseId: req.params.caseId,
        filename: req.file.originalname,
        sourceType: 'upload',
        extractedData: {}, // Will be filled by analyzer
        analysisStatus: 'pending'
      }).returning();
      
      // Trigger forensic analysis asynchronously
      const { ForensicAnalyzer } = await import("./services/forensicAnalyzer");
      setImmediate(() => {
        ForensicAnalyzer.analyzeDocument(document.id, req.file!.buffer, req.file!.mimetype).catch((error: any) => {
          console.error('[Forensics] Analysis failed:', error);
        });
      });
      
      res.json(document);
    } catch (error) {
      console.error('Upload forensic document error:', error);
      res.status(500).json({ error: "Failed to upload document" });
    }
  });

  app.get("/api/forensics/cases/:caseId/findings", requireAuth, async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      const { db } = await import("./db");
      const { forensicCases, forensicFindings } = await import("@shared/schema");
      const { eq, and, desc } = await import("drizzle-orm");
      
      // Verify case ownership
      const [forensicCase] = await db
        .select()
        .from(forensicCases)
        .where(and(
          eq(forensicCases.id, req.params.caseId),
          eq(forensicCases.userId, userId)
        ))
        .limit(1);
      
      if (!forensicCase) {
        return res.status(404).json({ error: "Case not found" });
      }
      
      const findings = await db
        .select()
        .from(forensicFindings)
        .where(eq(forensicFindings.caseId, req.params.caseId))
        .orderBy(desc(forensicFindings.severity), desc(forensicFindings.createdAt));
      
      res.json(findings);
    } catch (error) {
      console.error('Fetch findings error:', error);
      res.status(500).json({ error: "Failed to fetch forensic findings" });
    }
  });

  // ==================== PAYMENT & SUBSCRIPTION ROUTES ====================

  // Get pricing for user's region
  app.get("/api/pricing", async (req, res) => {
    try {
      const { subscriptionService } = await import("./services/subscriptionService");
      const currency = (req.query.currency as string) || 'USD';
      const validCurrencies = ['USD', 'INR', 'AED', 'CAD', 'IDR', 'TRY'];
      
      if (!validCurrencies.includes(currency)) {
        return res.status(400).json({ error: "Invalid currency" });
      }
      
      const pricing = subscriptionService.getPricing(currency as any);
      res.json(pricing);
    } catch (error) {
      console.error('Get pricing error:', error);
      res.status(500).json({ error: "Failed to fetch pricing" });
    }
  });

  // Get current user's subscription and usage
  app.get("/api/subscription", requireAuth, async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      const { subscriptionService } = await import("./services/subscriptionService");
      
      const subscription = await subscriptionService.getUserSubscription(userId);
      const quota = await subscriptionService.getOrCreateUsageQuota(userId);
      
      res.json({
        subscription,
        quota
      });
    } catch (error) {
      console.error('Get subscription error:', error);
      res.status(500).json({ error: "Failed to fetch subscription" });
    }
  });

  // Create payment order
  app.post("/api/payments/create-order", requireAuth, async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      const { subscriptionService } = await import("./services/subscriptionService");
      const { z } = await import("zod");
      
      const orderSchema = z.object({
        plan: z.enum(['plus', 'professional', 'enterprise']),
        billingCycle: z.enum(['monthly', 'annual']),
        currency: z.enum(['USD', 'INR', 'AED', 'CAD', 'IDR', 'TRY'])
      });
      
      const data = orderSchema.parse(req.body);
      const order = await subscriptionService.createPaymentOrder(
        userId,
        data.plan,
        data.billingCycle,
        data.currency
      );
      
      res.json({
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        razorpayKeyId: process.env.RAZORPAY_KEY_ID
      });
    } catch (error: any) {
      console.error('Create payment order error:', error);
      if (error.message?.includes('not configured')) {
        res.status(503).json({ error: "Payment system is being set up. Please try again later." });
      } else {
        res.status(500).json({ error: "Failed to create payment order" });
      }
    }
  });

  // Verify payment and activate subscription
  app.post("/api/payments/verify", requireAuth, async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      const { subscriptionService } = await import("./services/subscriptionService");
      const { db } = await import("./db");
      const { payments } = await import("@shared/schema");
      const { eq, and } = await import("drizzle-orm");
      const { z } = await import("zod");
      
      const verifySchema = z.object({
        razorpay_order_id: z.string(),
        razorpay_payment_id: z.string(),
        razorpay_signature: z.string()
      });
      
      const data = verifySchema.parse(req.body);
      
      // Verify signature
      const isValid = subscriptionService.verifyPaymentSignature(
        data.razorpay_order_id,
        data.razorpay_payment_id,
        data.razorpay_signature
      );
      
      if (!isValid) {
        return res.status(400).json({ error: "Invalid payment signature" });
      }
      
      // Update payment record
      await db.update(payments)
        .set({
          razorpayPaymentId: data.razorpay_payment_id,
          razorpaySignature: data.razorpay_signature,
          status: 'successful'
        })
        .where(and(
          eq(payments.razorpayOrderId, data.razorpay_order_id),
          eq(payments.userId, userId)
        ));
      
      // Activate subscription
      await subscriptionService.activateSubscription(data.razorpay_payment_id);
      
      res.json({ success: true, message: "Payment verified and subscription activated" });
    } catch (error) {
      console.error('Verify payment error:', error);
      res.status(500).json({ error: "Failed to verify payment" });
    }
  });

  // Cancel subscription
  app.post("/api/subscription/cancel", requireAuth, async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      const { subscriptionService } = await import("./services/subscriptionService");
      
      const subscription = await subscriptionService.cancelSubscription(userId);
      
      res.json({
        success: true,
        message: "Subscription cancelled. You'll have access until the end of your billing period.",
        subscription
      });
    } catch (error: any) {
      console.error('Cancel subscription error:', error);
      res.status(500).json({ error: error.message || "Failed to cancel subscription" });
    }
  });

  // Razorpay webhook handler
  app.post("/api/webhooks/razorpay", async (req, res) => {
    try {
      const { subscriptionService } = await import("./services/subscriptionService");
      const signature = req.headers['x-razorpay-signature'] as string;
      
      // Use raw body for signature verification (critical for webhook security)
      const rawBody = (req as any).rawBody?.toString('utf8');
      
      if (!rawBody) {
        console.error('[Razorpay Webhook] No raw body available');
        return res.status(400).json({ error: "Invalid request" });
      }
      
      // Verify webhook signature
      const isValid = subscriptionService.verifyWebhookSignature(rawBody, signature);
      
      if (!isValid) {
        console.error('[Razorpay Webhook] Invalid signature');
        return res.status(400).json({ error: "Invalid signature" });
      }
      
      const event = req.body;
      console.log('[Razorpay Webhook] Event received:', event.event);
      
      // Handle different webhook events
      switch (event.event) {
        case 'payment.authorized':
        case 'payment.captured':
          // Payment successful - activate subscription
          await subscriptionService.activateSubscription(event.payload.payment.entity.id);
          break;
          
        case 'payment.failed':
          // Handle failed payment
          const { db } = await import("./db");
          const { payments } = await import("@shared/schema");
          const { eq } = await import("drizzle-orm");
          
          await db.update(payments)
            .set({
              status: 'failed',
              failureReason: event.payload.payment.entity.error_description
            })
            .where(eq(payments.razorpayPaymentId, event.payload.payment.entity.id));
          break;
          
        default:
          console.log('[Razorpay Webhook] Unhandled event:', event.event);
      }
      
      res.json({ status: 'ok' });
    } catch (error) {
      console.error('[Razorpay Webhook] Error:', error);
      res.status(500).json({ error: "Webhook processing failed" });
    }
  });

  // Get payment history
  app.get("/api/payments/history", requireAuth, async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      const { db } = await import("./db");
      const { payments } = await import("@shared/schema");
      const { eq, desc } = await import("drizzle-orm");
      
      const paymentHistory = await db
        .select()
        .from(payments)
        .where(eq(payments.userId, userId))
        .orderBy(desc(payments.createdAt));
      
      res.json(paymentHistory);
    } catch (error) {
      console.error('Get payment history error:', error);
      res.status(500).json({ error: "Failed to fetch payment history" });
    }
  });

  // SSE Chat Streaming endpoint - replaces WebSocket
  app.post("/api/chat/stream", chatRateLimiter, requireAuth, async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      const { 
        conversationId, 
        query, 
        profileId = null,
        chatMode: rawChatMode = 'standard',
        documentAttachment
      } = req.body;

      // Validate chat mode
      const knownChatModes = ['standard', 'deep-research', 'checklist', 'workflow', 'audit-plan', 'calculation'];
      const chatMode = rawChatMode || 'standard';
      
      if (chatMode !== 'standard' && !knownChatModes.includes(chatMode)) {
        console.log(`[SSE] Unknown chat mode '${chatMode}' - passing through to orchestrator`);
      }

      // Validate required fields
      if (!query) {
        return res.status(400).json({ error: 'Missing query' });
      }

      // Get user tier for routing
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(401).json({ error: 'User not found' });
      }
      const userTier = user.subscriptionTier;

      // Process document attachment if present
      let attachmentBuffer: Buffer | undefined;
      let attachmentMetadata: { filename: string; mimeType: string; documentType?: string } | undefined;
      
      if (documentAttachment) {
        const ALLOWED_MIME_TYPES = [
          'application/pdf',
          'image/png',
          'image/jpeg',
          'image/jpg',
          'image/tiff',
          'image/tif',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel',
          'text/csv',
          'text/plain'
        ];
        const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

        if (!ALLOWED_MIME_TYPES.includes(documentAttachment.type)) {
          return res.status(400).json({ 
            error: 'Invalid file type. Allowed types: PDF, PNG, JPEG, TIFF, Excel (XLSX, XLS), CSV, TXT' 
          });
        }

        attachmentBuffer = Buffer.from(documentAttachment.data, 'base64');

        if (attachmentBuffer.byteLength > MAX_SIZE_BYTES) {
          return res.status(400).json({ error: 'File too large. Maximum size is 10MB' });
        }

        attachmentMetadata = {
          filename: documentAttachment.filename,
          mimeType: documentAttachment.type,
          documentType: documentAttachment.type
        };

        console.log(`[SSE] Document attachment validated: ${documentAttachment.filename} (${attachmentBuffer.byteLength} bytes)`);
      }

      // Get or create conversation
      let conversation;
      if (conversationId) {
        conversation = await storage.getConversation(conversationId);
        if (!conversation || conversation.userId !== userId) {
          return res.status(403).json({ error: 'Conversation not found or unauthorized' });
        }
      } else {
        conversation = await storage.createConversation({
          userId,
          title: query.substring(0, 50),
          profileId
        });
      }

      // Get conversation history
      const history = await storage.getConversationMessages(conversation.id);
      const conversationHistory = history.map(msg => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content
      }));

      // Save user message
      const userMessage = await storage.createMessage({
        conversationId: conversation.id,
        role: 'user',
        content: query,
        modelUsed: null,
        routingDecision: null,
        calculationResults: null,
        tokensUsed: null
      });

      // Process user message analytics (non-blocking)
      AnalyticsProcessor.processMessage({
        messageId: userMessage.id,
        conversationId: conversation.id,
        userId,
        role: 'user',
        content: query,
        previousMessages: conversationHistory
      }).catch(err => console.error('[SSE] Analytics error:', err));

      // Set up Server-Sent Events
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

      // Helper function to send SSE messages
      const sendSSE = (data: any) => {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      };

      // Send start signal
      sendSSE({
        type: 'start',
        conversationId: conversation.id,
        messageId: userMessage.id
      });

      try {
        // Process query and get response
        const result = await aiOrchestrator.processQuery(
          query,
          conversationHistory,
          userTier,
          { 
            chatMode,
            attachment: attachmentBuffer && attachmentMetadata ? {
              buffer: attachmentBuffer,
              filename: attachmentMetadata.filename,
              mimeType: attachmentMetadata.mimeType,
              documentType: attachmentMetadata.documentType
            } : undefined
          }
        );

        const fullResponse = result.response;

        // Stream response in chunks
        const chunkSize = 50;
        for (let i = 0; i < fullResponse.length; i += chunkSize) {
          const chunk = fullResponse.slice(i, i + chunkSize);
          sendSSE({
            type: 'chunk',
            content: chunk
          });
          await new Promise(resolve => setTimeout(resolve, 10));
        }

        // Build metadata object
        const metadata: any = {};
        if (result.metadata.showInOutputPane) {
          metadata.showInOutputPane = true;
        }
        if (result.metadata.visualization) {
          metadata.visualization = result.metadata.visualization;
        }

        // Save assistant message with metadata
        const assistantMessage = await storage.createMessage({
          conversationId: conversation.id,
          role: 'assistant',
          content: fullResponse,
          modelUsed: result.modelUsed,
          routingDecision: result.routingDecision,
          calculationResults: result.calculationResults,
          tokensUsed: result.tokensUsed,
          metadata: Object.keys(metadata).length > 0 ? metadata : null
        });

        // Process assistant message analytics (non-blocking)
        AnalyticsProcessor.processMessage({
          messageId: assistantMessage.id,
          conversationId: conversation.id,
          userId,
          role: 'assistant',
          content: fullResponse,
          previousMessages: [...conversationHistory, { role: 'user', content: query }]
        }).catch(err => console.error('[SSE] Analytics error:', err));

        // Send end signal with metadata
        sendSSE({
          type: 'end',
          messageId: assistantMessage.id,
          metadata: {
            tokensUsed: result.tokensUsed,
            modelUsed: result.modelUsed,
            processingTimeMs: result.processingTimeMs,
            showInOutputPane: result.metadata.showInOutputPane,
            visualization: result.metadata.visualization
          }
        });

        res.end();
      } catch (error: any) {
        console.error('[SSE] Chat stream error:', error);
        sendSSE({
          type: 'error',
          error: error.message || 'An error occurred while processing your request'
        });
        res.end();
      }
    } catch (error: any) {
      console.error('[SSE] Request error:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: error.message || 'Internal server error' });
      } else {
        res.end();
      }
    }
  });

  const httpServer = createServer(app);
  
  // WebSocket removed - now using Server-Sent Events (SSE) for chat streaming
  // See POST /api/chat/stream endpoint above
  
  return httpServer;
}
