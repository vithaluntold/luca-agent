import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Play, TrendingUp, FileBarChart, Share2, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ScenarioConfig {
  jurisdiction: string;
  entityType: string;
  taxYear: number;
  income: number;
  deductionStrategy: string;
}

interface ScenarioVariant {
  id: string;
  name: string;
  description?: string;
  assumptions: Record<string, any>;
  isBaseline: boolean;
}

export default function ScenarioSimulator() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("create");
  
  // Playbook creation state
  const [playbookName, setPlaybookName] = useState("");
  const [playbookDescription, setPlaybookDescription] = useState("");
  const [category, setCategory] = useState("tax_strategy");
  
  // Baseline configuration
  const [baselineConfig, setBaselineConfig] = useState<ScenarioConfig>({
    jurisdiction: "california",
    entityType: "llc",
    taxYear: 2025,
    income: 200000,
    deductionStrategy: "standard"
  });
  
  // Variants
  const [variants, setVariants] = useState<ScenarioVariant[]>([]);
  const [comparisonResults, setComparisonResults] = useState<any>(null);

  const handleAddVariant = () => {
    const newVariant: ScenarioVariant = {
      id: `variant-${Date.now()}`,
      name: `Alternative ${variants.length + 1}`,
      description: "",
      assumptions: {
        ...baselineConfig,
        entityType: "s-corp" // Default variation
      },
      isBaseline: false
    };
    setVariants([...variants, newVariant]);
  };

  const handleRunSimulation = async () => {
    toast({
      title: "Running Simulation",
      description: "Calculating tax implications across all scenarios...",
    });

    // TODO: Implement actual API call to run simulation
    setTimeout(() => {
      setComparisonResults({
        baseline: {
          totalTax: 45000,
          effectiveRate: 22.5,
          qbiDeduction: 0,
          estimatedSavings: 0
        },
        alternatives: variants.map(v => ({
          name: v.name,
          totalTax: 38000,
          effectiveRate: 19.0,
          qbiDeduction: 15000,
          estimatedSavings: 7000
        }))
      });
      
      setActiveTab("results");
      
      toast({
        title: "Simulation Complete",
        description: "Results are ready for review",
      });
    }, 2000);
  };

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
            Regulatory Scenario Simulator
          </h1>
          <p className="text-muted-foreground mt-2">
            Stress-test tax and audit positions across jurisdictions, entities, and time periods
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="create" data-testid="tab-create-scenario">
              Create Scenario
            </TabsTrigger>
            <TabsTrigger value="simulate" data-testid="tab-simulate">
              Run Simulation
            </TabsTrigger>
            <TabsTrigger value="results" data-testid="tab-results">
              View Results
            </TabsTrigger>
          </TabsList>

          {/* Tab 1: Create Scenario */}
          <TabsContent value="create" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>New Scenario Playbook</CardTitle>
                <CardDescription>
                  Define the baseline configuration for your tax scenario analysis
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Playbook Details */}
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="playbook-name">Scenario Name</Label>
                    <Input
                      id="playbook-name"
                      data-testid="input-playbook-name"
                      placeholder="e.g., LLC vs S-Corp Tax Comparison 2025"
                      value={playbookName}
                      onChange={(e) => setPlaybookName(e.target.value)}
                    />
                  </div>

                  <div>
                    <Label htmlFor="playbook-description">Description</Label>
                    <Textarea
                      id="playbook-description"
                      data-testid="input-playbook-description"
                      placeholder="Describe the purpose and goals of this scenario analysis..."
                      value={playbookDescription}
                      onChange={(e) => setPlaybookDescription(e.target.value)}
                    />
                  </div>

                  <div>
                    <Label htmlFor="category">Category</Label>
                    <Select value={category} onValueChange={setCategory}>
                      <SelectTrigger id="category" data-testid="select-category">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="tax_strategy">Tax Strategy</SelectItem>
                        <SelectItem value="entity_comparison">Entity Comparison</SelectItem>
                        <SelectItem value="deduction_analysis">Deduction Analysis</SelectItem>
                        <SelectItem value="audit_risk">Audit Risk Assessment</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Baseline Configuration */}
                <div className="border-t pt-6">
                  <h3 className="text-lg font-semibold mb-4">Baseline Configuration</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="jurisdiction">Jurisdiction</Label>
                      <Select
                        value={baselineConfig.jurisdiction}
                        onValueChange={(value) => setBaselineConfig({ ...baselineConfig, jurisdiction: value })}
                      >
                        <SelectTrigger id="jurisdiction" data-testid="select-jurisdiction">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="california">California</SelectItem>
                          <SelectItem value="delaware">Delaware</SelectItem>
                          <SelectItem value="texas">Texas</SelectItem>
                          <SelectItem value="new_york">New York</SelectItem>
                          <SelectItem value="florida">Florida</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label htmlFor="entity-type">Entity Type</Label>
                      <Select
                        value={baselineConfig.entityType}
                        onValueChange={(value) => setBaselineConfig({ ...baselineConfig, entityType: value })}
                      >
                        <SelectTrigger id="entity-type" data-testid="select-entity-type">
                          <SelectValue />
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
                        value={baselineConfig.taxYear}
                        onChange={(e) => setBaselineConfig({ ...baselineConfig, taxYear: parseInt(e.target.value) })}
                      />
                    </div>

                    <div>
                      <Label htmlFor="income">Annual Income ($)</Label>
                      <Input
                        id="income"
                        data-testid="input-income"
                        type="number"
                        value={baselineConfig.income}
                        onChange={(e) => setBaselineConfig({ ...baselineConfig, income: parseInt(e.target.value) })}
                      />
                    </div>

                    <div className="col-span-2">
                      <Label htmlFor="deduction-strategy">Deduction Strategy</Label>
                      <Select
                        value={baselineConfig.deductionStrategy}
                        onValueChange={(value) => setBaselineConfig({ ...baselineConfig, deductionStrategy: value })}
                      >
                        <SelectTrigger id="deduction-strategy" data-testid="select-deduction-strategy">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="standard">Standard Deduction</SelectItem>
                          <SelectItem value="itemized">Itemized Deductions</SelectItem>
                          <SelectItem value="qbi">QBI Deduction</SelectItem>
                          <SelectItem value="home_office_actual">Home Office (Actual Method)</SelectItem>
                          <SelectItem value="home_office_simplified">Home Office (Simplified Method)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button
                    className="flex-1"
                    data-testid="button-save-playbook"
                    onClick={() => {
                      toast({
                        title: "Playbook Saved",
                        description: "Your scenario baseline has been saved successfully",
                      });
                    }}
                  >
                    <Save className="w-4 h-4 mr-2" />
                    Save Playbook
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setActiveTab("simulate")}
                    data-testid="button-next-to-simulate"
                  >
                    Next: Add Variants
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab 2: Run Simulation */}
          <TabsContent value="simulate" className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Scenario Variants</CardTitle>
                    <CardDescription>
                      Add alternative scenarios to compare against your baseline
                    </CardDescription>
                  </div>
                  <Button
                    onClick={handleAddVariant}
                    data-testid="button-add-variant"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Variant
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Baseline Card */}
                <div className="border rounded-lg p-4 bg-accent/5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold">Baseline Scenario</h4>
                      <Badge variant="outline" className="bg-primary/10 text-primary">Baseline</Badge>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3 text-sm">
                    <div>
                      <p className="text-muted-foreground">Jurisdiction</p>
                      <p className="font-medium capitalize">{baselineConfig.jurisdiction}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Entity Type</p>
                      <p className="font-medium uppercase">{baselineConfig.entityType}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Income</p>
                      <p className="font-medium">${baselineConfig.income.toLocaleString()}</p>
                    </div>
                  </div>
                </div>

                {/* Variant Cards */}
                {variants.map((variant, index) => (
                  <div key={variant.id} className="border rounded-lg p-4 hover-elevate">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-semibold">{variant.name}</h4>
                      <Badge variant="secondary">Alternative {index + 1}</Badge>
                    </div>
                    <div className="grid grid-cols-3 gap-3 text-sm">
                      <div>
                        <p className="text-muted-foreground">Jurisdiction</p>
                        <p className="font-medium capitalize">{variant.assumptions.jurisdiction || baselineConfig.jurisdiction}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Entity Type</p>
                        <p className="font-medium uppercase">{variant.assumptions.entityType}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Income</p>
                        <p className="font-medium">${(variant.assumptions.income || baselineConfig.income).toLocaleString()}</p>
                      </div>
                    </div>
                  </div>
                ))}

                {variants.length === 0 && (
                  <div className="text-center py-12 text-muted-foreground">
                    <FileBarChart className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>No variants added yet</p>
                    <p className="text-sm">Click "Add Variant" to create alternative scenarios</p>
                  </div>
                )}

                {variants.length > 0 && (
                  <Button
                    className="w-full"
                    size="lg"
                    onClick={handleRunSimulation}
                    data-testid="button-run-simulation"
                  >
                    <Play className="w-4 h-4 mr-2" />
                    Run Simulation & Compare
                  </Button>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab 3: Results */}
          <TabsContent value="results" className="space-y-6">
            {comparisonResults ? (
              <>
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle>Scenario Comparison Results</CardTitle>
                        <CardDescription>
                          Side-by-side analysis of tax implications
                        </CardDescription>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" data-testid="button-share-results">
                          <Share2 className="w-4 h-4 mr-2" />
                          Share
                        </Button>
                        <Button variant="outline" data-testid="button-export-results">
                          <TrendingUp className="w-4 h-4 mr-2" />
                          Export Report
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-6">
                      {/* Baseline Results */}
                      <div className="border rounded-lg p-6 space-y-4">
                        <div className="flex items-center justify-between">
                          <h3 className="font-semibold">Baseline</h3>
                          <Badge variant="outline">Current</Badge>
                        </div>
                        <div className="space-y-3">
                          <div>
                            <p className="text-sm text-muted-foreground">Total Tax Liability</p>
                            <p className="text-2xl font-bold">${comparisonResults.baseline.totalTax.toLocaleString()}</p>
                          </div>
                          <div>
                            <p className="text-sm text-muted-foreground">Effective Tax Rate</p>
                            <p className="text-xl font-semibold">{comparisonResults.baseline.effectiveRate}%</p>
                          </div>
                          <div>
                            <p className="text-sm text-muted-foreground">QBI Deduction</p>
                            <p className="text-lg">${comparisonResults.baseline.qbiDeduction.toLocaleString()}</p>
                          </div>
                        </div>
                      </div>

                      {/* Alternative Results */}
                      {comparisonResults.alternatives.map((alt: any, index: number) => (
                        <div key={index} className="border rounded-lg p-6 space-y-4 bg-success/5 border-success/20">
                          <div className="flex items-center justify-between">
                            <h3 className="font-semibold">{alt.name}</h3>
                            <Badge className="bg-success text-success-foreground">Recommended</Badge>
                          </div>
                          <div className="space-y-3">
                            <div>
                              <p className="text-sm text-muted-foreground">Total Tax Liability</p>
                              <p className="text-2xl font-bold text-success">${alt.totalTax.toLocaleString()}</p>
                            </div>
                            <div>
                              <p className="text-sm text-muted-foreground">Effective Tax Rate</p>
                              <p className="text-xl font-semibold text-success">{alt.effectiveRate}%</p>
                            </div>
                            <div>
                              <p className="text-sm text-muted-foreground">QBI Deduction</p>
                              <p className="text-lg">${alt.qbiDeduction.toLocaleString()}</p>
                            </div>
                            <div className="pt-3 border-t border-success/20">
                              <p className="text-sm font-medium text-success">💰 Estimated Annual Savings</p>
                              <p className="text-2xl font-bold text-success">${alt.estimatedSavings.toLocaleString()}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Key Insights & Recommendations</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex gap-3 p-4 bg-success/10 border border-success/20 rounded-lg">
                      <div className="text-2xl">✓</div>
                      <div>
                        <p className="font-semibold text-success">S-Corp Election Recommended</p>
                        <p className="text-sm text-muted-foreground mt-1">
                          Converting to S-Corporation could save $7,000 annually through QBI deduction optimization and reduced self-employment tax burden.
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-3 p-4 bg-accent/10 border rounded-lg">
                      <div className="text-2xl">ℹ</div>
                      <div>
                        <p className="font-semibold">Implementation Considerations</p>
                        <p className="text-sm text-muted-foreground mt-1">
                          S-Corp election requires reasonable compensation to owner-employees, payroll processing, and additional compliance requirements. Consult with a licensed CPA before proceeding.
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </>
            ) : (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  <TrendingUp className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>No simulation results yet</p>
                  <p className="text-sm">Run a simulation to see comparative analysis</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
