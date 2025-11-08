import { useState } from "react";
import ChatSidebar from "@/components/ChatSidebar";
import ChatHeader from "@/components/ChatHeader";
import ChatMessage from "@/components/ChatMessage";
import ChatInput from "@/components/ChatInput";
import { ScrollArea } from "@/components/ui/scroll-area";

const mockConversations = [
  {
    id: '1',
    title: 'Delaware C-Corp Tax Question',
    preview: 'What\'s the corporate tax rate...',
    timestamp: 'Today, 2:30 PM'
  },
  {
    id: '2',
    title: 'Depreciation Schedule',
    preview: 'Calculate depreciation for...',
    timestamp: 'Yesterday, 4:15 PM'
  },
  {
    id: '3',
    title: 'GAAP vs IFRS',
    preview: 'Explain the differences...',
    timestamp: '2 days ago'
  }
];

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

const initialMessages: Message[] = [
  {
    id: '1',
    role: 'assistant',
    content: 'Hello! I\'m Luca, your accounting superintelligence. I can help you with tax calculations, financial analysis, compliance questions, and more across global jurisdictions. What would you like to know?',
    timestamp: '2:29 PM'
  }
];

export default function Chat() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeConversation, setActiveConversation] = useState('1');
  const [messages, setMessages] = useState<Message[]>(initialMessages);

  const handleSendMessage = (content: string) => {
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    
    setMessages(prev => [...prev, userMessage]);
    
    setTimeout(() => {
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'This is a demonstration response. In the full application, this would be powered by our intelligent model routing system and specialized financial solvers.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages(prev => [...prev, assistantMessage]);
    }, 1000);
  };

  return (
    <div className="flex h-screen">
      {sidebarOpen && (
        <ChatSidebar 
          conversations={mockConversations}
          activeId={activeConversation}
          onSelectConversation={setActiveConversation}
          onNewChat={() => {
            setMessages(initialMessages);
            console.log('New chat created');
          }}
        />
      )}
      
      <div className="flex-1 flex flex-col">
        <ChatHeader onMenuToggle={() => setSidebarOpen(!sidebarOpen)} />
        
        <ScrollArea className="flex-1">
          <div className="max-w-4xl mx-auto p-6">
            {messages.map((message) => (
              <ChatMessage
                key={message.id}
                role={message.role}
                content={message.content}
                timestamp={message.timestamp}
              />
            ))}
          </div>
        </ScrollArea>
        
        <ChatInput onSend={handleSendMessage} />
      </div>
    </div>
  );
}
