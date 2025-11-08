import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Paperclip } from "lucide-react";
import { useState } from "react";

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
}

export default function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [message, setMessage] = useState("");

  const handleSend = () => {
    if (message.trim()) {
      onSend(message);
      setMessage("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="border-t border-border bg-background p-4">
      <div className="max-w-4xl mx-auto flex gap-2">
        <Button 
          variant="ghost" 
          size="icon"
          data-testid="button-attach-file"
          onClick={() => console.log('Attach file clicked')}
        >
          <Paperclip className="w-5 h-5" />
        </Button>
        
        <Textarea 
          placeholder="Ask about accounting, tax, or finance..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          className="min-h-[60px] max-h-32 resize-none"
          disabled={disabled}
          data-testid="input-chat-message"
        />
        
        <Button 
          size="icon"
          onClick={handleSend}
          disabled={!message.trim() || disabled}
          data-testid="button-send-message"
        >
          <Send className="w-5 h-5" />
        </Button>
      </div>
    </div>
  );
}
