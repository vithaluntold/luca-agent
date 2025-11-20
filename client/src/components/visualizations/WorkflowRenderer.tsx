import { useCallback, useEffect, useState } from 'react';
import {
  ReactFlow,
  Node,
  Edge,
  Background,
  Controls,
  MarkerType,
  useNodesState,
  useEdgesState,
} from '@xyflow/react';
import dagre from 'dagre';
import { Button } from '@/components/ui/button';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Palette, Shuffle, Settings } from 'lucide-react';
import ColorPicker from '@/components/ui/color-picker';
import '@xyflow/react/dist/style.css';

interface WorkflowNode {
  id: string;
  type: 'step' | 'decision' | 'start' | 'end';
  label: string;
  description?: string;
  substeps?: string[];
}

interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

interface WorkflowRendererProps {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  title?: string;
  layout?: string; // 'linear-process', 'decision-tree', 'parallel-workflow', 'approval-workflow'
}

interface ColorTheme {
  name: string;
  start: string;
  step: string;
  decision: string;
  end: string;
  edge: string;
}

const colorThemes: ColorTheme[] = [
  {
    name: 'Default',
    start: 'hsl(var(--primary))',
    step: 'hsl(var(--card))',
    decision: 'hsl(var(--accent))',
    end: 'hsl(var(--secondary))',
    edge: 'hsl(var(--primary))'
  },
  {
    name: 'Ocean Breeze',
    start: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    step: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
    decision: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
    end: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
    edge: '#667eea'
  },
  {
    name: 'Sunset Glow',
    start: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
    step: 'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)',
    decision: 'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)',
    end: 'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)',
    edge: '#fa709a'
  },
  {
    name: 'Forest Path',
    start: 'linear-gradient(135deg, #134e5e 0%, #71b280 100%)',
    step: 'linear-gradient(135deg, #a8e6cf 0%, #dcedc1 100%)',
    decision: 'linear-gradient(135deg, #74b9ff 0%, #0984e3 100%)',
    end: 'linear-gradient(135deg, #00b894 0%, #00cec9 100%)',
    edge: '#134e5e'
  },
  {
    name: 'Purple Haze',
    start: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    step: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
    decision: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
    end: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
    edge: '#667eea'
  },
  {
    name: 'Corporate Blue',
    start: 'linear-gradient(135deg, #1e3c72 0%, #2a5298 100%)',
    step: 'linear-gradient(135deg, #bdc3c7 0%, #2c3e50 100%)',
    decision: 'linear-gradient(135deg, #3498db 0%, #2980b9 100%)',
    end: 'linear-gradient(135deg, #27ae60 0%, #2ecc71 100%)',
    edge: '#1e3c72'
  }
];

const nodeWidth = 250;
const nodeHeight = 80;

