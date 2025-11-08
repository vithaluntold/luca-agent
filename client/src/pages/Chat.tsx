import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import ChatSidebar from "@/components/ChatSidebar";
import ChatHeader from "@/components/ChatHeader";
import ChatMessage from "@/components/ChatMessage";
import ChatInput from "@/components/ChatInput";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/lib/auth";
import { chatApi, conversationApi } from "@/lib/api";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  metadata?: any;
}

export default function Chat() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeConversation, setActiveConversation] = useState<string | undefined>();
  const [messages, setMessages] = useState<Message[]>([]);
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  // Redirect if not authenticated
  useEffect(() => {
    if (!user) {
      setLocation('/auth');
    }
  }, [user, setLocation]);

  // Fetch conversations
  const { data: conversationsData } = useQuery({
    queryKey: ['/api/conversations'],
    enabled: !!user,
    queryFn: () => conversationApi.getAll(),
  });

  // Fetch messages for active conversation
  const { data: messagesData } = useQuery({
    queryKey: ['/api/conversations', activeConversation, 'messages'],
    enabled: !!activeConversation,
    queryFn: () => conversationApi.getMessages(activeConversation!),
  });

  useEffect(() => {
    if (messagesData?.messages) {
      setMessages(messagesData.messages.map(msg => ({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        timestamp: new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        metadata: msg.calculationResults
      })));
    }
  }, [messagesData]);

  // Send message mutation
  const sendMessageMutation = useMutation({
    mutationFn: (content: string) => chatApi.sendMessage({
      conversationId: activeConversation,
      message: content
    }),
    onSuccess: (data) => {
      // Update active conversation if new
      if (!activeConversation) {
        setActiveConversation(data.conversationId);
      }
      
      // Add assistant message to UI
      setMessages(prev => [...prev, {
        id: data.message.id,
        role: 'assistant',
        content: data.message.content,
        timestamp: new Date(data.message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        metadata: data.metadata.calculationResults
      }]);
      
      // Invalidate conversations list to show new/updated conversation
      queryClient.invalidateQueries({ queryKey: ['/api/conversations'] });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to send message"
      });
    }
  });

  const handleSendMessage = (content: string) => {
    if (!user) return;
    
    // Add user message to UI immediately
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    
    setMessages(prev => [...prev, userMessage]);
    sendMessageMutation.mutate(content);
  };

  const handleNewChat = () => {
    setActiveConversation(undefined);
    setMessages([]);
  };

  if (!user) {
    return null;
  }

  const conversations = conversationsData?.conversations || [];

  return (
    <div className="flex h-screen">
      {sidebarOpen && (
        <ChatSidebar 
          conversations={conversations.map(conv => ({
            id: conv.id,
            title: conv.title,
            preview: conv.preview || '',
            timestamp: new Date(conv.updatedAt).toLocaleDateString()
          }))}
          activeId={activeConversation}
          onSelectConversation={(id) => setActiveConversation(id)}
          onNewChat={handleNewChat}
        />
      )}
      
      <div className="flex-1 flex flex-col">
        <ChatHeader onMenuToggle={() => setSidebarOpen(!sidebarOpen)} />
        
        <ScrollArea className="flex-1">
          <div className="max-w-4xl mx-auto p-6">
            {messages.length === 0 && (
              <div className="text-center py-12">
                <h2 className="text-2xl font-semibold mb-4">Welcome to Luca</h2>
                <p className="text-muted-foreground">
                  Your accounting superintelligence is ready. Ask me anything about tax, audit, 
                  financial reporting, or compliance across global jurisdictions.
                </p>
              </div>
            )}
            {messages.map((message) => (
              <ChatMessage
                key={message.id}
                role={message.role}
                content={message.content}
                timestamp={message.timestamp}
              />
            ))}
            {sendMessageMutation.isPending && (
              <div className="flex gap-4 mb-6">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-accent animate-pulse" />
                <div className="flex-1">
                  <div className="text-sm text-muted-foreground">Luca is thinking...</div>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
        
        <ChatInput 
          onSend={handleSendMessage} 
          disabled={sendMessageMutation.isPending}
        />
      </div>
    </div>
  );
}
