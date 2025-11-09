import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, MessageSquare, Settings, LogOut, Sparkles, FileText, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Link, useLocation } from "wouter";

interface Conversation {
  id: string;
  title: string;
  preview: string;
  timestamp: string;
}

interface ChatSidebarProps {
  conversations?: Conversation[];
  activeId?: string;
  onSelectConversation?: (id: string) => void;
  onNewChat?: () => void;
}

export default function ChatSidebar({ 
  conversations = [], 
  activeId,
  onSelectConversation,
  onNewChat 
}: ChatSidebarProps) {
  const [location] = useLocation();
  
  return (
    <div className="w-64 border-r border-border bg-sidebar flex flex-col h-screen">
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
          <div className="space-y-1">
            <div className="px-2 py-1.5">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Professional Features
              </h3>
            </div>
            <Link href="/scenarios">
              <Button 
                variant="ghost" 
                className={cn(
                  "w-full justify-start gap-2",
                  location === '/scenarios' && "bg-sidebar-accent"
                )}
                data-testid="button-nav-scenarios"
              >
                <Sparkles className="w-4 h-4" />
                Scenario Simulator
              </Button>
            </Link>
            <Link href="/deliverables">
              <Button 
                variant="ghost" 
                className={cn(
                  "w-full justify-start gap-2",
                  location === '/deliverables' && "bg-sidebar-accent"
                )}
                data-testid="button-nav-deliverables"
              >
                <FileText className="w-4 h-4" />
                Deliverable Composer
              </Button>
            </Link>
            <Link href="/forensics">
              <Button 
                variant="ghost" 
                className={cn(
                  "w-full justify-start gap-2",
                  location === '/forensics' && "bg-sidebar-accent"
                )}
                data-testid="button-nav-forensics"
              >
                <Search className="w-4 h-4" />
                Forensic Intelligence
              </Button>
            </Link>
          </div>
          
          <div className="space-y-1">
            <div className="px-2 py-1.5">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Conversations
              </h3>
            </div>
            {conversations.map((conv) => (
              <button
                key={conv.id}
                onClick={() => onSelectConversation?.(conv.id)}
                className={cn(
                  "w-full text-left p-3 rounded-md hover-elevate active-elevate-2 transition-all",
                  activeId === conv.id && "bg-sidebar-accent"
                )}
                data-testid={`button-conversation-${conv.id}`}
              >
                <div className="flex items-start gap-2">
                  <MessageSquare className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{conv.title}</div>
                    <div className="text-xs text-muted-foreground truncate">{conv.preview}</div>
                    <div className="text-xs text-muted-foreground mt-1">{conv.timestamp}</div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </ScrollArea>
      
      <div className="p-2 border-t border-sidebar-border space-y-1">
        <Link href="/settings">
          <Button 
            variant="ghost" 
            className={cn(
              "w-full justify-start gap-2",
              location === '/settings' && "bg-sidebar-accent"
            )}
            data-testid="button-settings"
          >
            <Settings className="w-4 h-4" />
            Settings
          </Button>
        </Link>
        <Button 
          variant="ghost" 
          className="w-full justify-start gap-2"
          data-testid="button-logout"
          onClick={() => console.log('Logout clicked')}
        >
          <LogOut className="w-4 h-4" />
          Logout
        </Button>
      </div>
    </div>
  );
}
