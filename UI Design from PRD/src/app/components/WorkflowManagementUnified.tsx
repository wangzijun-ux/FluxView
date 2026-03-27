import { useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent as ReactDragEvent, MouseEvent as ReactMouseEvent } from "react";
import { ChevronRight, Plus, Save, Search, Sparkles, Workflow as WorkflowIcon } from "lucide-react";
import {
  alpha,
  Autocomplete,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  TextField,
  useTheme,
} from "@mui/material";
import { useSearchParams } from "react-router";
import { useMasterData } from "./MasterDataContext";
import type { ProcessMaster, WorkflowDefinition, WorkflowStepSetting } from "./masterStore";

const WORKFLOW_LAYOUT_STORAGE_KEY = "fluxview.workflow.designer-layouts.v1";
const WORKFLOW_EDGE_STORAGE_KEY = "fluxview.workflow.designer-edges.v1";
const NODE_WIDTH = 140;
const NODE_HEIGHT = 58;

const shipperTones = [
  { bg: "#E6F1FB", text: "#0C447C", border: "#B5D4F4" },
  { bg: "#EEEDFE", text: "#3C3489", border: "#C9C5F5" },
  { bg: "#FAEEDA", text: "#633806", border: "#F2D2A2" },
  { bg: "#E7F7F0", text: "#085041", border: "#9ED9C0" },
  { bg: "#FCE8EE", text: "#8E1F49", border: "#F2B5C9" },
] as const;

const processTones = [
  { bg: "#E1F5EE", text: "#085041", border: "#5DCAA5", group: "standard" },
  { bg: "#E1F5EE", text: "#085041", border: "#5DCAA5", group: "standard" },
  { bg: "#E1F5EE", text: "#085041", border: "#5DCAA5", group: "standard" },
  { bg: "#FAECE7", text: "#712B13", border: "#F0997B", group: "special" },
  { bg: "#FAEEDA", text: "#633806", border: "#FAC775", group: "special" },
] as const;

type EdgeType = "serial" | "copy" | "split";
type CanvasPosition = { x: number; y: number };
type CanvasLayoutMap = Record<string, CanvasPosition>;
type CanvasEdge = { id: string; from: string; to: string; type: EdgeType };
type DraggingNodeState = { id: string; offsetX: number; offsetY: number };
type EdgeMenuState = { edgeId: string; x: number; y: number };

const edgeTypeOptions = [
  { key: "serial", label: "直列", desc: "通常の前後業務", color: "#0F6E56", dash: false },
  { key: "copy", label: "コピー", desc: "同一情報を複製して渡す", color: "#534AB7", dash: true },
  { key: "split", label: "分岐", desc: "条件によって別ルートへ分ける", color: "#BA7517", dash: true },
] as const;

const fieldSx = {
  "& .MuiOutlinedInput-root": {
    borderRadius: "12px",
    bgcolor: "#FFFFFF",
  },
  "& .MuiInputLabel-root": {
    fontSize: 13,
  },
} as const;

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

function byUpdatedAtDesc(a: WorkflowDefinition, b: WorkflowDefinition) {
  return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
}

function buildStepFromProcess(process: ProcessMaster, layoutAreaIds: string[] = []): WorkflowStepSetting {
  return {
    id: makeId("step"),
    processId: process.id,
    layoutAreaIds,
    requiredQualificationIds: process.defaultQualificationIds,
    requiredSkillIds: process.defaultSkillIds,
    standardHeadcount: process.defaultHeadcount,
    uph: process.defaultUph,
    manual: "",
    caution: "",
  };
}

function formatUpdatedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function getShipperTone(index: number) {
  return shipperTones[index % shipperTones.length];
}

function getShipperInitials(name: string) {
  const normalized = name.replace(/\s+/g, "");
  return Array.from(normalized).slice(0, 2).join("").toUpperCase() || "WF";
}

function getProcessTone(processId: string) {
  const numeric = Number.parseInt(processId.replace(/\D/g, ""), 10);
  if (!Number.isNaN(numeric)) return processTones[Math.abs(numeric) % processTones.length];

  const hash = Array.from(processId).reduce((total, char) => total + char.charCodeAt(0), 0);
  return processTones[hash % processTones.length];
}

function defaultEdgeType(step: WorkflowStepSetting): EdgeType {
  if (step.caution?.trim()) return "split";
  if (step.manual?.trim()) return "copy";
  return "serial";
}

function getDefaultCanvasPosition(index: number) {
  const centerX = 250;
  const leftX = 96;
  const rightX = 404;
  const y = 36 + index * 118;
  const x =
    index === 0 ? centerX
    : index % 3 === 1 ? leftX
    : index % 3 === 2 ? rightX
    : centerX;

  return { x, y };
}

function loadStoredObject<T>(storageKey: string) {
  if (typeof window === "undefined") return {} as Record<string, T>;

  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return {} as Record<string, T>;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, T>) : {} as Record<string, T>;
  } catch {
    return {} as Record<string, T>;
  }
}

function getSavedLayout(workflowId: string) {
  return loadStoredObject<CanvasLayoutMap>(WORKFLOW_LAYOUT_STORAGE_KEY)[workflowId] ?? null;
}

function saveLayout(workflowId: string, layout: CanvasLayoutMap) {
  if (typeof window === "undefined") return;
  const current = loadStoredObject<CanvasLayoutMap>(WORKFLOW_LAYOUT_STORAGE_KEY);
  current[workflowId] = layout;
  window.localStorage.setItem(WORKFLOW_LAYOUT_STORAGE_KEY, JSON.stringify(current));
}

function getSavedEdges(workflowId: string) {
  return loadStoredObject<CanvasEdge[]>(WORKFLOW_EDGE_STORAGE_KEY)[workflowId] ?? null;
}

function saveEdges(workflowId: string, edges: CanvasEdge[]) {
  if (typeof window === "undefined") return;
  const current = loadStoredObject<CanvasEdge[]>(WORKFLOW_EDGE_STORAGE_KEY);
  current[workflowId] = edges;
  window.localStorage.setItem(WORKFLOW_EDGE_STORAGE_KEY, JSON.stringify(current));
}

