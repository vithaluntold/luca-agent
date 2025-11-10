export interface VisualizationData {
  type: 'line' | 'bar' | 'pie' | 'area';
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
  };
}

export interface MessageMetadata {
  showInOutputPane?: boolean;
  visualization?: VisualizationData;
  [key: string]: any;
}
