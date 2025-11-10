/**
 * WebSocket Server for Real-Time Chat Streaming
 * Provides bi-directional communication for streaming AI responses
 */

import { WebSocketServer, WebSocket } from 'ws';
import type { Server, IncomingMessage } from 'http';
import { aiOrchestrator } from './services/aiOrchestrator';
import { storage } from './pgStorage';
import { sessionStore, SESSION_SECRET } from './index';
import type { SessionData } from 'express-session';
import cookie from 'cookie';
import signature from 'cookie-signature';

interface ChatStreamMessage {
  type: 'start' | 'chunk' | 'end' | 'error';
  conversationId?: string;
  messageId?: string;
  content?: string;
  error?: string;
  metadata?: any;
}

interface AuthenticatedWebSocket extends WebSocket {
  userId: string;
  userTier: string;
}

/**
 * Extract and validate session from WebSocket request
 */
async function validateSession(req: IncomingMessage): Promise<{ userId: string; userTier: string } | null> {
  try {
    const cookies = cookie.parse(req.headers.cookie || '');
    const sessionCookie = cookies['luca.sid'];
    
    if (!sessionCookie) {
      console.log('[WebSocket] No session cookie');
      return null;
    }

    // Unsign the session cookie
    const sid = signature.unsign(sessionCookie.slice(2), SESSION_SECRET); // Remove 's:' prefix
    
    if (!sid) {
      console.log('[WebSocket] Invalid session signature');
      return null;
    }

    // Get session from store
    return new Promise((resolve) => {
      sessionStore.get(sid as string, (err: any, session: SessionData | null | undefined) => {
        if (err || !session) {
          console.log('[WebSocket] Session not found or error:', err);
          resolve(null);
          return;
        }

        // Extract userId from session
        const userId = (session as any).userId;
        
        if (!userId) {
          console.log('[WebSocket] No userId in session');
          resolve(null);
          return;
        }

        // Get user to retrieve tier
        storage.getUser(userId).then(user => {
          if (!user) {
            console.log('[WebSocket] User not found in database');
            resolve(null);
            return;
          }
          
          resolve({
            userId: user.id,
            userTier: user.subscriptionTier
          });
        }).catch(err => {
          console.error('[WebSocket] Error fetching user:', err);
          resolve(null);
        });
      });
    });
  } catch (error) {
    console.error('[WebSocket] Session validation error:', error);
    return null;
  }
}

export function setupWebSocket(server: Server) {
  const wss = new WebSocketServer({ 
    server,
    path: '/ws/chat',
    // Verify client has a session cookie before accepting connection
    verifyClient: (info) => {
      const cookies = cookie.parse(info.req.headers.cookie || '');
      return !!cookies['luca.sid'];
    }
  });

  wss.on('connection', async (ws: WebSocket, req: IncomingMessage) => {
    console.log('[WebSocket] Client connecting from:', req.socket.remoteAddress);

    // SECURITY: Validate session and extract userId server-side
    const sessionUser = await validateSession(req);
    
    if (!sessionUser) {
      console.log('[WebSocket] Authentication failed - closing connection');
      ws.send(JSON.stringify({ 
        type: 'error', 
        error: 'Authentication required. Please log in.' 
      }));
      ws.close(1008, 'Authentication required'); // Policy violation
      return;
    }

    // Attach authenticated user to WebSocket connection
    const authenticatedWs = ws as AuthenticatedWebSocket;
    authenticatedWs.userId = sessionUser.userId;
    authenticatedWs.userTier = sessionUser.userTier;
    
    console.log('[WebSocket] Authenticated user:', sessionUser.userId);

    ws.on('message', async (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        
        if (message.type === 'chat') {
          await handleChatStream(authenticatedWs, message);
        } else if (message.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong' }));
        }
      } catch (error) {
        console.error('[WebSocket] Message handling error:', error);
        sendError(ws, 'Invalid message format');
      }
    });

    ws.on('close', () => {
      console.log('[WebSocket] Client disconnected:', sessionUser.userId);
    });

    ws.on('error', (error) => {
      console.error('[WebSocket] Connection error:', error);
    });

    // Send initial connection success
    ws.send(JSON.stringify({ type: 'connected', userId: sessionUser.userId }));
  });

  console.log('[WebSocket] Server initialized on /ws/chat with session authentication');
  return wss;
}

async function handleChatStream(ws: AuthenticatedWebSocket, message: any) {
  const { 
    conversationId, 
    query, 
    profileId = null,
    chatMode = 'standard'
  } = message;

  try {
    // Validate required fields
    if (!query) {
      sendError(ws, 'Missing query');
      return;
    }

    // SECURITY: Use session-derived userId and userTier only
    // Never trust client-provided authentication data
    const userId = ws.userId;
    const userTier = ws.userTier;

    // Get or create conversation
    let conversation;
    if (conversationId) {
      conversation = await storage.getConversation(conversationId);
      if (!conversation || conversation.userId !== userId) {
        sendError(ws, 'Conversation not found or unauthorized');
        return;
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

    // Send start signal
    send(ws, {
      type: 'start',
      conversationId: conversation.id,
      messageId: userMessage.id
    });

    // Process query and stream response
    let fullResponse = '';
    const result = await aiOrchestrator.processQuery(
      query,
      conversationHistory,
      userTier,
      { chatMode }
    );

    // For now, send the complete response
    // TODO: Implement true streaming with provider support
    fullResponse = result.response;

    // Send response chunks (simulated streaming)
    const chunkSize = 50;
    for (let i = 0; i < fullResponse.length; i += chunkSize) {
      const chunk = fullResponse.slice(i, i + chunkSize);
      send(ws, {
        type: 'chunk',
        content: chunk
      });
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    // Save assistant message
    const assistantMessage = await storage.createMessage({
      conversationId: conversation.id,
      role: 'assistant',
      content: fullResponse,
      modelUsed: result.modelUsed,
      routingDecision: result.routingDecision,
      calculationResults: result.calculationResults,
      tokensUsed: result.tokensUsed
    });

    // Send end signal with metadata
    send(ws, {
      type: 'end',
      messageId: assistantMessage.id,
      metadata: {
        tokensUsed: result.tokensUsed,
        modelUsed: result.modelUsed,
        processingTimeMs: result.processingTimeMs
      }
    });

  } catch (error: any) {
    console.error('[WebSocket] Chat stream error:', error);
    sendError(ws, error.message || 'An error occurred while processing your request');
  }
}

function send(ws: WebSocket, message: ChatStreamMessage) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

function sendError(ws: WebSocket, error: string) {
  send(ws, { type: 'error', error });
}
