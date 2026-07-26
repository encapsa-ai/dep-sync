import { useEffect, useMemo } from "react";
import dagre from "@dagrejs/dagre";
import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Edge,
  type NodeMouseHandler,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { GraphResult } from "../lib/types";
import {
  PackageCard,
  type PackageFlowNode,
  type PackageNodeData,
} from "./PackageCard";

const nodeTypes = { package: PackageCard };
const NODE_WIDTH = 218;
const NODE_HEIGHT = 82;

function layoutGraph(
  graph: GraphResult,
  selectedName: string | null,
  visibleNames: Set<string>,
) {
  const layout = new dagre.graphlib.Graph();
  layout.setDefaultEdgeLabel(() => ({}));
  layout.setGraph({
    rankdir: "LR",
    ranksep: 118,
    nodesep: 38,
    edgesep: 22,
    marginx: 42,
    marginy: 42,
  });

  const cycleNames = new Set(graph.cycles.flat());
  const visibleNodes = graph.nodes.filter((node) => visibleNames.has(node.name));
  const visibleEdges = graph.edges.filter(
    (edge) => visibleNames.has(edge.source) && visibleNames.has(edge.target),
  );

  visibleNodes.forEach((node) =>
    layout.setNode(node.name, { width: NODE_WIDTH, height: NODE_HEIGHT }),
  );
  visibleEdges.forEach((edge) => layout.setEdge(edge.source, edge.target));
  dagre.layout(layout);

  const nodes: PackageFlowNode[] = visibleNodes.map((node) => {
    const position = layout.node(node.name) ?? { x: 0, y: 0 };
    const data: PackageNodeData = {
      ...node,
      selected: node.name === selectedName,
      inCycle: cycleNames.has(node.name),
    };
    return {
      id: node.name,
      type: "package",
      position: {
        x: position.x - NODE_WIDTH / 2,
        y: position.y - NODE_HEIGHT / 2,
      },
      data,
      draggable: true,
      selectable: true,
    };
  });

  const edges: Edge[] = visibleEdges.map((edge) => {
    const color = edge.isDrift
      ? "var(--destructive)"
      : "var(--border-strong)";
    return {
      id: `${edge.source}:${edge.target}`,
      source: edge.source,
      target: edge.target,
      animated: edge.isDrift,
      type: "smoothstep",
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 13,
        height: 13,
        color,
      },
      style: {
        stroke: color,
        strokeWidth: edge.isDrift ? 2 : 1.25,
        strokeDasharray: edge.isDrift ? "6 5" : undefined,
      },
      ariaLabel: `${edge.source} depends on ${edge.target}${
        edge.isDrift ? " and is out of sync" : ""
      }`,
    };
  });

  return { nodes, edges };
}

export function GraphView({
  graph,
  selectedName,
  visibleNames,
  onSelect,
}: {
  graph: GraphResult;
  selectedName: string | null;
  visibleNames: Set<string>;
  onSelect: (name: string) => void;
}) {
  const layout = useMemo(
    () => layoutGraph(graph, selectedName, visibleNames),
    [graph, selectedName, visibleNames],
  );
  const [nodes, setNodes, onNodesChange] = useNodesState<PackageFlowNode>(
    layout.nodes,
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState(layout.edges);

  useEffect(() => {
    setNodes(layout.nodes);
    setEdges(layout.edges);
  }, [layout, setEdges, setNodes]);

  const handleNodeClick: NodeMouseHandler<PackageFlowNode> = (_, node) =>
    onSelect(node.id);

  return (
    <div className="h-full min-h-0 w-full bg-graph">
      <ReactFlow<PackageFlowNode>
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        onPaneClick={() => undefined}
        nodesConnectable={false}
        edgesFocusable={false}
        deleteKeyCode={null}
        fitView
        fitViewOptions={{ padding: 0.18, maxZoom: 1.05 }}
        minZoom={0.18}
        maxZoom={1.8}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={22}
          size={1}
          color="var(--graph-dot)"
        />
        <Controls
          position="bottom-left"
          showInteractive={false}
          className="dep-sync-flow-controls"
        />
        <MiniMap
          position="bottom-right"
          pannable
          zoomable
          nodeStrokeWidth={3}
          nodeColor={(node) => {
            const data = node.data as PackageNodeData;
            if (data.error || data.inCycle) return "var(--destructive)";
            if (data.kind === "application") return "var(--app)";
            if (data.driftCount > 0) return "var(--warning)";
            if (data.isStaleDep) return "var(--info)";
            return "var(--success)";
          }}
          maskColor="var(--minimap-mask)"
          className="dep-sync-minimap"
        />
      </ReactFlow>
    </div>
  );
}