const getLayoutedElements = (nodes: Node[], edges: Edge[], layout: string = 'linear-process') => {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  
  // Set graph properties with much better spacing for clean, professional look
  dagreGraph.setGraph({ 
    rankdir: layout === 'parallel-workflow' ? 'LR' : 'TB',
    ranksep: 150,
    nodesep: 120,
    marginx: 50,
    marginy: 50
  });

  // Register nodes with proper dimensions
  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { 
      width: nodeWidth, 
      height: nodeHeight
    });
  });

  // Register edges
  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  // Apply layout
  dagre.layout(dagreGraph);

  // Apply calculated positions
  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    return {
      ...node,
      position: {
        x: Math.round(nodeWithPosition.x - nodeWidth / 2),
        y: Math.round(nodeWithPosition.y - nodeHeight / 2),
      },
      style: {
        width: nodeWidth,
        height: nodeHeight,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
};

const getNodeStyle = (type: string, theme: ColorTheme, isGradient: boolean = true) => {
  const baseStyle = {
    padding: '16px 20px',
    borderRadius: '12px',
    fontSize: '13px',
    fontWeight: 600,
    border: '2px solid transparent',
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center' as const,
    wordWrap: 'break-word' as const,
    boxSizing: 'border-box' as const,
    overflow: 'visible',
    color: '#ffffff',
    textShadow: '0 1px 3px rgba(0,0,0,0.5)',
    boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
    transition: 'all 0.3s ease',
    cursor: 'pointer',
    zIndex: 10
  };

  let backgroundColor: string;
  let borderColor: string;
  
  switch (type) {
    case 'start':
      backgroundColor = theme.start;
      borderColor = isGradient ? 'transparent' : theme.start;
      return {
        ...baseStyle,
        background: backgroundColor,
        borderColor,
        borderRadius: '40px',
        minHeight: '60px',
        ':hover': {
          transform: 'translateY(-2px)',
          boxShadow: '0 8px 25px rgba(0,0,0,0.2)'
        }
      };
    case 'end':
      backgroundColor = theme.end;
      borderColor = isGradient ? 'transparent' : theme.end;
      return {
        ...baseStyle,
        background: backgroundColor,
        borderColor,
        borderRadius: '40px',
        minHeight: '60px',
        ':hover': {
          transform: 'translateY(-2px)',
          boxShadow: '0 8px 25px rgba(0,0,0,0.2)'
        }
      };
    case 'decision':
      backgroundColor = theme.decision;
      borderColor = isGradient ? 'transparent' : theme.decision;
      return {
        ...baseStyle,
        background: backgroundColor,
        borderColor,
        borderRadius: '50%',
        ':hover': {
          transform: 'scale(1.05)',
          boxShadow: '0 8px 25px rgba(0,0,0,0.2)'
        }
      };
    default:
      backgroundColor = theme.step;
      borderColor = isGradient ? 'transparent' : theme.step;
      return {
        ...baseStyle,
        background: backgroundColor,
        borderColor,
        ':hover': {
          transform: 'translateY(-1px)',
          boxShadow: '0 8px 25px rgba(0,0,0,0.2)'
        }
      };
  }
};

export default function WorkflowRenderer({ nodes, edges, title, layout = 'linear-process' }: WorkflowRendererProps) {
  const [selectedTheme, setSelectedTheme] = useState<ColorTheme>(colorThemes[0]);
  const [animateEdges, setAnimateEdges] = useState(true);
  const [customTheme, setCustomTheme] = useState<ColorTheme | null>(null);
  
  const activeTheme = customTheme || selectedTheme;
  
  const randomizeColors = () => {
    const randomIndex = Math.floor(Math.random() * colorThemes.length);
    setSelectedTheme(colorThemes[randomIndex]);
    setCustomTheme(null);
  };

  const updateCustomColor = (nodeType: keyof ColorTheme, color: string) => {
    const newCustomTheme: ColorTheme = {
      ...activeTheme,
      name: 'Custom',
      [nodeType]: color
    };
    setCustomTheme(newCustomTheme);
  };
  const createThemedNodes = (theme: ColorTheme): Node[] => {
    return nodes.map((node, idx) => ({
      id: node.id,
      type: 'default',
      data: { 
        label: (
          <div className="flex flex-col gap-1.5" style={{ lineHeight: '1.4', zIndex: 10 }}>
            <div className="font-bold text-sm leading-tight">{node.label}</div>
            {node.description && <div className="text-xs opacity-95 leading-snug">{node.description}</div>}
            {node.substeps && node.substeps.length > 0 && (
              <div className="text-xs text-left mt-1.5 space-y-0.5 leading-tight">
                {node.substeps.map((step, i) => (
                  <div key={i}>• {step}</div>
                ))}
              </div>
            )}
          </div>
        )
      },
      position: { x: 0, y: idx * 150 },
      style: getNodeStyle(node.type, theme),
      zIndex: 10
    }));
  };

  const createThemedEdges = (theme: ColorTheme): Edge[] => {
    return edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      label: edge.label,
      type: 'default',
      animated: animateEdges,
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 25,
        height: 25,
        color: theme.edge
      },
      style: {
        strokeWidth: 3,
        stroke: theme.edge,
        strokeDasharray: animateEdges ? '5,5' : '0',
      },
      labelStyle: {
        fill: theme.edge,
        fontSize: 13,
        fontWeight: 600,
        zIndex: 100
      },
      labelBgStyle: {
        fill: '#ffffff',
        fillOpacity: 0.95,
        rx: 6,
        ry: 6,
        stroke: theme.edge,
        strokeWidth: 1.5
      },
      labelBgPadding: [8, 12] as [number, number],
      zIndex: 5
    }));
  };

  const initialNodes = createThemedNodes(activeTheme);
  const initialEdges = createThemedEdges(activeTheme);

  const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
    initialNodes,
    initialEdges,
    layout
  );

  const [flowNodes, setNodes] = useNodesState(layoutedNodes);
  const [flowEdges, setEdges] = useEdgesState(layoutedEdges);

  useEffect(() => {
    const newNodes = createThemedNodes(activeTheme);
    const newEdges = createThemedEdges(activeTheme);
    const { nodes: newLayoutedNodes, edges: newLayoutedEdges } = getLayoutedElements(
      newNodes,
      newEdges,
      layout
    );
    setNodes(newLayoutedNodes);
    setEdges(newLayoutedEdges);
  }, [nodes, edges, activeTheme, animateEdges, layout]);

  return (
    <div className="w-full h-[600px] border rounded-lg overflow-hidden bg-background">
      {title && (
        <div className="p-3 border-b bg-muted/50 flex items-center justify-between">
          <h3 className="text-base font-semibold">{title}</h3>
          <div className="flex items-center gap-2">
            <Select
              value={customTheme ? 'Custom' : selectedTheme.name}
              onValueChange={(value) => {
                if (value === 'Custom') return;
                const theme = colorThemes.find(t => t.name === value);
                if (theme) {
                  setSelectedTheme(theme);
                  setCustomTheme(null);
                }
              }}
            >
              <SelectTrigger className="w-32 h-8">
                <SelectValue placeholder="Theme" />
              </SelectTrigger>
              <SelectContent>
                {customTheme && (
                  <SelectItem value="Custom">
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-3 h-3 rounded-full border"
                        style={{ background: customTheme.start }}
                      />
                      Custom
                    </div>
                  </SelectItem>
                )}
                {colorThemes.map((theme) => (
                  <SelectItem key={theme.name} value={theme.name}>
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-3 h-3 rounded-full border"
                        style={{ background: theme.start }}
                      />
                      {theme.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8">
                  <Palette className="h-3 w-3" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80">
                <div className="space-y-4">
                  <h4 className="font-medium">Customize Colors</h4>
                  <div className="space-y-3">
                    <ColorPicker
                      label="Start Nodes"
                      color={activeTheme.start}
                      onChange={(color) => updateCustomColor('start', color)}
                    />
                    <ColorPicker
                      label="Step Nodes"
                      color={activeTheme.step}
                      onChange={(color) => updateCustomColor('step', color)}
                    />
                    <ColorPicker
                      label="Decision Nodes"
                      color={activeTheme.decision}
                      onChange={(color) => updateCustomColor('decision', color)}
                    />
                    <ColorPicker
                      label="End Nodes"
                      color={activeTheme.end}
                      onChange={(color) => updateCustomColor('end', color)}
                    />
                    <ColorPicker
                      label="Edges"
                      color={activeTheme.edge}
                      onChange={(color) => updateCustomColor('edge', color)}
                    />
                  </div>
                </div>
              </PopoverContent>
            </Popover>
            
            <Button
              variant="outline"
              size="sm"
              onClick={randomizeColors}
              className="h-8"
            >
              <Shuffle className="h-3 w-3" />
            </Button>
            <Button
              variant={animateEdges ? "default" : "outline"}
              size="sm"
              onClick={() => setAnimateEdges(!animateEdges)}
              className="h-8"
            >
              Animate
            </Button>
          </div>
        </div>
      )}
      <div className={title ? "h-[calc(100%-60px)]" : "h-full"}>
        <ReactFlow
          nodes={flowNodes}
          edges={flowEdges}
          fitView
          fitViewOptions={{ 
            padding: 0.2,
            maxZoom: 1.2,
            minZoom: 0.4
          }}
          nodesDraggable={true}
          nodesConnectable={false}
          elementsSelectable={true}
          panOnDrag={true}
          zoomOnScroll={true}
          minZoom={0.3}
          maxZoom={2}
          defaultViewport={{ x: 0, y: 0, zoom: 0.9 }}
          defaultEdgeOptions={{
            type: 'default',
            animated: animateEdges,
          }}
        >
          <Background variant="dots" gap={20} size={1.5} color="#94a3b8" />
          <Controls showInteractive={true} />
        </ReactFlow>
      </div>
    </div>
  );
}
