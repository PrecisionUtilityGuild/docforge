export const SUPPORTED_DIAGRAM_TYPES = ["process", "flowchart", "tree"] as const;

export type DiagramType = (typeof SUPPORTED_DIAGRAM_TYPES)[number];

export type DiagramSpec = {
  type: DiagramType;
  nodes: Array<{ id: string; label: string }>;
  edges: Array<[string, string]>;
  title?: string;
};

export function validateDiagram(
  diagram: unknown,
): { ok: true; diagram: DiagramSpec } | { ok: false; message: string; agent_action: string } {
  if (!diagram || typeof diagram !== "object") {
    return {
      ok: false,
      message: "diagram must be an object",
      agent_action: "Provide diagram with type, nodes, and edges.",
    };
  }
  const d = diagram as Record<string, unknown>;
  if (typeof d.type !== "string" || !SUPPORTED_DIAGRAM_TYPES.includes(d.type as DiagramType)) {
    return {
      ok: false,
      message: `Unsupported diagram type "${String(d.type)}"`,
      agent_action: `Use one of: ${SUPPORTED_DIAGRAM_TYPES.join(", ")}`,
    };
  }
  if (!Array.isArray(d.nodes) || d.nodes.length === 0) {
    return {
      ok: false,
      message: "diagram.nodes must be a non-empty array",
      agent_action: "Add nodes with id and label.",
    };
  }
  if (!Array.isArray(d.edges)) {
    return {
      ok: false,
      message: "diagram.edges must be an array",
      agent_action: "Add edges as [from_id, to_id] pairs.",
    };
  }
  return { ok: true, diagram: d as unknown as DiagramSpec };
}