function normalizeLayout(steps: WorkflowStepSetting[], saved: CanvasLayoutMap | null) {
  return steps.reduce<CanvasLayoutMap>((acc, step, index) => {
    acc[step.id] = saved?.[step.id] ?? getDefaultCanvasPosition(index);
    return acc;
  }, {});
}

function buildDefaultCanvasEdges(steps: WorkflowStepSetting[]) {
  return steps.slice(1).map((step, index) => ({
    id: `edge-${steps[index].id}-${step.id}`,
    from: steps[index].id,
    to: step.id,
    type: defaultEdgeType(step),
  }));
}

function normalizeCanvasEdges(steps: WorkflowStepSetting[], saved: CanvasEdge[] | null) {
  const stepIds = new Set(steps.map((step) => step.id));
  const filtered = (saved ?? []).filter((edge) => stepIds.has(edge.from) && stepIds.has(edge.to) && edge.from !== edge.to);

  if (saved !== null) return filtered;
  if (steps.length < 2) return [];
  return buildDefaultCanvasEdges(steps);
}

function getCanvasPortPosition(position: CanvasPosition, side: "top" | "bottom") {
  const cx = position.x + NODE_WIDTH / 2;
  return side === "top"
    ? { x: cx, y: position.y }
    : { x: cx, y: position.y + NODE_HEIGHT };
}

function buildCanvasEdgePath(from: CanvasPosition, to: CanvasPosition) {
  const x1 = from.x + NODE_WIDTH / 2;
  const y1 = from.y + NODE_HEIGHT;
  const x2 = to.x + NODE_WIDTH / 2;
  const y2 = to.y;

  if (Math.abs(x1 - x2) < 5) return `M${x1} ${y1} L${x2} ${y2}`;

  const mid = y1 + (y2 - y1) * 0.5;
  return `M${x1} ${y1} L${x1} ${mid} L${x2} ${mid} L${x2} ${y2}`;
}

