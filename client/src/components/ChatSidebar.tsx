import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Plus, MessageSquare, Settings, LogOut, Sparkles, FileText, Search, MoreVertical, Pin, Edit3, Share2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Link, useLocation } from "wouter";

interface Conversation {
  id: string;
  title: string;
  preview: string;
  timestamp: string;
  pinned?: boolean;
}

interface ChatSidebarProps {
  conversations?: Conversation[];
  activeId?: string;
  onSelectConversation?: (id: string) => void;
  onNewChat?: () => void;
  onPinConversation?: (id: string) => void;
  onEditConversation?: (id: string) => void;
  onShareConversation?: (id: string) => void;
  onDeleteConversation?: (id: string) => void;
}

export default function ChatSidebar({ 
  conversations = [], 
  activeId,
  onSelectConversation,
  onNewChat,
  onPinConversation,
  onEditConversation,
  onShareConversation,
  onDeleteConversation
}: ChatSidebarProps) {
  const [location] = useLocation();
  
  return (
    <div className="border-r border-border bg-sidebar flex flex-col h-screen" style={{ width: '20%', minWidth: '200px' }}>
      <div className="p-4 border-b border-sidebar-border">
        <Button 
          className="w-full gap-2" 
          onClick={onNewChat}
          data-testid="button-new-chat"
        >
          <Plus className="w-4 h-4" />
          New Chat
        </Button>
      </div>
      
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-4">
          <nav role="navigation" aria-label="Professional Features">
            <div className="space-y-1">
              <div className="px-2 py-1.5">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Professional Features
                </h3>
              </div>
              <Link href="/scenarios" data-testid="link-nav-scenarios">
                <Button 
                  variant="ghost" 
                  className={cn(
                    "w-full justify-start gap-2",
                    location === '/scenarios' && "bg-sidebar-accent"
                  )}
                  aria-current={location === '/scenarios' ? 'page' : undefined}
                  asChild
                >
                  <a>
                    <Sparkles className="w-4 h-4" />
                    Scenario Simulator
                  </a>
                </Button>
              </Link>
              <Link href="/deliverables" data-testid="link-nav-deliverables">
                <Button 
                  variant="ghost" 
                  className={cn(
                    "w-full justify-start gap-2",
                    location === '/deliverables' && "bg-sidebar-accent"
                  )}
                  aria-current={location === '/deliverables' ? 'page' : undefined}
                  asChild
                >
                  <a>
                    <FileText className="w-4 h-4" />
                    Deliverable Composer
                  </a>
                </Button>
              </Link>
              <Link href="/forensics" data-testid="link-nav-forensics">
                <Button 
                  variant="ghost" 
                  className={cn(
                    "w-full justify-start gap-2",
                    location === '/forensics' && "bg-sidebar-accent"
                  )}
                  aria-current={location === '/forensics' ? 'page' : undefined}
                  asChild
                >
                  <a>
                    <Search className="w-4 h-4" />
                    Forensic Intelligence
                  </a>
                </Button>
              </Link>
            </div>
          </nav>
          
          <div className="space-y-1">
            <div className="px-2 py-1.5">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Conversations
              </h3>
            </div>
            {conversations.map((conv) => (
              <div
                key={conv.id}
                className={cn(
                  "w-full text-left p-2 rounded-md hover-elevate transition-all group relative",
                  activeId === conv.id && "bg-sidebar-accent"
                )}
                data-testid={`container-conversation-${conv.id}`}
              >
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onSelectConversation?.(conv.id)}
                    className="flex-1 flex items-center gap-2 min-w-0"
                    data-testid={`button-conversation-${conv.id}`}
                  >
                    <MessageSquare className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{conv.title}</div>
                    </div>
                  </button>
                  
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 opacity-0 group-hover:opacity-100 flex-shrink-0"
                        data-testid={`button-conversation-menu-${conv.id}`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          onPinConversation?.(conv.id);
                        }}
                        data-testid={`button-pin-conversation-${conv.id}`}
                      >
                        <Pin className="w-4 h-4 mr-2" />
                        {conv.pinned ? 'Unpin' : 'Pin'}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          onEditConversation?.(conv.id);
                        }}
                        data-testid={`button-edit-conversation-${conv.id}`}
                      >
                        <Edit3 className="w-4 h-4 mr-2" />
                        Rename
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          onShareConversation?.(conv.id);
                        }}
                        data-testid={`button-share-conversation-${conv.id}`}
                      >
                        <Share2 className="w-4 h-4 mr-2" />
                        Share
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteConversation?.(conv.id);
                        }}
                        className="text-destructive focus:text-destructive"
                        data-testid={`button-delete-conversation-${conv.id}`}
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))}
          </div>
        </div>
      </ScrollArea>
      
      <div className="p-2 border-t border-sidebar-border space-y-1">
        <Link href="/settings" data-testid="link-settings">
          <Button 
            variant="ghost" 
            className={cn(
              "w-full justify-start gap-2",
              location === '/settings' && "bg-sidebar-accent"
            )}
            aria-current={location === '/settings' ? 'page' : undefined}
            asChild
          >
            <a>
              <Settings className="w-4 h-4" />
              Settings
            </a>
          </Button>
        </Link>
        <Link href="/auth" data-testid="link-logout">
          <Button 
            variant="ghost" 
            className="w-full justify-start gap-2"
            asChild
          >
            <a>
              <LogOut className="w-4 h-4" />
              Logout
            </a>
          </Button>
        </Link>
      </div>
    </div>
  );
}
