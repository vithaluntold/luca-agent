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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/lib/auth";
import { chatApi, conversationApi } from "@/lib/api";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import OutputPane from "@/components/OutputPane";
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
  Building2,
  Briefcase,
  Users,
  UserCircle2,
  MoreVertical,
  Pin,
  PinOff,
  Edit3,
  Share2,
  Trash2,
  Copy,
  Check,
  Paperclip,
  X,
  FileText,
  Moon,
  Sun,
  Sparkles,
  ListChecks,
  Network,
  FileBarChart,
  Calculator,
  ChevronDown
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
  profileId: string | null;
  pinned: boolean;
  isShared: boolean;
  sharedToken: string | null;
}

interface Profile {
  id: string;
  name: string;
  type: 'business' | 'personal' | 'family';
  isDefault: boolean;
}

export default function Chat() {
  const [leftPaneCollapsed, setLeftPaneCollapsed] = useState(false);
  const [rightPaneCollapsed, setRightPaneCollapsed] = useState(false);
  const [activeConversation, setActiveConversation] = useState<string | undefined>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedProfileFilter, setSelectedProfileFilter] = useState<string>("all");
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameConvId, setRenameConvId] = useState<string>("");
  const [renameValue, setRenameValue] = useState("");
  const [shareUrl, setShareUrl] = useState<string>("");
  const [showShareCopied, setShowShareCopied] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const [chatMode, setChatMode] = useState<string>('standard');
  const { user, logout, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const chatModes = [
    { id: 'standard', label: 'Standard Chat', icon: MessageSquare, description: 'General accounting advice' },
    { id: 'deep-research', label: 'Deep Research', icon: Sparkles, description: 'Comprehensive analysis with sources', color: 'text-primary' },
    { id: 'checklist', label: 'Create Checklist', icon: ListChecks, description: 'Structured task lists', color: 'text-success' },
    { id: 'workflow', label: 'Workflow Visualization', icon: Network, description: 'Process diagrams & flows', color: 'text-secondary' },
    { id: 'audit-plan', label: 'Audit Plan', icon: FileBarChart, description: 'Comprehensive audit approach', color: 'text-gold' },
    { id: 'calculation', label: 'Financial Calculation', icon: Calculator, description: 'Tax & financial computations', color: 'text-accent' },
  ];

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme');
    const isDarkMode = savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches);
    setIsDark(isDarkMode);
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, []);

  const toggleTheme = () => {
    const newIsDark = !isDark;
    setIsDark(newIsDark);
    if (newIsDark) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  };

  // Clear active conversation when profile filter changes
  useEffect(() => {
    setActiveConversation(undefined);
    setMessages([]);
  }, [selectedProfileFilter]);

  // Only show output pane content for document/visualization/export/calculation responses
  const outputContent = messages
    .filter(m => m.role === 'assistant' && m.metadata?.showInOutputPane)
    .map(m => m.content)
    .join('\n\n---\n\n');

  useEffect(() => {
    if (!isLoading && !user) {
      setLocation('/auth');
    }
  }, [user, isLoading, setLocation]);

  const { data: profilesData } = useQuery<{ profiles: Profile[] }>({
    queryKey: ['/api/profiles'],
    enabled: !!user,
  });

  const profiles: Profile[] = profilesData?.profiles || [];
  const defaultProfile = profiles.find(p => p.isDefault);

  const { data: conversationsData } = useQuery({
    queryKey: ['/api/conversations', selectedProfileFilter],
    enabled: !!user,
    queryFn: () => {
      if (selectedProfileFilter === 'all') {
        return conversationApi.getAll();
      } else if (selectedProfileFilter === 'none') {
        return fetch(`/api/conversations?profileId=null`, {
          credentials: 'include'
        }).then(res => res.json());
      } else {
        return fetch(`/api/conversations?profileId=${selectedProfileFilter}`, {
          credentials: 'include'
        }).then(res => res.json());
      }
    },
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
    mutationFn: async ({ content, file }: { content: string; file: File | null }) => {
      // Determine which profile to use for new conversations
      let profileIdToUse: string | null | undefined = undefined;
      if (!activeConversation) {
        // Creating a new conversation - use selected filter if it's a specific profile
        if (selectedProfileFilter !== 'all' && selectedProfileFilter !== 'none') {
          profileIdToUse = selectedProfileFilter;
        } else if (selectedProfileFilter === 'none') {
          profileIdToUse = null;
        } else if (defaultProfile) {
          // No filter or "all" selected - use default profile
          profileIdToUse = defaultProfile.id;
        }
      }
      
      // If there's a file attached, upload it first
      let fileData: any = null;
      if (file) {
        setUploadingFile(true);
        try {
          const formData = new FormData();
          formData.append('file', file);
          
          const uploadRes = await fetch('/api/chat/upload-file', {
            method: 'POST',
            credentials: 'include',
            body: formData
          });
          
          if (!uploadRes.ok) {
            throw new Error('File upload failed');
          }
          
          const uploadData = await uploadRes.json();
          fileData = uploadData.file;
        } finally {
          setUploadingFile(false);
        }
      }
      
      // Preserve user's text message and send file data separately
      const messageContent = content.trim() || (fileData ? 'Please analyze this document' : '');
      
      return chatApi.sendMessage({
        conversationId: activeConversation,
        message: messageContent,
        profileId: profileIdToUse,
        chatMode: chatMode,
        documentAttachment: fileData ? {
          data: fileData.base64Data,
          type: fileData.type, // MIME type (e.g., application/pdf)
          filename: fileData.name
        } : undefined
      });
    },
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
      
      // Clear selected file after successful send
      setSelectedFile(null);
      
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
    if (!user) return;
    if (!inputMessage.trim() && !selectedFile) return;
    
    // Build message content - include both text and filename if both are present
    const messageContent = inputMessage.trim() 
      ? (selectedFile ? `${inputMessage} [Attached: ${selectedFile.name}]` : inputMessage)
      : (selectedFile ? `[Attached: ${selectedFile.name}]` : '');
    
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: messageContent,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    
    setMessages(prev => [...prev, userMessage]);
    // CRITICAL: Pass file to mutation as parameter, not from state
    // State will be cleared immediately, but mutation needs the file
    const fileToSend = selectedFile;
    sendMessageMutation.mutate({ content: messageContent, file: fileToSend });
    // Clear UI state immediately
    setInputMessage("");
    setSelectedFile(null);
  };

  const handleNewChat = () => {
    setActiveConversation(undefined);
    setMessages([]);
    setSelectedFile(null);
  };

  const handleLogout = () => {
    logout();
    setLocation('/');
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Validate file type - only formats supported by Azure Document Intelligence
      const allowedTypes = [
        'application/pdf',
        'image/jpeg',
        'image/png',
        'image/jpg',
        'image/tiff',
        'image/tif'
      ];
      
      if (!allowedTypes.includes(file.type)) {
        toast({
          variant: "destructive",
          title: "Invalid file type",
          description: "Supported formats: PDF, PNG, JPEG, TIFF"
        });
        return;
      }
      
      // Validate file size (10MB limit for chat)
      if (file.size > 10 * 1024 * 1024) {
        toast({
          variant: "destructive",
          title: "File too large",
          description: "Maximum file size is 10MB."
        });
        return;
      }
      
      setSelectedFile(file);
    }
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
  };

  // Conversation management mutations
  const pinMutation = useMutation({
    mutationFn: async (convId: string) => {
      const res = await fetch(`/api/conversations/${convId}/pin`, {
        method: 'PATCH',
        credentials: 'include'
      });
      if (!res.ok) throw new Error('Failed to pin conversation');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/conversations'] });
      toast({ title: "Conversation updated" });
    }
  });

  const renameMutation = useMutation({
    mutationFn: async ({ convId, title }: { convId: string, title: string }) => {
      const res = await fetch(`/api/conversations/${convId}/rename`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ title })
      });
      if (!res.ok) throw new Error('Failed to rename conversation');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/conversations'] });
      setRenameDialogOpen(false);
      toast({ title: "Conversation renamed" });
    }
  });

  const shareMutation = useMutation({
    mutationFn: async (convId: string) => {
      const res = await fetch(`/api/conversations/${convId}/share`, {
        method: 'POST',
        credentials: 'include'
      });
      if (!res.ok) throw new Error('Failed to share conversation');
      return res.json();
    },
    onSuccess: async (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/conversations'] });
      setShareUrl(data.shareUrl);
      
      // Try to copy to clipboard with error handling
      try {
        await navigator.clipboard.writeText(data.shareUrl);
        setShowShareCopied(true);
        setTimeout(() => setShowShareCopied(false), 2000);
        toast({ title: "Share link copied to clipboard!" });
      } catch (error) {
        // Fallback if clipboard access denied
        toast({ 
          title: "Share link created",
          description: "Copy this link: " + data.shareUrl
        });
      }
    }
  });

  const unshareMutation = useMutation({
    mutationFn: async (convId: string) => {
      const res = await fetch(`/api/conversations/${convId}/share`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (!res.ok) throw new Error('Failed to unshare conversation');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/conversations'] });
      toast({ title: "Conversation unshared" });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (convId: string) => {
      const res = await fetch(`/api/conversations/${convId}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (!res.ok) throw new Error('Failed to delete conversation');
      return { convId };
    },
    onSuccess: ({ convId }) => {
      // Clear active conversation if we're deleting the currently active one
      if (activeConversation === convId) {
        setActiveConversation(undefined);
        setMessages([]);
      }
      queryClient.invalidateQueries({ queryKey: ['/api/conversations'] });
      toast({ title: "Conversation deleted" });
    }
  });

  const handleRename = (convId: string, currentTitle: string) => {
    setRenameConvId(convId);
    setRenameValue(currentTitle);
    setRenameDialogOpen(true);
  };

  const confirmRename = () => {
    if (renameValue.trim()) {
      renameMutation.mutate({ convId: renameConvId, title: renameValue.trim() });
    }
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
            <div className="h-8 w-8 rounded-md bg-gradient-to-r from-primary to-secondary flex items-center justify-center glow-primary">
              <span className="text-white font-bold text-sm">L</span>
            </div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
              Luca
            </h1>
          </div>
          <Separator orientation="vertical" className="h-6" />
          <span className="text-sm text-muted-foreground">Accounting Superintelligence</span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            data-testid="button-theme-toggle"
          >
            {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </Button>
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

                <div className="px-3 py-2 space-y-2 border-b">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase px-1">
                    Professional Features
                  </h3>
                  <div className="space-y-1">
                    <Button
                      variant="ghost"
                      className="w-full justify-start gap-2 h-9"
                      onClick={() => setLocation('/scenarios')}
                      data-testid="button-nav-scenarios"
                    >
                      <Sparkles className="h-4 w-4" />
                      <span className="text-sm">Scenario Simulator</span>
                    </Button>
                    <Button
                      variant="ghost"
                      className="w-full justify-start gap-2 h-9"
                      onClick={() => setLocation('/deliverables')}
                      data-testid="button-nav-deliverables"
                    >
                      <FileText className="h-4 w-4" />
                      <span className="text-sm">Deliverable Composer</span>
                    </Button>
                    <Button
                      variant="ghost"
                      className="w-full justify-start gap-2 h-9"
                      onClick={() => setLocation('/forensics')}
                      data-testid="button-nav-forensics"
                    >
                      <Search className="h-4 w-4" />
                      <span className="text-sm">Forensic Intelligence</span>
                    </Button>
                  </div>
                </div>

                <div className="px-3 py-2 space-y-2 border-b">
                  <Select value={selectedProfileFilter} onValueChange={setSelectedProfileFilter}>
                    <SelectTrigger data-testid="select-profile-filter">
                      <SelectValue placeholder="All Profiles" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all" data-testid="option-profile-all">
                        <div className="flex items-center gap-2">
                          <Briefcase className="h-4 w-4" />
                          <span>All Profiles</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="none" data-testid="option-profile-none">
                        <div className="flex items-center gap-2">
                          <MessageSquare className="h-4 w-4" />
                          <span>No Profile</span>
                        </div>
                      </SelectItem>
                      {profiles.map(profile => (
                        <SelectItem key={profile.id} value={profile.id} data-testid={`option-profile-${profile.id}`}>
                          <div className="flex items-center gap-2">
                            {profile.type === 'business' && <Briefcase className="h-4 w-4" />}
                            {profile.type === 'personal' && <UserCircle2 className="h-4 w-4" />}
                            {profile.type === 'family' && <Users className="h-4 w-4" />}
                            <span>{profile.name}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

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
                      <div
                        key={conv.id}
                        className={`group relative flex items-center gap-1 rounded-md ${
                          activeConversation === conv.id
                            ? 'bg-primary/10 border border-primary/20'
                            : ''
                        }`}
                      >
                        <button
                          onClick={() => setActiveConversation(conv.id)}
                          className="flex-1 text-left px-3 py-2 hover-elevate transition-colors"
                          data-testid={`conversation-${conv.id}`}
                        >
                          <div className="flex items-center gap-2">
                            {conv.pinned ? (
                              <Pin className="h-4 w-4 flex-shrink-0 text-primary" />
                            ) : (
                              <MessageSquare className="h-4 w-4 flex-shrink-0" />
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{conv.title}</p>
                            </div>
                          </div>
                        </button>
                        
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                              data-testid={`button-conversation-menu-${conv.id}`}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem 
                              onClick={() => pinMutation.mutate(conv.id)}
                              data-testid={`menu-item-pin-${conv.id}`}
                            >
                              {conv.pinned ? (
                                <><PinOff className="mr-2 h-4 w-4" /> Unpin</>
                              ) : (
                                <><Pin className="mr-2 h-4 w-4" /> Pin</>
                              )}
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => handleRename(conv.id, conv.title)}
                              data-testid={`menu-item-rename-${conv.id}`}
                            >
                              <Edit3 className="mr-2 h-4 w-4" />
                              Rename
                            </DropdownMenuItem>
                            {conv.isShared ? (
                              <DropdownMenuItem 
                                onClick={() => unshareMutation.mutate(conv.id)}
                                data-testid={`menu-item-unshare-${conv.id}`}
                              >
                                <Share2 className="mr-2 h-4 w-4" />
                                Unshare
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem 
                                onClick={() => shareMutation.mutate(conv.id)}
                                data-testid={`menu-item-share-${conv.id}`}
                              >
                                <Share2 className="mr-2 h-4 w-4" />
                                Share
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem 
                              onClick={() => deleteMutation.mutate(conv.id)}
                              className="text-destructive"
                              data-testid={`menu-item-delete-${conv.id}`}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
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

            <div className="border-t p-4 pb-20">
              <div className="max-w-4xl mx-auto space-y-3">
                {/* Advanced Chat Options */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-muted-foreground">Professional Mode:</span>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className={`gap-2 ${chatModes.find(m => m.id === chatMode)?.color || ''}`}
                          data-testid="button-chat-mode"
                        >
                          {(() => {
                            const mode = chatModes.find(m => m.id === chatMode);
                            const Icon = mode?.icon || MessageSquare;
                            return (
                              <>
                                <Icon className="h-4 w-4" />
                                <span>{mode?.label || 'Standard Chat'}</span>
                                <ChevronDown className="h-3 w-3 opacity-50" />
                              </>
                            );
                          })()}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-80">
                        {chatModes.map((mode) => {
                          const Icon = mode.icon;
                          return (
                            <DropdownMenuItem
                              key={mode.id}
                              onClick={() => setChatMode(mode.id)}
                              className="flex flex-col items-start gap-1 py-3 cursor-pointer"
                              data-testid={`chat-mode-${mode.id}`}
                            >
                              <div className="flex items-center gap-2 w-full">
                                <Icon className={`h-4 w-4 ${mode.color || 'text-muted-foreground'}`} />
                                <span className="font-medium">{mode.label}</span>
                                {chatMode === mode.id && <Check className="h-4 w-4 ml-auto text-primary" />}
                              </div>
                              <p className="text-xs text-muted-foreground">{mode.description}</p>
                            </DropdownMenuItem>
                          );
                        })}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                {/* File Preview */}
                {selectedFile && (
                  <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                    <FileText className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{selectedFile.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {(selectedFile.size / 1024).toFixed(1)} KB
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handleRemoveFile}
                      data-testid="button-remove-file"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                )}
                
                {/* Message Input */}
                <div className="flex gap-2">
                  <input
                    type="file"
                    id="file-upload"
                    className="hidden"
                    onChange={handleFileSelect}
                    accept=".pdf,.jpg,.jpeg,.png,.tiff,.tif"
                    data-testid="input-file-upload"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => document.getElementById('file-upload')?.click()}
                    data-testid="button-attach-file"
                  >
                    <Paperclip className="h-4 w-4" />
                  </Button>
                  <Input
                    placeholder={
                      chatMode === 'deep-research' ? "What would you like me to research in depth?" :
                      chatMode === 'checklist' ? "Describe the task for a checklist..." :
                      chatMode === 'workflow' ? "Describe the process to visualize..." :
                      chatMode === 'audit-plan' ? "What type of audit do you need?" :
                      chatMode === 'calculation' ? "What would you like me to calculate?" :
                      "Ask anything about accounting, tax, audit..."
                    }
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
                    variant="default"
                    onClick={handleSendMessage}
                    disabled={(inputMessage.trim() === '' && !selectedFile) || sendMessageMutation.isPending || uploadingFile}
                    className="glow-primary"
                    data-testid="button-send"
                  >
                    {uploadingFile ? (
                      <span className="text-xs">Uploading...</span>
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            </div>
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

      {/* Rename Dialog */}
      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent data-testid="dialog-rename-conversation">
          <DialogHeader>
            <DialogTitle>Rename Conversation</DialogTitle>
            <DialogDescription>
              Enter a new title for this conversation.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                confirmRename();
              }
            }}
            placeholder="Conversation title"
            data-testid="input-rename-title"
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRenameDialogOpen(false)}
              data-testid="button-cancel-rename"
            >
              Cancel
            </Button>
            <Button
              onClick={confirmRename}
              disabled={!renameValue.trim()}
              data-testid="button-confirm-rename"
            >
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
