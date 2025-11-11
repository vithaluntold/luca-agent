import { useCallback, useEffect } from 'react';
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
}

const nodeWidth = 250;
const nodeHeight = 100;

const getLayoutedElements = (nodes: Node[], edges: Edge[]) => {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({ rankdir: 'TB', ranksep: 80, nodesep: 50 });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    return {
      ...node,
      position: {
        x: nodeWithPosition.x - nodeWidth / 2,
        y: nodeWithPosition.y - nodeHeight / 2,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
};

const getNodeStyle = (type: string) => {
  const baseStyle = {
    padding: '16px',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: 500,
    border: '2px solid',
    minHeight: '100px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center' as const,
  };

  switch (type) {
    case 'start':
      return {
        ...baseStyle,
        background: 'hsl(var(--primary))',
        borderColor: 'hsl(var(--primary))',
        color: 'hsl(var(--primary-foreground))',
        borderRadius: '50px',
      };
    case 'end':
      return {
        ...baseStyle,
        background: 'hsl(var(--secondary))',
        borderColor: 'hsl(var(--secondary))',
        color: 'hsl(var(--secondary-foreground))',
        borderRadius: '50px',
      };
    case 'decision':
      return {
        ...baseStyle,
        background: 'hsl(var(--accent))',
        borderColor: 'hsl(var(--accent))',
        color: 'hsl(var(--accent-foreground))',
        transform: 'rotate(45deg)',
      };
    default:
      return {
        ...baseStyle,
        background: 'hsl(var(--card))',
        borderColor: 'hsl(var(--border))',
        color: 'hsl(var(--card-foreground))',
      };
  }
};

export default function WorkflowRenderer({ nodes, edges, title }: WorkflowRendererProps) {
  const initialNodes: Node[] = nodes.map((node, idx) => ({
    id: node.id,
    type: 'default',
    data: { 
      label: (
        <div className="flex flex-col gap-2">
          <div className="font-semibold">{node.label}</div>
          {node.description && <div className="text-xs opacity-80">{node.description}</div>}
          {node.substeps && node.substeps.length > 0 && (
            <div className="text-xs text-left mt-2 space-y-1">
              {node.substeps.map((step, i) => (
                <div key={i}>• {step}</div>
              ))}
            </div>
          )}
        </div>
      )
    },
    position: { x: 0, y: idx * 150 },
    style: getNodeStyle(node.type),
  }));

  const initialEdges: Edge[] = edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: edge.label,
    type: 'smoothstep',
    animated: true,
    markerEnd: {
      type: MarkerType.ArrowClosed,
      width: 20,
      height: 20,
    },
    style: {
      strokeWidth: 2,
      stroke: 'hsl(var(--primary))',
    },
    labelStyle: {
      fill: 'hsl(var(--foreground))',
      fontSize: 12,
    },
    labelBgStyle: {
      fill: 'hsl(var(--background))',
    },
  }));

  const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
    initialNodes,
    initialEdges
  );

  const [flowNodes, setNodes] = useNodesState(layoutedNodes);
  const [flowEdges, setEdges] = useEdgesState(layoutedEdges);

  useEffect(() => {
    const { nodes: newLayoutedNodes, edges: newLayoutedEdges } = getLayoutedElements(
      initialNodes,
      initialEdges
    );
    setNodes(newLayoutedNodes);
    setEdges(newLayoutedEdges);
  }, [nodes, edges]);

  return (
    <div className="w-full h-[600px] border rounded-lg overflow-hidden bg-background">
      {title && (
        <div className="p-4 border-b bg-muted">
          <h3 className="text-lg font-semibold">{title}</h3>
        </div>
      )}
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        fitView
        attributionPosition="bottom-left"
        nodesDraggable={true}
        nodesConnectable={false}
        elementsSelectable={true}
      >
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
}
