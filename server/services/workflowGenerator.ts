import { VisualizationData, WorkflowNode, WorkflowEdge } from '@shared/types/visualization';

/**
 * Generate workflow visualization from AI response
 * This extracts workflow structure and creates nodes/edges for ReactFlow
 */
export class WorkflowGenerator {
  /**
   * Generate workflow visualization if the response contains workflow structure
   */
  static async generateWorkflowVisualization(
    response: string,
    chatMode?: string
  ): Promise<VisualizationData | null> {
    // Only generate workflow visualizations in workflow mode
    if (chatMode !== 'workflow') {
      return null;
    }

    // Parse the response to extract workflow steps
    const nodes = this.extractNodes(response);
    const edges = this.extractEdges(nodes);

    if (nodes.length === 0) {
      return null;
    }

    return {
      type: 'workflow',
      title: 'Workflow Diagram',
      data: [], // Not used for workflows
      config: {
        nodes,
        edges
      }
    };
  }

  /**
   * Extract workflow nodes from AI response
   */
  private static extractNodes(response: string): WorkflowNode[] {
    const nodes: WorkflowNode[] = [];
    
    // Match patterns like "Step 1:", "Phase 1:", etc.
    const stepPattern = /(?:Step|Phase|Stage)\s+(\d+):\s*([^\n]+)/gi;
    const matches = [...response.matchAll(stepPattern)];

    // Add start node
    nodes.push({
      id: 'start',
      type: 'start',
      label: 'Start'
    });

    matches.forEach((match, index) => {
      const stepNumber = match[1];
      const stepTitle = match[2].trim();
      
      // Extract description and substeps after this step title
      const stepIndex = match.index!;
      const nextStepMatch = matches[index + 1];
      const endIndex = nextStepMatch ? nextStepMatch.index! : response.length;
      const stepContent = response.substring(stepIndex, endIndex);
      
      // Extract substeps (lines starting with -, •, or *)
      const substepPattern = /(?:^|\n)\s*[-•*]\s*([^\n]+)/g;
      const substeps = [...stepContent.matchAll(substepPattern)]
        .map(m => m[1].trim())
        .filter(s => s.length > 0);

      nodes.push({
        id: `step-${stepNumber}`,
        type: 'step',
        label: stepTitle,
        substeps: substeps.slice(0, 5) // Limit to 5 substeps for readability
      });
    });

    // Add end node
    nodes.push({
      id: 'end',
      type: 'end',
      label: 'Complete'
    });

    return nodes;
  }

  /**
   * Generate edges connecting nodes sequentially
   */
  private static extractEdges(nodes: WorkflowNode[]): WorkflowEdge[] {
    const edges: WorkflowEdge[] = [];

    for (let i = 0; i < nodes.length - 1; i++) {
      edges.push({
        id: `edge-${i}`,
        source: nodes[i].id,
        target: nodes[i + 1].id
      });
    }

    return edges;
  }
}