export function WorkflowManagementUnified() {
  const theme = useTheme();
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    shippers,
    sites,
    qualifications,
    skills,
    processes,
    workflows,
    setWorkflows,
    selectedSiteId,
    getPrimaryShipperForSite,
    getShippersForSite,
  } = useMasterData();
  const [selectedWorkflowId, setSelectedWorkflowId] = useState("");
  const [expandedShipperId, setExpandedShipperId] = useState<string | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newWorkflowShipperId, setNewWorkflowShipperId] = useState("");
  const [processKeyword, setProcessKeyword] = useState("");
  const [canvasLayout, setCanvasLayout] = useState<CanvasLayoutMap>({});
  const [canvasEdges, setCanvasEdges] = useState<CanvasEdge[]>([]);
  const [draggingNode, setDraggingNode] = useState<DraggingNodeState | null>(null);
  const [connectingFromId, setConnectingFromId] = useState("");
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [editingStepId, setEditingStepId] = useState("");
  const [stepDraft, setStepDraft] = useState<WorkflowStepSetting | null>(null);
  const [edgeMenu, setEdgeMenu] = useState<EdgeMenuState | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);

  const activeSite = useMemo(
    () => sites.find((site) => site.id === selectedSiteId) ?? null,
    [sites, selectedSiteId],
  );
  const activeShipper = useMemo(
    () => (activeSite ? getPrimaryShipperForSite(activeSite.id) : null),
    [activeSite, getPrimaryShipperForSite],
  );
  const activeWorkflowShippers = useMemo(
    () => (activeSite ? getShippersForSite(activeSite.id) : []).filter((shipper) => shipper.status === "active"),
    [activeSite, getShippersForSite],
  );
  const activeLayoutAreas = useMemo(
    () => activeSite?.layoutAreas ?? [],
    [activeSite],
  );
  const processMap = useMemo(
    () => new Map(processes.map((process) => [process.id, process])),
    [processes],
  );
  const siteWorkflows = useMemo(
    () => workflows.filter((workflow) => workflow.siteId === selectedSiteId).sort(byUpdatedAtDesc),
    [workflows, selectedSiteId],
  );
  const workflowGroups = useMemo(
    () =>
      activeWorkflowShippers.map((shipper, index) => {
        const grouped = siteWorkflows.filter((workflow) => workflow.shipperId === shipper.id);
        return { shipper, tone: getShipperTone(index), workflows: grouped, totalCount: grouped.length };
      }),
    [activeWorkflowShippers, siteWorkflows],
  );
  const selectedWorkflow = useMemo(
    () => siteWorkflows.find((workflow) => workflow.id === selectedWorkflowId) ?? null,
    [selectedWorkflowId, siteWorkflows],
  );
  const selectedWorkflowShipper = useMemo(
    () => shippers.find((shipper) => shipper.id === selectedWorkflow?.shipperId) ?? null,
    [selectedWorkflow, shippers],
  );
  const editingStep = useMemo(
    () => selectedWorkflow?.steps.find((step) => step.id === editingStepId) ?? null,
    [editingStepId, selectedWorkflow],
  );
  const filteredProcesses = useMemo(() => {
    const normalized = processKeyword.trim().toLowerCase();
    if (!normalized) return processes;
    return processes.filter((process) => `${process.name} ${process.description}`.toLowerCase().includes(normalized));
  }, [processKeyword, processes]);
  const standardProcesses = useMemo(
    () => filteredProcesses.filter((process) => getProcessTone(process.id).group === "standard"),
    [filteredProcesses],
  );
  const specialProcesses = useMemo(
    () => filteredProcesses.filter((process) => getProcessTone(process.id).group === "special"),
    [filteredProcesses],
  );
  const activeEdge = useMemo(
    () => (edgeMenu ? canvasEdges.find((edge) => edge.id === edgeMenu.edgeId) ?? null : null),
    [canvasEdges, edgeMenu],
  );
  const requestedWorkflowId = searchParams.get("workflowId") ?? "";
  const dialogPaperSx = {
    borderRadius: "22px",
    border: `1px solid ${alpha(theme.palette.divider, 0.9)}`,
    bgcolor: alpha(theme.palette.background.paper, theme.palette.mode === "dark" ? 0.98 : 1),
    backgroundImage: "none",
    boxShadow:
      theme.palette.mode === "dark"
        ? "0 24px 60px rgba(2, 6, 23, 0.42)"
        : "0 24px 60px rgba(15, 23, 42, 0.14)",
  } as const;

  useEffect(() => {
    if (workflowGroups.length === 0) {
      return;
    }
    if (expandedShipperId && workflowGroups.some((group) => group.shipper.id === expandedShipperId)) {
      return;
    }
    setExpandedShipperId(activeShipper?.id ?? workflowGroups[0]?.shipper.id ?? null);
  }, [activeShipper, expandedShipperId, workflowGroups]);
  useEffect(() => {
    if (siteWorkflows.length === 0) {
      setSelectedWorkflowId("");
      return;
    }
    if (!selectedWorkflowId && requestedWorkflowId) {
      const requested = siteWorkflows.find((workflow) => workflow.id === requestedWorkflowId);
      if (requested) {
        setSelectedWorkflowId(requested.id);
        setExpandedShipperId(requested.shipperId);
        return;
      }
    }
    if (!siteWorkflows.some((workflow) => workflow.id === selectedWorkflowId)) {
      const preferred = siteWorkflows.find((workflow) => workflow.shipperId === expandedShipperId);
      setSelectedWorkflowId(preferred?.id ?? siteWorkflows[0].id);
    }
  }, [expandedShipperId, requestedWorkflowId, selectedWorkflowId, siteWorkflows]);
  useEffect(() => {
    const currentWorkflowId = searchParams.get("workflowId") ?? "";
    if (!selectedWorkflowId && !currentWorkflowId) return;

    const nextParams = new URLSearchParams(searchParams);
    if (selectedWorkflowId) nextParams.set("workflowId", selectedWorkflowId);
    else nextParams.delete("workflowId");

    if (nextParams.toString() !== searchParams.toString()) {
      setSearchParams(nextParams, { replace: true });
    }
  }, [searchParams, selectedWorkflowId, setSearchParams]);

  useEffect(() => {
    if (!selectedWorkflow) {
      setCanvasLayout({});
      setCanvasEdges([]);
      setEditingStepId("");
      return;
    }

    setCanvasLayout(normalizeLayout(selectedWorkflow.steps, getSavedLayout(selectedWorkflow.id)));
    setCanvasEdges(normalizeCanvasEdges(selectedWorkflow.steps, getSavedEdges(selectedWorkflow.id)));
  }, [selectedWorkflow]);

  useEffect(() => {
    if (!editingStep) {
      setStepDraft(null);
      return;
    }

    setStepDraft({
      ...editingStep,
      layoutAreaIds: [...(editingStep.layoutAreaIds ?? [])],
      requiredQualificationIds: [...editingStep.requiredQualificationIds],
      requiredSkillIds: [...editingStep.requiredSkillIds],
    });
  }, [editingStep]);

  useEffect(() => {
    if (selectedWorkflow) saveLayout(selectedWorkflow.id, canvasLayout);
  }, [canvasLayout, selectedWorkflow]);

  useEffect(() => {
    if (selectedWorkflow) saveEdges(selectedWorkflow.id, canvasEdges);
  }, [canvasEdges, selectedWorkflow]);

  const updateWorkflow = (workflowId: string, mutate: (workflow: WorkflowDefinition) => WorkflowDefinition) => {
    setWorkflows((prev) =>
      prev.map((workflow) =>
        workflow.id === workflowId
          ? { ...mutate(workflow), updatedAt: new Date().toISOString() }
          : workflow,
      ),
    );
  };

  const openCreateDialog = (shipperId?: string) => {
    setCreateDialogOpen(true);
    setNewName("");
    setNewWorkflowShipperId(shipperId ?? activeShipper?.id ?? activeWorkflowShippers[0]?.id ?? "");
  };

  const createWorkflow = () => {
    if (!activeSite || !newWorkflowShipperId) return;

    const shipper = shippers.find((item) => item.id === newWorkflowShipperId);
    const nextIndex =
      siteWorkflows.filter((workflow) => workflow.shipperId === newWorkflowShipperId).length + 1;
    const nextWorkflow: WorkflowDefinition = {
      id: makeId("workflow"),
      name: newName.trim() || `${shipper?.name ?? activeSite.name}_業務フロー${String(nextIndex).padStart(2, "0")}`,
      shipperId: newWorkflowShipperId,
      siteId: activeSite.id,
      updatedAt: new Date().toISOString(),
      steps: [],
    };

    setWorkflows((prev) => [nextWorkflow, ...prev]);
    setSelectedWorkflowId(nextWorkflow.id);
    setExpandedShipperId(newWorkflowShipperId);
    setCreateDialogOpen(false);
  };

  const updateStep = (stepId: string, mutate: (step: WorkflowStepSetting) => WorkflowStepSetting) => {
    if (!selectedWorkflow) return;

    updateWorkflow(selectedWorkflow.id, (workflow) => ({
      ...workflow,
      steps: workflow.steps.map((step) => (step.id === stepId ? mutate(step) : step)),
    }));
  };

  const removeStepFromCanvas = (stepId: string) => {
    if (!selectedWorkflow) return;

    updateWorkflow(selectedWorkflow.id, (workflow) => ({
      ...workflow,
      steps: workflow.steps.filter((step) => step.id !== stepId),
    }));
    setCanvasLayout((prev) => {
      const next = { ...prev };
      delete next[stepId];
      return next;
    });
    setCanvasEdges((prev) => prev.filter((edge) => edge.from !== stepId && edge.to !== stepId));
    setEditingStepId((prev) => (prev === stepId ? "" : prev));
  };

  const addStepAtPosition = (processId: string, position?: CanvasPosition) => {
    if (!selectedWorkflow) return;

    const process = processMap.get(processId);
    if (!process) return;

    const nextStep = buildStepFromProcess(process, activeLayoutAreas[0]?.id ? [activeLayoutAreas[0].id] : []);
    updateWorkflow(selectedWorkflow.id, (workflow) => ({
      ...workflow,
      steps: [...workflow.steps, nextStep],
    }));
    setCanvasLayout((prev) => ({
      ...prev,
      [nextStep.id]: position ?? getDefaultCanvasPosition(selectedWorkflow.steps.length),
    }));
    setEditingStepId(nextStep.id);
  };

  const getCanvasRelativePosition = (clientX: number, clientY: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const updateCanvasPosition = (stepId: string, nextPosition: CanvasPosition) => {
    const canvasWidth = canvasRef.current?.clientWidth ?? 760;
    const canvasHeight = canvasRef.current?.clientHeight ?? 640;

    setCanvasLayout((prev) => ({
      ...prev,
      [stepId]: {
        x: Math.max(20, Math.min(nextPosition.x, canvasWidth - NODE_WIDTH - 20)),
        y: Math.max(20, Math.min(nextPosition.y, canvasHeight - NODE_HEIGHT - 20)),
      },
    }));
  };

  const handleCanvasDrop = (event: ReactDragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const processId = event.dataTransfer.getData("processId");
    if (!processId) return;

    const position = getCanvasRelativePosition(event.clientX, event.clientY);
    addStepAtPosition(processId, {
      x: position.x - NODE_WIDTH / 2,
      y: position.y - NODE_HEIGHT / 2,
    });
  };

  const handleNodeMouseDown = (event: ReactMouseEvent<HTMLButtonElement>, stepId: string) => {
    if ((event.target as HTMLElement).dataset.port) return;
    event.stopPropagation();

    const position = getCanvasRelativePosition(event.clientX, event.clientY);
    const stepPosition = canvasLayout[stepId] ?? getDefaultCanvasPosition(0);
    setDraggingNode({
      id: stepId,
      offsetX: position.x - stepPosition.x,
      offsetY: position.y - stepPosition.y,
    });
  };

  const handlePortMouseDown = (event: ReactMouseEvent<HTMLDivElement>, stepId: string) => {
    event.stopPropagation();
    setConnectingFromId(stepId);
  };

  const handleCanvasMouseMove = (event: ReactMouseEvent<HTMLDivElement>) => {
    const position = getCanvasRelativePosition(event.clientX, event.clientY);
    setMousePos(position);

    if (draggingNode) {
      updateCanvasPosition(draggingNode.id, {
        x: position.x - draggingNode.offsetX,
        y: position.y - draggingNode.offsetY,
      });
    }
  };

  const handleCanvasMouseUp = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!selectedWorkflow) {
      setDraggingNode(null);
      setConnectingFromId("");
      return;
    }

    if (connectingFromId) {
      const position = getCanvasRelativePosition(event.clientX, event.clientY);
      const targetStep = selectedWorkflow.steps.find((step) => {
        const stepPosition = canvasLayout[step.id] ?? getDefaultCanvasPosition(0);
        return (
          position.x >= stepPosition.x &&
          position.x <= stepPosition.x + NODE_WIDTH &&
          position.y >= stepPosition.y &&
          position.y <= stepPosition.y + NODE_HEIGHT &&
          step.id !== connectingFromId
        );
      });

      if (
        targetStep &&
        !canvasEdges.some((edge) => edge.from === connectingFromId && edge.to === targetStep.id)
      ) {
        setCanvasEdges((prev) => [
          ...prev,
          { id: `edge-${connectingFromId}-${targetStep.id}`, from: connectingFromId, to: targetStep.id, type: "serial" },
        ]);
      }
    }

    setDraggingNode(null);
    setConnectingFromId("");
  };

  const autoLayoutCanvas = () => {
    if (!selectedWorkflow) return;

    const inDegree: Record<string, number> = {};
    const levels: Record<string, number> = {};
    selectedWorkflow.steps.forEach((step) => {
      inDegree[step.id] = 0;
      levels[step.id] = 0;
    });
    canvasEdges.forEach((edge) => {
      inDegree[edge.to] = (inDegree[edge.to] ?? 0) + 1;
    });

    const queue = selectedWorkflow.steps.filter((step) => (inDegree[step.id] ?? 0) === 0).map((step) => step.id);
    const visited = new Set(queue);
    while (queue.length > 0) {
      const currentId = queue.shift()!;
      canvasEdges
        .filter((edge) => edge.from === currentId)
        .forEach((edge) => {
          levels[edge.to] = Math.max(levels[edge.to] ?? 0, (levels[currentId] ?? 0) + 1);
          if (!visited.has(edge.to)) {
            visited.add(edge.to);
            queue.push(edge.to);
          }
        });
    }

    const byLevel: Record<number, string[]> = {};
    selectedWorkflow.steps.forEach((step) => {
      const level = levels[step.id] ?? 0;
      byLevel[level] ??= [];
      byLevel[level].push(step.id);
    });

    setCanvasLayout(
      selectedWorkflow.steps.reduce<CanvasLayoutMap>((acc, step) => {
        const level = levels[step.id] ?? 0;
        const siblings = byLevel[level] ?? [step.id];
        const index = siblings.indexOf(step.id);
        const totalWidth = siblings.length * (NODE_WIDTH + 36) - 36;
        const startX = Math.max(24, (540 - totalWidth) / 2);
        acc[step.id] = { x: startX + index * (NODE_WIDTH + 36), y: 36 + level * 122 };
        return acc;
      }, {}),
    );
  };

  const saveCanvasDraft = () => {
    if (!selectedWorkflow) return;
    saveLayout(selectedWorkflow.id, canvasLayout);
    saveEdges(selectedWorkflow.id, canvasEdges);
    updateWorkflow(selectedWorkflow.id, (workflow) => ({ ...workflow }));
  };

  const applyStepDraft = () => {
    if (!stepDraft) return;
    updateStep(stepDraft.id, () => ({
      ...stepDraft,
      layoutAreaIds: [...(stepDraft.layoutAreaIds ?? [])],
      requiredQualificationIds: [...stepDraft.requiredQualificationIds],
      requiredSkillIds: [...stepDraft.requiredSkillIds],
    }));
    setEditingStepId("");
  };

  const updateEdgeType = (edgeId: string, type: EdgeType) => {
    setCanvasEdges((prev) => prev.map((edge) => (edge.id === edgeId ? { ...edge, type } : edge)));
    setEdgeMenu(null);
  };

  const removeEdge = (edgeId: string) => {
    setCanvasEdges((prev) => prev.filter((edge) => edge.id !== edgeId));
    setEdgeMenu(null);
  };

  if (!activeSite || activeWorkflowShippers.length === 0) {
    return (
      <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden bg-[#F5F5F3] p-6">
        <section className="flex flex-1 items-center justify-center rounded-[28px] border border-slate-200 bg-white p-10 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
          <div className="max-w-[520px] text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#EEF5FC] text-[#185FA5]">
              <WorkflowIcon className="h-7 w-7" />
            </div>
            <div className="mt-4 text-lg font-semibold text-slate-900">業務管理を表示する拠点がありません</div>
            <div className="mt-2 text-sm leading-6 text-slate-500">
              マスタ管理で拠点と荷主の関連付けを設定すると、この画面からテンプレートと業務フローを管理できます。
            </div>
          </div>
        </section>
      </div>
    );
  }
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[#F5F5F3]">
      <div className="min-h-0 flex-1 overflow-x-auto">
        <div className="flex h-full min-w-[1180px]">
          <aside className="flex w-[278px] min-h-0 flex-col border-r border-slate-200 bg-white">
            <div className="flex items-center justify-end border-b border-slate-200 px-4 py-3">
              <button
                type="button"
                onClick={() => openCreateDialog()}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-[#F8FAFC] px-3 py-1.5 text-[12px] font-semibold text-slate-700 shadow-sm transition hover:border-[#85B7EB] hover:bg-white hover:text-[#185FA5]"
              >
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#E8F2FB] text-[#185FA5]">
                  <Plus className="h-3.5 w-3.5" />
                </span>
                追加
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
              {workflowGroups.map(({ shipper, tone, workflows: shipperWorkflows, totalCount }) => {
                const isExpanded = expandedShipperId === shipper.id;
                return (
                  <div key={shipper.id} className="mb-2 rounded-2xl border border-transparent">
                    <button
                      type="button"
                      onClick={() => {
                        setExpandedShipperId(shipper.id);
                        if (!isExpanded && shipperWorkflows[0]) {
                          setSelectedWorkflowId(shipperWorkflows[0].id);
                        }
                      }}
                      className={`flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left transition ${
                        isExpanded ? "border-[#B5D4F4] bg-[#F0F7FF]" : "border-transparent hover:border-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      <ChevronRight
                        className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${
                          isExpanded ? "rotate-90" : ""
                        }`}
                      />
                      <div
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold"
                        style={{ backgroundColor: tone.bg, color: tone.text }}
                      >
                        {getShipperInitials(shipper.name)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[12px] font-semibold text-slate-900">{shipper.name}</div>
                        <div className="mt-1 text-[10px] text-slate-500">{totalCount} テンプレート</div>
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="space-y-1 px-3 pb-2 pt-2">
                        {shipperWorkflows.map((workflow) => {
                          const isActive = selectedWorkflowId === workflow.id;
                          return (
                            <button
                              key={workflow.id}
                              type="button"
                              onClick={() => setSelectedWorkflowId(workflow.id)}
                              className={`w-full rounded-xl border px-3 py-2 text-left transition ${
                                isActive
                                  ? "border-[#85B7EB] bg-[#E6F1FB]"
                                  : "border-transparent bg-transparent hover:border-slate-200 hover:bg-slate-50"
                              }`}
                            >
                              <div className={`truncate text-[12px] font-semibold ${isActive ? "text-[#0C447C]" : "text-slate-900"}`}>
                                {workflow.name}
                              </div>
                              <div className="mt-1 text-[10px] text-slate-500">
                                {workflow.steps.length} 業務・{formatUpdatedAt(workflow.updatedAt)}
                              </div>
                            </button>
                          );
                        })}

                        <button
                          type="button"
                          onClick={() => openCreateDialog(shipper.id)}
                          className="flex w-full items-center justify-center gap-1 rounded-xl border border-dashed border-slate-300 px-3 py-2 text-[11px] font-medium text-slate-500 transition hover:border-[#85B7EB] hover:bg-[#F7FBFF] hover:text-[#185FA5]"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          新規業務フロー
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="border-t border-slate-200 px-4 py-3">
              <div className="text-[10px] font-semibold tracking-[0.08em] text-slate-400">LINE TYPES</div>
              <div className="mt-2 space-y-2">
                {edgeTypeOptions.map((option) => (
                  <div key={option.key} className="flex items-center gap-2 text-[11px] text-slate-500">
                    <svg width="18" height="4" aria-hidden="true">
                      <line
                        x1="0"
                        y1="2"
                        x2="18"
                        y2="2"
                        stroke={option.color}
                        strokeWidth="2"
                        strokeDasharray={option.dash ? "5 3" : "none"}
                      />
                    </svg>
                    <span>{option.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </aside>

          <section className="relative min-h-0 min-w-0 flex-1 bg-[#F5F5F3]">
            <div className="absolute right-4 top-4 z-20 flex flex-wrap gap-2">
              <Button
                variant="outlined"
                startIcon={<Sparkles size={15} />}
                onClick={autoLayoutCanvas}
                sx={{
                  minHeight: 36,
                  borderRadius: "10px",
                  fontWeight: 700,
                  bgcolor: "rgba(255,255,255,0.92)",
                  backdropFilter: "blur(8px)",
                }}
              >
                自動整列
              </Button>
              <Button
                variant="contained"
                startIcon={<Save size={15} />}
                onClick={saveCanvasDraft}
                sx={{
                  minHeight: 36,
                  borderRadius: "10px",
                  fontWeight: 700,
                  boxShadow: "0 12px 24px rgba(24,95,165,0.18)",
                  bgcolor: "#185FA5",
                  "&:hover": { bgcolor: "#124C85", boxShadow: "0 12px 24px rgba(18,76,133,0.22)" },
                }}
              >
                保存
              </Button>
            </div>
            <div
              ref={canvasRef}
              className="relative h-full min-h-0 overflow-hidden"
              onMouseMove={handleCanvasMouseMove}
              onMouseUp={handleCanvasMouseUp}
              onMouseLeave={() => {
                setDraggingNode(null);
                setConnectingFromId("");
              }}
              onDragOver={(event) => event.preventDefault()}
              onDrop={handleCanvasDrop}
              onClick={() => setEdgeMenu(null)}
            >
              <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
                <defs>
                  <pattern id="workflow-manager-grid" width="20" height="20" patternUnits="userSpaceOnUse">
                    <path d="M20 0L0 0L0 20" fill="none" stroke="#E8E8E4" strokeWidth="0.7" />
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#workflow-manager-grid)" />
              </svg>

              <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
                <defs>
                  <marker
                    id="workflow-manager-arrow"
                    viewBox="0 0 10 10"
                    refX="8"
                    refY="5"
                    markerWidth="6"
                    markerHeight="6"
                    orient="auto-start-reverse"
                  >
                    <path
                      d="M2 1L8 5L2 9"
                      fill="none"
                      stroke="context-stroke"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </marker>
                </defs>

                {canvasEdges.map((edge) => {
                  const from = canvasLayout[edge.from];
                  const to = canvasLayout[edge.to];
                  if (!from || !to) return null;

                  const config = edgeTypeOptions.find((option) => option.key === edge.type) ?? edgeTypeOptions[0];
                  const path = buildCanvasEdgePath(from, to);
                  const fromPort = getCanvasPortPosition(from, "bottom");
                  const toPort = getCanvasPortPosition(to, "top");
                  const labelX = (fromPort.x + toPort.x) / 2;
                  const labelY = (fromPort.y + toPort.y) / 2;

                  return (
                    <g key={edge.id}>
                      <path
                        d={path}
                        fill="none"
                        stroke={config.color}
                        strokeWidth="1.6"
                        strokeDasharray={config.dash ? "6 4" : "none"}
                        markerEnd="url(#workflow-manager-arrow)"
                      />
                      <path
                        d={path}
                        fill="none"
                        stroke="transparent"
                        strokeWidth="16"
                        style={{ pointerEvents: "stroke", cursor: "pointer" }}
                        onClick={(event) => {
                          event.stopPropagation();
                          setEdgeMenu({ edgeId: edge.id, x: event.clientX, y: event.clientY });
                        }}
                      />
                      <g
                        style={{ pointerEvents: "all", cursor: "pointer" }}
                        onClick={(event) => {
                          event.stopPropagation();
                          setEdgeMenu({ edgeId: edge.id, x: event.clientX, y: event.clientY });
                        }}
                      >
                        <rect
                          x={labelX - 22}
                          y={labelY - 9}
                          width={44}
                          height={18}
                          rx={5}
                          fill="#FFFFFF"
                          stroke={config.color}
                          strokeWidth="0.8"
                        />
                        <text
                          x={labelX}
                          y={labelY + 0.5}
                          textAnchor="middle"
                          dominantBaseline="central"
                          style={{ fontSize: 9, fontWeight: 600, fill: config.color, fontFamily: "inherit" }}
                        >
                          {config.label}
                        </text>
                      </g>
                    </g>
                  );
                })}

                {connectingFromId && (() => {
                  const from = canvasLayout[connectingFromId];
                  if (!from) return null;
                  const start = getCanvasPortPosition(from, "bottom");
                  return (
                    <line
                      x1={start.x}
                      y1={start.y}
                      x2={mousePos.x}
                      y2={mousePos.y}
                      stroke="#185FA5"
                      strokeWidth="1.5"
                      strokeDasharray="4 4"
                    />
                  );
                })()}
              </svg>

              {selectedWorkflow ? (
                <>
                  <div className="absolute left-4 top-4 rounded-full border border-slate-200 bg-white/90 px-3 py-1 text-[10px] text-slate-500 shadow-sm backdrop-blur">
                    ダブルクリック: 編集 / 下ポートからドラッグ: 連線 / 右の業務ライブラリからドラッグ: 追加
                  </div>

                  {selectedWorkflow.steps.map((step, index) => {
                    const process = processMap.get(step.processId);
                    const position = canvasLayout[step.id] ?? getDefaultCanvasPosition(index);
                    const tone = getProcessTone(step.processId);
                    const isEditing = step.id === editingStepId;

                    return (
                      <button
                        key={step.id}
                        type="button"
                        onMouseDown={(event) => handleNodeMouseDown(event, step.id)}
                        onDoubleClick={(event) => {
                          event.stopPropagation();
                          setEditingStepId(step.id);
                        }}
                        className={`absolute flex flex-col items-center justify-center rounded-[10px] border text-center shadow-[0_12px_24px_rgba(15,23,42,0.08)] transition ${
                          draggingNode?.id === step.id ? "cursor-grabbing" : "cursor-grab"
                        } ${isEditing ? "ring-2 ring-[#85B7EB]" : ""}`}
                        style={{
                          left: position.x,
                          top: position.y,
                          width: NODE_WIDTH,
                          height: NODE_HEIGHT,
                          backgroundColor: tone.bg,
                          borderColor: tone.border,
                        }}
                      >
                        <div className="px-3 text-[12px] font-semibold" style={{ color: tone.text }}>
                          {process?.name ?? "未設定業務"}
                        </div>
                        <div className="mt-1 text-[9px] font-medium" style={{ color: alpha(tone.text, 0.72) }}>
                            UPH:{step.uph} / {step.standardHeadcount}人
                        </div>
                        <div
                          data-port="top"
                          className="absolute left-1/2 top-[-5px] h-[10px] w-[10px] -translate-x-1/2 rounded-full bg-white"
                          style={{ border: `2px solid ${tone.border}` }}
                        />
                        <div
                          data-port="bottom"
                          onMouseDown={(event) => handlePortMouseDown(event, step.id)}
                          className="absolute bottom-[-5px] left-1/2 h-[10px] w-[10px] -translate-x-1/2 rounded-full bg-white"
                          style={{ border: `2px solid ${tone.border}` }}
                        />
                      </button>
                    );
                  })}
                </>
              ) : (
                <div className="absolute inset-0 flex items-center justify-center p-6">
                  <div className="max-w-[420px] text-center">
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-[#185FA5] shadow-[0_10px_24px_rgba(15,23,42,0.08)]">
                      <WorkflowIcon className="h-7 w-7" />
                    </div>
                    <div className="mt-4 text-lg font-semibold text-slate-900">テンプレートを選択してください</div>
                    <div className="mt-2 text-sm leading-6 text-slate-500">
                      左側のテンプレートを選ぶと、ここでフロー全体をドラッグ編集できます。
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>
          <aside className="flex w-[246px] min-h-0 flex-col border-l border-slate-200 bg-[#FAFAF8]">
            <div className="border-b border-slate-200 px-4 py-4">
              <div className="text-[12px] font-semibold text-slate-900">業務ライブラリ</div>
              <div className="mt-1 text-[11px] text-slate-500">業務をドラッグして業務フローへ追加</div>
              <div className="mt-3 flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
                <Search className="h-4 w-4 text-slate-400" />
                <input
                  value={processKeyword}
                  onChange={(event) => setProcessKeyword(event.target.value)}
                  placeholder="業務名で検索..."
                  className="w-full bg-transparent text-[12px] text-slate-700 outline-none placeholder:text-slate-400"
                />
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
              <div className="mb-2 text-[10px] font-semibold tracking-[0.08em] text-slate-400">STANDARD</div>
              <div className="space-y-2">
                {standardProcesses.map((process) => {
                  const tone = getProcessTone(process.id);
                  return (
                    <button
                      key={process.id}
                      type="button"
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.setData("processId", process.id);
                        event.dataTransfer.effectAllowed = "copy";
                      }}
                      onDoubleClick={() => addStepAtPosition(process.id)}
                      className="w-full rounded-xl border px-3 py-2 text-left shadow-sm transition hover:translate-y-[-1px] hover:shadow-md"
                      style={{ backgroundColor: tone.bg, borderColor: tone.border, color: tone.text }}
                    >
                      <div className="text-[12px] font-semibold">{process.name}</div>
                      <div className="mt-1 text-[10px] opacity-75">{process.description || "標準業務"}</div>
                    </button>
                  );
                })}
              </div>

              <div className="mb-2 mt-5 text-[10px] font-semibold tracking-[0.08em] text-slate-400">SPECIAL</div>
              <div className="space-y-2">
                {specialProcesses.map((process) => {
                  const tone = getProcessTone(process.id);
                  return (
                    <button
                      key={process.id}
                      type="button"
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.setData("processId", process.id);
                        event.dataTransfer.effectAllowed = "copy";
                      }}
                      onDoubleClick={() => addStepAtPosition(process.id)}
                      className="w-full rounded-xl border px-3 py-2 text-left shadow-sm transition hover:translate-y-[-1px] hover:shadow-md"
                      style={{ backgroundColor: tone.bg, borderColor: tone.border, color: tone.text }}
                    >
                      <div className="text-[12px] font-semibold">{process.name}</div>
                      <div className="mt-1 text-[10px] opacity-75">{process.description || "特殊業務"}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="border-t border-slate-200 px-4 py-3 text-[10px] leading-5 text-slate-400">
              ドラッグで画布に追加、ダブルクリックで末尾に追加できます。
            </div>
          </aside>
        </div>
      </div>

      <Dialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        fullWidth
        maxWidth="sm"
        PaperProps={{ sx: dialogPaperSx }}
      >
        <DialogTitle sx={{ px: 3, pt: 3, pb: 1.5 }}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[18px] font-semibold text-slate-900">新規業務フロー</div>
              <div className="mt-1 text-[12px] leading-6 text-slate-500">
                荷主を選択して業務フロー名を設定すると、空の業務フローを作成します。
              </div>
            </div>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#EAF3FC] text-[#185FA5]">
              <Plus className="h-5 w-5" />
            </div>
          </div>
        </DialogTitle>
        <DialogContent sx={{ px: 3, pb: 1, pt: 0 }}>
          <div className="rounded-[20px] border border-slate-200 bg-[#FAFAF8] p-4">
            <div className="grid gap-4">
          <TextField
            select
            label="荷主"
            value={newWorkflowShipperId}
            onChange={(event) => setNewWorkflowShipperId(event.target.value)}
            helperText="業務フローを紐づける荷主を選択します"
            sx={{
              ...fieldSx,
              "& .MuiSelect-select": {
                whiteSpace: "normal",
                lineHeight: 1.5,
                py: 1.5,
              },
            }}
            fullWidth
          >
            {activeWorkflowShippers.map((shipper) => (
              <MenuItem key={shipper.id} value={shipper.id} sx={{ whiteSpace: "normal", lineHeight: 1.5 }}>
                {shipper.name}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="業務フロー名"
            placeholder="例: 入荷業務フロー"
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            helperText="左側の一覧に表示される業務フロー名です"
            sx={fieldSx}
            fullWidth
          />
            </div>
          </div>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3, pt: 1, justifyContent: "space-between" }}>
          <Button
            onClick={() => setCreateDialogOpen(false)}
            variant="outlined"
            sx={{ borderRadius: "10px", fontWeight: 700 }}
          >
            キャンセル
          </Button>
          <Button
            variant="contained"
            onClick={createWorkflow}
            disabled={!newWorkflowShipperId}
            sx={{
              borderRadius: "10px",
              fontWeight: 700,
              boxShadow: "none",
              minWidth: 132,
              bgcolor: "#185FA5",
              "&:hover": { bgcolor: "#124C85", boxShadow: "none" },
            }}
          >
            業務フローを作成
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={Boolean(stepDraft)}
        onClose={() => setEditingStepId("")}
        fullWidth
        maxWidth="sm"
        PaperProps={{ sx: dialogPaperSx }}
      >
        <DialogTitle sx={{ fontWeight: 700 }}>
          {stepDraft ? processMap.get(stepDraft.processId)?.name ?? "業務設定" : "業務設定"}
        </DialogTitle>
        {stepDraft && (
          <>
            <DialogContent sx={{ display: "grid", gap: 2, pt: 1.5 }}>
              <TextField
                select
                label="業務"
                value={stepDraft.processId}
                onChange={(event) => {
                  const nextProcess = processMap.get(event.target.value);
                  setStepDraft((prev) =>
                    prev
                      ? {
                          ...prev,
                          processId: event.target.value,
                          requiredQualificationIds:
                            nextProcess?.defaultQualificationIds ?? prev.requiredQualificationIds,
                          requiredSkillIds: nextProcess?.defaultSkillIds ?? prev.requiredSkillIds,
                          standardHeadcount: nextProcess?.defaultHeadcount ?? prev.standardHeadcount,
                          uph: nextProcess?.defaultUph ?? prev.uph,
                        }
                      : prev,
                  );
                }}
                sx={fieldSx}
                fullWidth
              >
                {processes.map((process) => (
                  <MenuItem key={process.id} value={process.id}>
                    {process.name}
                  </MenuItem>
                ))}
              </TextField>

              <Autocomplete
                multiple
                options={activeLayoutAreas}
                value={activeLayoutAreas.filter((area) => (stepDraft.layoutAreaIds ?? []).includes(area.id))}
                isOptionEqualToValue={(option, value) => option.id === value.id}
                getOptionLabel={(option) => option.name}
                onChange={(_, values) =>
                  setStepDraft((prev) =>
                    prev ? { ...prev, layoutAreaIds: values.map((value) => value.id) } : prev,
                  )
                }
                disabled={activeLayoutAreas.length === 0}
                renderTags={(value, getTagProps) =>
                  value.map((option, index) => (
                    <Chip {...getTagProps({ index })} key={option.id} label={option.name} size="small" />
                  ))
                }
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="作業区域"
                    placeholder={activeLayoutAreas.length > 0 ? "区域を選択" : "区域未登録"}
                    helperText={
                      activeLayoutAreas.length > 0
                        ? "この業務を実施する区域を複数選択できます"
                        : "拠点詳細の「設備・レイアウト」で区域を先に登録してください"
                    }
                    sx={fieldSx}
                  />
                )}
              />

              <div className="grid gap-3 sm:grid-cols-2">
                <TextField
                  label="標準人数"
                  type="number"
                  value={stepDraft.standardHeadcount}
                  onChange={(event) =>
                    setStepDraft((prev) =>
                      prev
                        ? { ...prev, standardHeadcount: Math.max(1, Number(event.target.value) || 1) }
                        : prev,
                    )
                  }
                  sx={fieldSx}
                />
                <TextField
                  label="UPH"
                  type="number"
                  value={stepDraft.uph}
                  onChange={(event) =>
                    setStepDraft((prev) =>
                      prev ? { ...prev, uph: Math.max(0, Number(event.target.value) || 0) } : prev,
                    )
                  }
                  sx={fieldSx}
                />
              </div>

              <Autocomplete
                multiple
                options={qualifications}
                value={qualifications.filter((item) => stepDraft.requiredQualificationIds.includes(item.id))}
                isOptionEqualToValue={(option, value) => option.id === value.id}
                getOptionLabel={(option) => option.name}
                onChange={(_, values) =>
                  setStepDraft((prev) =>
                    prev ? { ...prev, requiredQualificationIds: values.map((value) => value.id) } : prev,
                  )
                }
                renderTags={(value, getTagProps) =>
                  value.map((option, index) => (
                    <Chip {...getTagProps({ index })} key={option.id} label={option.name} size="small" />
                  ))
                }
                renderInput={(params) => (
                  <TextField {...params} label="必要資格" placeholder="資格を選択" sx={fieldSx} />
                )}
              />

              <Autocomplete
                multiple
                options={skills}
                value={skills.filter((item) => stepDraft.requiredSkillIds.includes(item.id))}
                isOptionEqualToValue={(option, value) => option.id === value.id}
                getOptionLabel={(option) => option.name}
                onChange={(_, values) =>
                  setStepDraft((prev) =>
                    prev ? { ...prev, requiredSkillIds: values.map((value) => value.id) } : prev,
                  )
                }
                renderTags={(value, getTagProps) =>
                  value.map((option, index) => (
                    <Chip {...getTagProps({ index })} key={option.id} label={option.name} size="small" />
                  ))
                }
                renderInput={(params) => (
                  <TextField {...params} label="必要スキル" placeholder="スキルを選択" sx={fieldSx} />
                )}
              />

              <TextField
                label="マニュアル"
                value={stepDraft.manual ?? ""}
                onChange={(event) =>
                  setStepDraft((prev) => (prev ? { ...prev, manual: event.target.value } : prev))
                }
                placeholder="作業メモや手順を入力"
                multiline
                minRows={3}
                sx={fieldSx}
                fullWidth
              />

              <TextField
                label="注意事項"
                value={stepDraft.caution ?? ""}
                onChange={(event) =>
                  setStepDraft((prev) => (prev ? { ...prev, caution: event.target.value } : prev))
                }
                placeholder="分岐条件や確認事項を入力"
                multiline
                minRows={3}
                sx={fieldSx}
                fullWidth
              />
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 3, justifyContent: "space-between" }}>
              <Button color="error" onClick={() => removeStepFromCanvas(stepDraft.id)} sx={{ fontWeight: 700 }}>
                削除
              </Button>
              <div className="flex gap-2">
                <Button onClick={() => setEditingStepId("")} sx={{ fontWeight: 700 }}>
                  キャンセル
                </Button>
                <Button
                  variant="contained"
                  onClick={applyStepDraft}
                  sx={{ borderRadius: "10px", fontWeight: 700, boxShadow: "none" }}
                >
                  保存
                </Button>
              </div>
            </DialogActions>
          </>
        )}
      </Dialog>

      {activeEdge && edgeMenu && (
        <div className="fixed inset-0 z-50" onClick={() => setEdgeMenu(null)}>
          <div
            className="absolute w-[220px] rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_16px_36px_rgba(15,23,42,0.14)]"
            style={{ left: edgeMenu.x, top: edgeMenu.y }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="px-2 py-1 text-[10px] font-semibold tracking-[0.08em] text-slate-400">
              LINE TYPE
            </div>
            <div className="space-y-1">
              {edgeTypeOptions.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => updateEdgeType(activeEdge.id, option.key)}
                  className={`flex w-full items-start gap-3 rounded-xl px-3 py-2 text-left transition ${
                    activeEdge.type === option.key ? "bg-[#F0F7FF]" : "hover:bg-slate-50"
                  }`}
                >
                  <svg width="20" height="4" className="mt-1 shrink-0" aria-hidden="true">
                    <line
                      x1="0"
                      y1="2"
                      x2="20"
                      y2="2"
                      stroke={option.color}
                      strokeWidth="2"
                      strokeDasharray={option.dash ? "5 3" : "none"}
                    />
                  </svg>
                  <div>
                    <div className="text-[12px] font-semibold text-slate-900">{option.label}</div>
                    <div className="text-[10px] text-slate-500">{option.desc}</div>
                  </div>
                </button>
              ))}
            </div>
            <div className="mt-2 border-t border-slate-100 pt-2">
              <button
                type="button"
                onClick={() => removeEdge(activeEdge.id)}
                className="w-full rounded-xl px-3 py-2 text-left text-[12px] font-semibold text-[#A32D2D] transition hover:bg-[#FFF5F5]"
              >
                連線を削除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
