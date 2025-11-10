import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { 
  FileText, 
  Download, 
  Search, 
  ChevronLeft, 
  ChevronRight,
  Maximize2,
  Minimize2,
  Code,
  AlignLeft,
  Copy,
  Check
} from "lucide-react";
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useToast } from "@/hooks/use-toast";

interface OutputPaneProps {
  content: string;
  onCollapse?: () => void;
  isCollapsed?: boolean;
}

export default function OutputPane({ content, onCollapse, isCollapsed }: OutputPaneProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [viewMode, setViewMode] = useState<'formatted' | 'code'>('formatted');
  const [currentPage, setCurrentPage] = useState(1);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  const itemsPerPage = 1000; // characters per page

  const handleExport = async (format: 'docx' | 'pdf' | 'pptx' | 'xlsx' | 'csv' | 'txt') => {
    try {
      const response = await fetch('/api/export', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          content,
          format,
          title: 'Luca Output'
        })
      });

      if (!response.ok) {
        throw new Error('Export failed');
      }

      // Get the file blob from response
      const blob = await response.blob();
      
      // Create download link
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `luca-output-${Date.now()}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
      
      toast({
        title: "Export successful",
        description: `Output exported as ${format.toUpperCase()}`,
      });
    } catch (error) {
      console.error('Export error:', error);
      toast({
        title: "Export failed",
        description: "Unable to export output. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Apply search filter
  const filteredContent = searchTerm
    ? content.split('\n').filter(line => 
        line.toLowerCase().includes(searchTerm.toLowerCase())
      ).join('\n')
    : content;

  const totalPages = Math.ceil(filteredContent.length / itemsPerPage);
  const paginatedContent = filteredContent.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  if (isCollapsed) {
    return (
      <div className="flex items-center justify-center h-full bg-background border-l">
        <Button
          variant="ghost"
          size="icon"
          onClick={onCollapse}
          data-testid="button-expand-output"
        >
          <Maximize2 className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background border-l">
      {/* Output Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-muted-foreground" />
          <h2 className="font-semibold text-sm">Output</h2>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setViewMode(viewMode === 'formatted' ? 'code' : 'formatted')}
            data-testid="button-toggle-view"
          >
            {viewMode === 'formatted' ? <Code className="h-4 w-4" /> : <AlignLeft className="h-4 w-4" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleCopy}
            data-testid="button-copy-output"
          >
            {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onCollapse}
            data-testid="button-collapse-output"
          >
            <Minimize2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="px-4 py-2 border-b">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search in output..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
            data-testid="input-search-output"
          />
        </div>
      </div>

      {/* Export Options */}
      <div className="px-4 py-2 border-b">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground">Export:</span>
          <Button variant="outline" size="sm" onClick={() => handleExport('txt')} data-testid="button-export-txt">
            TXT
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleExport('csv')} data-testid="button-export-csv">
            CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleExport('docx')} data-testid="button-export-docx">
            Word
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleExport('pdf')} data-testid="button-export-pdf">
            PDF
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleExport('pptx')} data-testid="button-export-pptx">
            PPT
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleExport('xlsx')} data-testid="button-export-xlsx">
            Excel
          </Button>
        </div>
      </div>

      <Separator />

      {/* Output Content */}
      <ScrollArea className="flex-1 p-4">
        {content ? (
          <div className="prose prose-sm dark:prose-invert max-w-none">
            {viewMode === 'formatted' ? (
              <ReactMarkdown
                remarkPlugins={[remarkMath]}
                rehypePlugins={[rehypeKatex]}
                components={{
                  code({ inline, className, children, ...props }: any) {
                    const match = /language-(\w+)/.exec(className || '');
                    return !inline && match ? (
                      <SyntaxHighlighter
                        style={vscDarkPlus}
                        language={match[1]}
                        PreTag="div"
                        {...props}
                      >
                        {String(children).replace(/\n$/, '')}
                      </SyntaxHighlighter>
                    ) : (
                      <code className={className} {...props}>
                        {children}
                      </code>
                    );
                  }
                }}
              >
                {paginatedContent}
              </ReactMarkdown>
            ) : (
              <pre className="bg-muted p-4 rounded-md overflow-x-auto">
                <code className="text-sm">{paginatedContent}</code>
              </pre>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            Output will appear here
          </div>
        )}
      </ScrollArea>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-2 border-t">
          <Button
            variant="ghost"
            size="sm"
            disabled={currentPage === 1}
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            data-testid="button-prev-page"
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Previous
          </Button>
          <span className="text-xs text-muted-foreground" data-testid="text-page-info">
            Page {currentPage} of {totalPages}
          </span>
          <Button
            variant="ghost"
            size="sm"
            disabled={currentPage === totalPages}
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            data-testid="button-next-page"
          >
            Next
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      )}
    </div>
  );
}
