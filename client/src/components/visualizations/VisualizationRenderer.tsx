import FinancialLineChart from './FinancialLineChart';
import FinancialBarChart from './FinancialBarChart';
import FinancialPieChart from './FinancialPieChart';
import FinancialAreaChart from './FinancialAreaChart';
import WorkflowRenderer from './WorkflowRenderer';

export interface ChartData {
  type: 'line' | 'bar' | 'pie' | 'area' | 'workflow';
  title?: string;
  data: any[];
  config?: {
    lines?: Array<{ dataKey: string; name: string; color: string }>;
    bars?: Array<{ dataKey: string; name: string; color: string }>;
    areas?: Array<{ dataKey: string; name: string; color: string }>;
    xAxisLabel?: string;
    yAxisLabel?: string;
    formatValue?: (value: number) => string;
    stacked?: boolean;
    layout?: 'horizontal' | 'vertical';
    showPercentage?: boolean;
    // Workflow-specific
    nodes?: Array<{
      id: string;
      type: 'step' | 'decision' | 'start' | 'end';
      label: string;
      description?: string;
      substeps?: string[];
    }>;
    edges?: Array<{
      id: string;
      source: string;
      target: string;
      label?: string;
    }>;
  };
}

interface VisualizationRendererProps {
  chartData: ChartData;
}

export default function VisualizationRenderer({ chartData }: VisualizationRendererProps) {
  const { type, title, data, config = {} } = chartData;

  switch (type) {
    case 'line':
      return (
        <FinancialLineChart
          data={data}
          lines={config.lines || []}
          title={title}
          xAxisLabel={config.xAxisLabel}
          yAxisLabel={config.yAxisLabel}
          formatValue={config.formatValue}
        />
      );

    case 'bar':
      return (
        <FinancialBarChart
          data={data}
          bars={config.bars || []}
          title={title}
          xAxisLabel={config.xAxisLabel}
          yAxisLabel={config.yAxisLabel}
          formatValue={config.formatValue}
          layout={config.layout}
        />
      );

    case 'pie':
      return (
        <FinancialPieChart
          data={data}
          title={title}
          formatValue={config.formatValue}
          showPercentage={config.showPercentage}
        />
      );

    case 'area':
      return (
        <FinancialAreaChart
          data={data}
          areas={config.areas || []}
          title={title}
          xAxisLabel={config.xAxisLabel}
          yAxisLabel={config.yAxisLabel}
          formatValue={config.formatValue}
          stacked={config.stacked}
        />
      );

    case 'workflow':
      if (!config.nodes || !config.edges) {
        return (
          <div className="text-destructive p-4 border border-destructive rounded-md">
            Workflow visualization requires nodes and edges
          </div>
        );
      }
      return (
        <WorkflowRenderer
          nodes={config.nodes}
          edges={config.edges}
          title={title}
        />
      );

    default:
      return (
        <div className="text-destructive p-4 border border-destructive rounded-md">
          Unsupported chart type: {type}
        </div>
      );
  }
}
