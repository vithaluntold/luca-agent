/**
 * WebSocket Hook for Real-Time Chat Streaming
 * Provides connection management and message handling
 */

import { useState, useEffect, useRef, useCallback } from 'react';

interface ChatMessage {
  type: 'start' | 'chunk' | 'end' | 'error' | 'connected';
  conversationId?: string;
  messageId?: string;
  content?: string;
  error?: string;
  metadata?: any;
}

interface UseWebSocketReturn {
  sendMessage: (message: {
    query: string;
    conversationId?: string | null;
    userId: string;
    userTier: string;
    profileId?: string | null;
  }) => void;
  isConnected: boolean;
  isStreaming: boolean;
  streamingContent: string;
  error: string | null;
  conversationId: string | null;
  metadata: any | null;
}

export function useWebSocket(): UseWebSocketReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<any | null>(null);
  
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/chat`;

    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('[WebSocket] Connected to chat server');
      setIsConnected(true);
      setError(null);
      reconnectAttemptsRef.current = 0;
    };

    ws.onmessage = (event) => {
      try {
        const message: ChatMessage = JSON.parse(event.data);

        switch (message.type) {
          case 'connected':
            console.log('[WebSocket] Connection confirmed');
            break;

          case 'start':
            console.log('[WebSocket] Stream started:', message.conversationId);
            setIsStreaming(true);
            setStreamingContent('');
            setError(null);
            if (message.conversationId) {
              setConversationId(message.conversationId);
            }
            break;

          case 'chunk':
            if (message.content) {
              setStreamingContent(prev => prev + message.content);
            }
            break;

          case 'end':
            console.log('[WebSocket] Stream ended');
            setIsStreaming(false);
            if (message.metadata) {
              setMetadata(message.metadata);
            }
            break;

          case 'error':
            console.error('[WebSocket] Error:', message.error);
            setError(message.error || 'An error occurred');
            setIsStreaming(false);
            break;
        }
      } catch (err) {
        console.error('[WebSocket] Failed to parse message:', err);
      }
    };

    ws.onerror = (event) => {
      console.error('[WebSocket] Error:', event);
      setError('WebSocket connection error');
    };

    ws.onclose = () => {
      console.log('[WebSocket] Disconnected');
      setIsConnected(false);
      setIsStreaming(false);
      wsRef.current = null;

      // Attempt to reconnect with exponential backoff
      if (reconnectAttemptsRef.current < 5) {
        const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 10000);
        console.log(`[WebSocket] Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current + 1})`);
        
        reconnectTimeoutRef.current = setTimeout(() => {
          reconnectAttemptsRef.current++;
          connect();
        }, delay);
      }
    };

    wsRef.current = ws;
  }, []);

  const sendMessage = useCallback((message: {
    query: string;
    conversationId?: string | null;
    userId: string;
    userTier: string;
    profileId?: string | null;
  }) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      setError('WebSocket not connected');
      return;
    }

    setStreamingContent('');
    setError(null);
    setMetadata(null);

    wsRef.current.send(JSON.stringify({
      type: 'chat',
      ...message
    }));
  }, []);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  return {
    sendMessage,
    isConnected,
    isStreaming,
    streamingContent,
    error,
    conversationId,
    metadata
  };
}
