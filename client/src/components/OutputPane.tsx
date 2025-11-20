import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
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
  Check,
  MessageSquare
} from "lucide-react";
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useToast } from "@/hooks/use-toast";
import VisualizationRenderer, { ChartData } from "./visualizations/VisualizationRenderer";
import ChecklistRenderer from "./ChecklistRenderer";
import WorkflowRenderer from "./visualizations/WorkflowRenderer";
import SpreadsheetViewer from "./SpreadsheetViewer";
import { parseWorkflowContent } from "@/utils/workflowParser";

interface OutputPaneProps {
  content: string;
  visualization?: ChartData;
  onCollapse?: () => void;
  isCollapsed?: boolean;
  contentType?: 'markdown' | 'checklist' | 'workflow' | 'calculation' | 'spreadsheet';
  title?: string;
  onFullscreenToggle?: () => void;
  isFullscreen?: boolean;
  onChatToggle?: () => void;
  conversationId?: string;
  messageId?: string;
  hasExcel?: boolean;
  spreadsheetData?: any;
}

export default function OutputPane({ 
  content, 
  visualization, 
  onCollapse, 
  isCollapsed, 
  contentType = 'markdown', 
  title,
  onFullscreenToggle,
  isFullscreen = false,
  onChatToggle,
  conversationId,
  messageId,
  hasExcel = false,
  spreadsheetData
}: OutputPaneProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [viewMode, setViewMode] = useState<'formatted' | 'code'>('formatted');
  const [currentPage, setCurrentPage] = useState(1);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  const itemsPerPage = 1000; // characters per page

  // Handle escape key to exit fullscreen
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen && onFullscreenToggle) {
        onFullscreenToggle();
      }
    };
    
    if (isFullscreen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isFullscreen, onFullscreenToggle]);

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
          visualization,
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
    let textToCopy = content;
    
    // Add visualization data as text if present
    if (visualization && visualization.data && visualization.data.length > 0) {
      if (textToCopy) textToCopy += '\n\n';
      if (visualization.title) textToCopy += visualization.title + '\n\n';
      
      const allKeys = Array.from(
        new Set(visualization.data.flatMap((obj: any) => Object.keys(obj)))
      );
      
      textToCopy += allKeys.join('\t') + '\n';
      for (const row of visualization.data) {
        textToCopy += allKeys.map((key: string) => row[key] ?? '').join('\t') + '\n';
      }
    }
    
    navigator.clipboard.writeText(textToCopy);
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

  if (isCollapsed && !isFullscreen) {
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
    <div className={`flex flex-col ${isFullscreen ? 'fixed inset-0 z-50 h-screen bg-background' : 'h-full bg-background border-l'}`}>
      {/* Output Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-muted-foreground" />
          <h2 className="font-semibold text-sm">
            {isFullscreen ? 'Output (Fullscreen)' : 'Output'}
          </h2>
          {title && (
            <span className="text-xs text-muted-foreground">• {title}</span>
          )}
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
          {hasExcel && conversationId && messageId && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                const downloadUrl = `/api/conversations/${conversationId}/messages/${messageId}/excel`;
                window.open(downloadUrl, '_blank');
                toast({
                  title: "Downloading Excel file",
                  description: "Your financial calculations workbook is being downloaded."
                });
              }}
              title="Download Excel Workbook"
              data-testid="button-download-excel"
              className="text-green-600 hover:text-green-700 hover:bg-green-50"
            >
              <FileText className="h-4 w-4" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={handleCopy}
            disabled={!content && !visualization}
            data-testid="button-copy-output"
          >
            {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
          </Button>
          {isFullscreen && onChatToggle && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onChatToggle}
              data-testid="button-chat-toggle"
              title="Toggle Chat"
            >
              <MessageSquare className="h-4 w-4" />
            </Button>
          )}
          {onFullscreenToggle && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onFullscreenToggle}
              data-testid="button-fullscreen-toggle"
              className={isFullscreen ? "bg-primary/10 hover:bg-primary/20" : ""}
            >
              {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </Button>
          )}
          {!isFullscreen && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onCollapse}
              data-testid="button-collapse-output"
            >
              <Minimize2 className="h-4 w-4" />
            </Button>
          )}
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
            disabled={!content && !visualization}
            data-testid="input-search-output"
          />
        </div>
      </div>

      {/* Export Options */}
      <div className="px-4 py-2 border-b">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground">Export:</span>
          <Button variant="outline" size="sm" onClick={() => handleExport('txt')} disabled={!content && !visualization} data-testid="button-export-txt">
            TXT
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleExport('csv')} disabled={!content && !visualization} data-testid="button-export-csv">
            CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleExport('docx')} disabled={!content && !visualization} data-testid="button-export-docx">
            Word
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleExport('pdf')} disabled={!content && !visualization} data-testid="button-export-pdf">
            PDF
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleExport('pptx')} disabled={!content && !visualization} data-testid="button-export-pptx">
            PPT
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleExport('xlsx')} disabled={!content && !visualization} data-testid="button-export-xlsx">
            Excel
          </Button>
        </div>
      </div>

      <Separator />

      {/* Output Content */}
      <ScrollArea className="flex-1 p-4">
        {content || visualization || spreadsheetData ? (
          <div className="space-y-6">
            {/* Spreadsheet Viewer for calculations */}
            {contentType === 'spreadsheet' && spreadsheetData ? (
              <SpreadsheetViewer
                data={spreadsheetData}
                conversationId={conversationId}
                messageId={messageId}
                onFullscreen={onFullscreenToggle}
                isFullscreen={isFullscreen}
              />
            ) : (
              <>
                {visualization && (
                  <div className="bg-card border rounded-lg p-4" data-testid="visualization-container">
                    <VisualizationRenderer chartData={visualization} />
                  </div>
                )}
                
                {content && (
                  <div>
                    {contentType === 'checklist' ? (
                      <ChecklistRenderer 
                        content={content}
                        title={title}
                        onExport={(format) => handleExport(format as any)}
                      />
                    ) : contentType === 'workflow' ? (
                  <div className="bg-card border rounded-lg p-4">
                    {(() => {
                      const workflowData = parseWorkflowContent(content);
                      return (
                        <WorkflowRenderer
                          nodes={workflowData.nodes}
                          edges={workflowData.edges}
                          title={title}
                          layout={workflowData.layout}
                        />
                      );
                    })()}
                  </div>
                ) : (
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
                          },
                          table: ({ children, ...props }) => (
                            <div className="my-4 w-full overflow-auto">
                              <Table {...props}>
                                {children}
                              </Table>
                            </div>
                          ),
                          thead: ({ children, ...props }) => (
                            <TableHeader {...props}>
                              {children}
                            </TableHeader>
                          ),
                          tbody: ({ children, ...props }) => (
                            <TableBody {...props}>
                              {children}
                            </TableBody>
                          ),
                          tr: ({ children, ...props }) => (
                            <TableRow {...props}>
                              {children}
                            </TableRow>
                          ),
                          th: ({ children, ...props }) => (
                            <TableHead {...props}>
                              {children}
                            </TableHead>
                          ),
                          td: ({ children, ...props }) => (
                            <TableCell {...props}>
                              {children}
                            </TableCell>
                          ),
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
                )}
              </div>
            )}
            </>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm p-6 text-center">
            <FileText className="h-12 w-12 mb-4 opacity-50" />
            <p className="font-medium mb-2">No output to display</p>
            <p className="text-xs max-w-sm">
              Exportable output appears here when you use professional features like calculations, document generation, or data analysis.
            </p>
            {isFullscreen && (
              <div className="mt-4 text-xs opacity-70">
                Click the minimize button above to return to normal view
              </div>
            )}
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
