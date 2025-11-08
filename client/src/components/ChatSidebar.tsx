import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, MessageSquare, Settings, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";

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
        <div className="p-2 space-y-1">
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
      </ScrollArea>
      
      <div className="p-2 border-t border-sidebar-border space-y-1">
        <Button 
          variant="ghost" 
          className="w-full justify-start gap-2"
          data-testid="button-settings"
          onClick={() => console.log('Settings clicked')}
        >
          <Settings className="w-4 h-4" />
          Settings
        </Button>
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
