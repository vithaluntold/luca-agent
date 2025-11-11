export interface WorkflowNode {
  id: string;
  type: 'step' | 'decision' | 'start' | 'end';
  label: string;
  description?: string;
  substeps?: string[];
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

export interface VisualizationData {
  type: 'line' | 'bar' | 'pie' | 'area' | 'workflow';
  title?: string;
  data: any[];
  config?: {
    lines?: Array<{ dataKey: string; name: string; color: string }>;
    bars?: Array<{ dataKey: string; name: string; color: string }>;
    areas?: Array<{ dataKey: string; name: string; color: string }>;
    xAxisLabel?: string;
    yAxisLabel?: string;
    formatValue?: string; // Serialized function name or format string
    stacked?: boolean;
    layout?: 'horizontal' | 'vertical';
    showPercentage?: boolean;
    // Workflow-specific config
    nodes?: WorkflowNode[];
    edges?: WorkflowEdge[];
  };
}

export interface MessageMetadata {
  showInOutputPane?: boolean;
  visualization?: VisualizationData;
  [key: string]: any;
}
