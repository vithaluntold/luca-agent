import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/lib/auth";
import { chatApi, conversationApi } from "@/lib/api";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import OutputPane from "@/components/OutputPane";
import FinACEverseBadge from "@/components/FinACEverseBadge";
import ReactMarkdown from "react-markdown";
import {
  Plus,
  Send,
  MessageSquare,
  Settings,
  LogOut,
  User,
  Minimize2,
  Maximize2,
  Search,
  Building2
} from "lucide-react";

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  metadata?: any;
}

interface Conversation {
  id: string;
  title: string;
  preview: string | null;
  updatedAt: string;
}

export default function Chat() {
  const [leftPaneCollapsed, setLeftPaneCollapsed] = useState(false);
  const [rightPaneCollapsed, setRightPaneCollapsed] = useState(false);
  const [activeConversation, setActiveConversation] = useState<string | undefined>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const outputContent = messages
    .filter(m => m.role === 'assistant')
    .map(m => m.content)
    .join('\n\n---\n\n');

  useEffect(() => {
    if (!user) {
      setLocation('/auth');
    }
  }, [user, setLocation]);

  const { data: conversationsData } = useQuery({
    queryKey: ['/api/conversations'],
    enabled: !!user,
    queryFn: () => conversationApi.getAll(),
  });

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

  const sendMessageMutation = useMutation({
    mutationFn: (content: string) => chatApi.sendMessage({
      conversationId: activeConversation,
      message: content
    }),
    onSuccess: (data) => {
      if (!activeConversation) {
        setActiveConversation(data.conversationId);
      }
      
      setMessages(prev => [...prev, {
        id: data.message.id,
        role: 'assistant',
        content: data.message.content,
        timestamp: new Date(data.message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        metadata: data.metadata.calculationResults
      }]);
      
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

  const handleSendMessage = () => {
    if (!user || !inputMessage.trim()) return;
    
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: inputMessage,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    
    setMessages(prev => [...prev, userMessage]);
    sendMessageMutation.mutate(inputMessage);
    setInputMessage("");
  };

  const handleNewChat = () => {
    setActiveConversation(undefined);
    setMessages([]);
  };

  const handleLogout = () => {
    logout();
    setLocation('/');
  };

  if (!user) {
    return null;
  }

  const conversations: Conversation[] = conversationsData?.conversations || [];
  const filteredConversations = conversations.filter(c =>
    c.title.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Top Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-card">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-md bg-gradient-to-r from-pink-500 to-purple-600 flex items-center justify-center">
              <span className="text-white font-bold text-sm">L</span>
            </div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-pink-500 to-purple-600 bg-clip-text text-transparent">
              Luca
            </h1>
          </div>
          <Separator orientation="vertical" className="h-6" />
          <span className="text-sm text-muted-foreground">Accounting Superintelligence</span>
        </div>

        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" data-testid="button-user-menu">
                <User className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setLocation('/settings')} data-testid="menu-item-settings">
                <Settings className="mr-2 h-4 w-4" />
                Settings
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setLocation('/integrations')} data-testid="menu-item-integrations">
                <Building2 className="mr-2 h-4 w-4" />
                Integrations
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} data-testid="menu-item-logout">
                <LogOut className="mr-2 h-4 w-4" />
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* 3-Pane Resizable Layout */}
      <ResizablePanelGroup direction="horizontal" className="flex-1">
        {/* Left Pane: Sessions */}
        {!leftPaneCollapsed && (
          <>
            <ResizablePanel defaultSize={20} minSize={15} maxSize={35}>
              <div className="flex flex-col h-full bg-muted/30">
                <div className="flex items-center justify-between px-4 py-3 border-b">
                  <h2 className="font-semibold text-sm">Conversations</h2>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handleNewChat}
                      data-testid="button-new-chat"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setLeftPaneCollapsed(true)}
                      data-testid="button-collapse-left"
                    >
                      <Minimize2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="px-3 py-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search conversations..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-9"
                      data-testid="input-search-conversations"
                    />
                  </div>
                </div>

                <ScrollArea className="flex-1">
                  <div className="px-2 py-2 space-y-1">
                    {filteredConversations.map((conv) => (
                      <button
                        key={conv.id}
                        onClick={() => setActiveConversation(conv.id)}
                        className={`w-full text-left px-3 py-2 rounded-md hover-elevate transition-colors ${
                          activeConversation === conv.id
                            ? 'bg-accent text-accent-foreground'
                            : 'hover:bg-accent/50'
                        }`}
                        data-testid={`conversation-${conv.id}`}
                      >
                        <div className="flex items-start gap-2">
                          <MessageSquare className="h-4 w-4 mt-1 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{conv.title}</p>
                            <p className="text-xs text-muted-foreground truncate">{conv.preview || 'No preview'}</p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            </ResizablePanel>
            <ResizableHandle withHandle />
          </>
        )}

        {leftPaneCollapsed && (
          <div className="w-12 flex items-center justify-center border-r bg-muted/30">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setLeftPaneCollapsed(false)}
              data-testid="button-expand-left"
            >
              <Maximize2 className="h-4 w-4" />
            </Button>
          </div>
        )}

        {/* Middle Pane: Chat */}
        <ResizablePanel defaultSize={rightPaneCollapsed ? 80 : 50} minSize={30}>
          <div className="flex flex-col h-full">
            <ScrollArea className="flex-1 p-4">
              <div className="max-w-4xl mx-auto space-y-6">
                {messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center py-12">
                    <MessageSquare className="h-16 w-16 text-muted-foreground mb-4" />
                    <h3 className="text-lg font-semibold mb-2">Start a New Conversation</h3>
                    <p className="text-sm text-muted-foreground max-w-md">
                      Ask me anything about accounting, tax, audit, or financial reporting across global jurisdictions.
                    </p>
                  </div>
                ) : (
                  messages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[80%] rounded-lg px-4 py-3 ${
                          message.role === 'user'
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted'
                        }`}
                      >
                        {message.role === 'assistant' ? (
                          <div className="prose prose-sm dark:prose-invert max-w-none">
                            <ReactMarkdown>{message.content}</ReactMarkdown>
                          </div>
                        ) : (
                          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                        )}
                        <span className="text-xs opacity-70 mt-2 block">{message.timestamp}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>

            <div className="border-t p-4">
              <div className="max-w-4xl mx-auto flex gap-2">
                <Input
                  placeholder="Ask anything about accounting, tax, audit..."
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  className="flex-1"
                  data-testid="input-message"
                />
                <Button
                  onClick={handleSendMessage}
                  disabled={!inputMessage.trim() || sendMessageMutation.isPending}
                  data-testid="button-send"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
            
            <FinACEverseBadge />
          </div>
        </ResizablePanel>

        {/* Right Pane: Output */}
        {!rightPaneCollapsed && (
          <>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={30} minSize={20} maxSize={50}>
              <OutputPane
                content={outputContent}
                onCollapse={() => setRightPaneCollapsed(true)}
                isCollapsed={false}
              />
            </ResizablePanel>
          </>
        )}

        {rightPaneCollapsed && (
          <div className="w-12 flex items-center justify-center border-l bg-muted/30">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setRightPaneCollapsed(false)}
              data-testid="button-expand-right"
            >
              <Maximize2 className="h-4 w-4" />
            </Button>
          </div>
        )}
      </ResizablePanelGroup>
    </div>
  );
}
