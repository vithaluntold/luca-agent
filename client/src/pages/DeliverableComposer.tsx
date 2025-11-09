import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { FileText, Download, Share2, Eye, FileSpreadsheet, FileCheck, Presentation, Mail } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface DeliverableTemplate {
  id: string;
  name: string;
  type: string;
  description: string;
  category: string;
  isSystem: boolean;
}

export default function DeliverableComposer() {
  const { toast } = useToast();
  const [selectedTemplate, setSelectedTemplate] = useState<DeliverableTemplate | null>(null);
  const [documentTitle, setDocumentTitle] = useState("");
  const [variables, setVariables] = useState<Record<string, string>>({
    client_name: "",
    entity_type: "",
    tax_year: "2025",
    income_amount: "",
    jurisdiction: ""
  });
  const [generatedContent, setGeneratedContent] = useState<string | null>(null);

  // Fetch templates from API
  const { data: templates = [], isLoading: templatesLoading } = useQuery({
    queryKey: ['/api/deliverables/templates']
  });

  // Fetch user's deliverable instances
  const { data: instances = [] } = useQuery({
    queryKey: ['/api/deliverables/instances']
  });

  // Generate deliverable mutation
  const generateMutation = useMutation({
    mutationFn: async ({ templateId, variables }: { templateId: string; variables: Record<string, any> }) => {
      return await apiRequest('/api/deliverables/generate', {
        method: 'POST',
        body: JSON.stringify({ templateId, variables }),
        headers: { 'Content-Type': 'application/json' }
      });
    },
    onSuccess: (data) => {
      setGeneratedContent(data.contentMarkdown);
      queryClient.invalidateQueries({ queryKey: ['/api/deliverables/instances'] });
      toast({
        title: "Deliverable Generated",
        description: "Your professional document is ready for review",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Generation Failed",
        description: error.message || "Failed to generate deliverable",
        variant: "destructive"
      });
    }
  });

  // Export deliverable mutation
  const exportMutation = useMutation({
    mutationFn: async ({ instanceId, format }: { instanceId: string; format: string }) => {
      return await apiRequest(`/api/deliverables/instances/${instanceId}/export`, {
        method: 'POST',
        body: JSON.stringify({ format }),
        headers: { 'Content-Type': 'application/json' }
      });
    },
    onSuccess: (data) => {
      toast({
        title: "Export Complete",
        description: `Document exported to ${data.format?.toUpperCase()}`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Export Failed",
        description: error.message || "Failed to export deliverable",
        variant: "destructive"
      });
    }
  });

  const handleSelectTemplate = (templateId: string) => {
    const template = templates.find((t: any) => t.id === templateId);
    if (template) {
      setSelectedTemplate(template);
      setDocumentTitle("");
      setGeneratedContent(null);
    }
  };

  const handleGenerateDeliverable = async () => {
    if (!selectedTemplate) {
      toast({
        title: "No Template Selected",
        description: "Please select a template first",
        variant: "destructive"
      });
      return;
    }

    toast({
      title: "Generating Deliverable",
      description: "Creating professional document with AI assistance...",
    });

    generateMutation.mutate({
      templateId: selectedTemplate.id,
      variables: {
        deliverableTitle: documentTitle || selectedTemplate.name,
        ...variables
      }
    });
  };

  const handleExportDeliverable = (format: 'docx' | 'pdf') => {
    if (!instances || instances.length === 0) {
      toast({
        title: "No Deliverable",
        description: "Please generate a deliverable first",
        variant: "destructive"
      });
      return;
    }

    exportMutation.mutate({
      instanceId: instances[0].id,
      format
    });
  };

  if (templatesLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-2">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          <p className="text-sm text-muted-foreground">Loading templates...</p>
        </div>
      </div>
    );
  }

  // Mock content generation for now since API will use AI
  if (generateMutation.isPending) {
    setTimeout(() => {
      const mockContent = `# ${documentTitle || selectedTemplate.name}

**Prepared for:** ${variables.client_name || "[Client Name]"}  
**Date:** ${new Date().toLocaleDateString()}  
**Prepared by:** Luca - Accounting Superintelligence

---

## Executive Summary

This ${selectedTemplate.type.replace(/_/g, ' ')} has been prepared to provide comprehensive guidance on ${selectedTemplate.description.toLowerCase()}.

## Background

[AI-generated background section based on template and variables]

## Analysis

### Key Considerations

1. **Jurisdiction-Specific Requirements**
   - ${variables.jurisdiction || "[Jurisdiction]"} regulations apply
   - Compliance deadlines and requirements
   - Filing obligations specific to ${variables.entity_type || "[Entity Type]"}

2. **Financial Implications**
   - Projected impact on ${variables.tax_year || "2025"} tax liability
   - Cash flow considerations
   - Long-term strategic benefits

3. **Implementation Steps**
   - Timeline and key milestones
   - Required documentation
   - Stakeholder communication plan

## Recommendations

Based on our analysis, we recommend the following actions:

1. [AI-generated recommendation 1]
2. [AI-generated recommendation 2]
3. [AI-generated recommendation 3]

## Next Steps

- Schedule follow-up consultation
- Gather required documentation
- File necessary forms by applicable deadlines

---

## Citations & References

- Internal Revenue Code Section 1362 (S-Corp Election)
- IRS Publication 542
- State-specific regulations: ${variables.jurisdiction || "[Jurisdiction]"}

## Disclaimer

This document is provided for informational purposes only and does not constitute legal or tax advice. Please consult with a licensed CPA or tax attorney before making any decisions based on this information.

---

*Generated by Luca AI on ${new Date().toLocaleString()}*
`;

      setGeneratedContent(mockContent);
      setIsGenerating(false);
      
      toast({
        title: "Deliverable Generated Successfully",
        description: "Your professional document is ready for review and export",
      });
    }, 3000);
  };

  const handleExport = (format: 'docx' | 'pdf') => {
    toast({
      title: `Exporting to ${format.toUpperCase()}`,
      description: "Your deliverable is being prepared for download...",
    });
    // TODO: Implement actual export functionality
  };

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
            Client Deliverable Composer
          </h1>
          <p className="text-muted-foreground mt-2">
            Generate professional-grade documents in minutes: audit plans, tax memos, checklists, presentations
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: Template Selection */}
          <div className="lg:col-span-1 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Select Template</CardTitle>
                <CardDescription>
                  Choose from professional templates
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {templates.map((template: any) => (
                  <div
                    key={template.id}
                    className={`p-4 border rounded-lg cursor-pointer transition-all hover-elevate ${
                      selectedTemplate?.id === template.id
                        ? 'border-primary bg-primary/5'
                        : 'border-border'
                    }`}
                    onClick={() => handleSelectTemplate(template.id)}
                    data-testid={`template-${template.id}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-1">
                        {template.type === 'audit_plan' && <FileCheck className="w-5 h-5 text-primary" />}
                        {template.type === 'tax_memo' && <FileText className="w-5 h-5 text-secondary" />}
                        {template.type === 'checklist' && <FileSpreadsheet className="w-5 h-5 text-success" />}
                        {template.type === 'board_presentation' && <Presentation className="w-5 h-5 text-gold" />}
                        {template.type === 'client_letter' && <Mail className="w-5 h-5 text-accent" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{template.name}</p>
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{template.description}</p>
                        <Badge variant="outline" className="mt-2 text-xs">
                          {template.category}
                        </Badge>
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Middle Column: Configuration */}
          <div className="lg:col-span-2 space-y-4">
            {selectedTemplate ? (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle>Configure Document</CardTitle>
                    <CardDescription>
                      Fill in the details for {selectedTemplate.name}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label htmlFor="document-title">Document Title</Label>
                      <Input
                        id="document-title"
                        data-testid="input-document-title"
                        placeholder={selectedTemplate.name}
                        value={documentTitle}
                        onChange={(e) => setDocumentTitle(e.target.value)}
                      />
                    </div>

                    <Separator />

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="client-name">Client Name</Label>
                        <Input
                          id="client-name"
                          data-testid="input-client-name"
                          placeholder="ABC Corporation"
                          value={variables.client_name}
                          onChange={(e) => setVariables({ ...variables, client_name: e.target.value })}
                        />
                      </div>

                      <div>
                        <Label htmlFor="entity-type">Entity Type</Label>
                        <Select
                          value={variables.entity_type}
                          onValueChange={(value) => setVariables({ ...variables, entity_type: value })}
                        >
                          <SelectTrigger id="entity-type" data-testid="select-entity-type">
                            <SelectValue placeholder="Select entity type" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="sole_proprietor">Sole Proprietor</SelectItem>
                            <SelectItem value="llc">LLC</SelectItem>
                            <SelectItem value="s-corp">S-Corporation</SelectItem>
                            <SelectItem value="c-corp">C-Corporation</SelectItem>
                            <SelectItem value="partnership">Partnership</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <Label htmlFor="tax-year">Tax Year</Label>
                        <Input
                          id="tax-year"
                          data-testid="input-tax-year"
                          type="number"
                          value={variables.tax_year}
                          onChange={(e) => setVariables({ ...variables, tax_year: e.target.value })}
                        />
                      </div>

                      <div>
                        <Label htmlFor="jurisdiction">Jurisdiction</Label>
                        <Select
                          value={variables.jurisdiction}
                          onValueChange={(value) => setVariables({ ...variables, jurisdiction: value })}
                        >
                          <SelectTrigger id="jurisdiction" data-testid="select-jurisdiction">
                            <SelectValue placeholder="Select jurisdiction" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="California">California</SelectItem>
                            <SelectItem value="Delaware">Delaware</SelectItem>
                            <SelectItem value="Texas">Texas</SelectItem>
                            <SelectItem value="New York">New York</SelectItem>
                            <SelectItem value="Florida">Florida</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="col-span-2">
                        <Label htmlFor="income-amount">Income Amount</Label>
                        <Input
                          id="income-amount"
                          data-testid="input-income-amount"
                          type="number"
                          placeholder="200000"
                          value={variables.income_amount}
                          onChange={(e) => setVariables({ ...variables, income_amount: e.target.value })}
                        />
                      </div>
                    </div>

                    <Button
                      className="w-full"
                      size="lg"
                      onClick={handleGenerateDeliverable}
                      disabled={generateMutation.isPending || !variables.client_name}
                      data-testid="button-generate-deliverable"
                    >
                      <FileText className="w-4 h-4 mr-2" />
                      {generateMutation.isPending ? "Generating..." : "Generate Deliverable"}
                    </Button>
                  </CardContent>
                </Card>

                {/* Preview/Generated Content */}
                {generatedContent && (
                  <Card>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle>Generated Document</CardTitle>
                          <CardDescription>Review and export your deliverable</CardDescription>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleExportDeliverable('docx')}
                            disabled={exportMutation.isPending}
                            data-testid="button-export-docx"
                          >
                            <Download className="w-4 h-4 mr-2" />
                            {exportMutation.isPending ? "Exporting..." : "Export DOCX"}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleExportDeliverable('pdf')}
                            disabled={exportMutation.isPending}
                            data-testid="button-export-pdf"
                          >
                            <Download className="w-4 h-4 mr-2" />
                            {exportMutation.isPending ? "Exporting..." : "Export PDF"}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            data-testid="button-share-deliverable"
                          >
                            <Share2 className="w-4 h-4 mr-2" />
                            Share
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="prose prose-sm max-w-none">
                        <div className="p-6 bg-white dark:bg-slate-900 rounded-lg border">
                          <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
                            {generatedContent}
                          </pre>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            ) : (
              <Card>
                <CardContent className="py-24 text-center text-muted-foreground">
                  <FileText className="w-16 h-16 mx-auto mb-4 opacity-30" />
                  <p className="text-lg font-medium">Select a template to get started</p>
                  <p className="text-sm mt-2">
                    Choose from audit plans, tax memos, checklists, and more
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
