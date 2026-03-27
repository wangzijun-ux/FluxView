import { useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent as ReactDragEvent, PointerEvent as ReactPointerEvent } from "react";
import {
  ArrowLeft,
  GripVertical,
  LayoutGrid,
  MousePointer2,
  Plus,
  Sparkles,
  Trash2,
  Workflow,
} from "lucide-react";
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
import { useNavigate, useParams } from "react-router";
import { useMasterData } from "./MasterDataContext";
import { useThemeColors } from "./ThemeContext";
import type { ProcessMaster, WorkflowDefinition, WorkflowStepSetting } from "./masterStore";
import {
  DEFAULT_QUALIFICATION_ICON_KEY,
  DEFAULT_SKILL_ICON_KEY,
  getCapabilityToneClasses,
  getMasterIconOption,
  type CapabilityTone,
  type MasterIconKey,
} from "./masterIconOptions";

const DESIGNER_LAYOUT_STORAGE_KEY = "fluxview.workflow.designer-layouts.v1";
const DESIGNER_EDGE_STORAGE_KEY = "fluxview.workflow.designer-edges.v1";
const NODE_WIDTH = 156;
const NODE_HEIGHT = 72;

type StepPosition = {
  x: number;
  y: number;
};

type StepPositionMap = Record<string, StepPosition>;

type PaletteDragPayload = {
  type: "process";
  processId: string;
};

type DesignerEdge = {
  id: string;
  from: string;
  to: string;
  type: PreviewEdgeType;
};

type DraggingNodeState = {
  id: string;
  offsetX: number;
  offsetY: number;
};

type EdgeMenuState = {
  edgeId: string;
  x: number;
  y: number;
};

const shipperTones = [
  { bg: "#E6F1FB", text: "#0C447C", border: "#B5D4F4" },
  { bg: "#EEEDFE", text: "#3C3489", border: "#C9C5F5" },
  { bg: "#FAEEDA", text: "#633806", border: "#F2D2A2" },
  { bg: "#E7F7F0", text: "#085041", border: "#9ED9C0" },
  { bg: "#FCE8EE", text: "#8E1F49", border: "#F2B5C9" },
] as const;

const processTones = [
  { bg: "#E1F5EE", text: "#085041", border: "#5DCAA5" },
  { bg: "#E1F5EE", text: "#085041", border: "#5DCAA5" },
  { bg: "#E1F5EE", text: "#085041", border: "#5DCAA5" },
  { bg: "#FAECE7", text: "#712B13", border: "#F0997B" },
  { bg: "#FAEEDA", text: "#633806", border: "#FAC775" },
] as const;

type PreviewEdgeType = "serial" | "copy" | "split";

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function formatUpdatedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("ja-JP", {
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
  if (!Number.isNaN(numeric)) {
    return processTones[Math.abs(numeric) % processTones.length];
  }

  const hash = Array.from(processId).reduce((total, char) => total + char.charCodeAt(0), 0);
  return processTones[hash % processTones.length];
}

function resolveEdgeType(step: WorkflowStepSetting): PreviewEdgeType {
  if (step.caution?.trim()) return "split";
  if (step.manual?.trim()) return "copy";
  return "serial";
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

function getDefaultStepPosition(index: number) {
  const centerX = 320;
  const leftX = 96;
  const rightX = 544;
  const y = 40 + index * 124;
  const x =
    index === 0 ? centerX
    : index % 3 === 1 ? leftX
    : index % 3 === 2 ? rightX
    : centerX;

  return { x, y };
}

function normalizeLayout(steps: WorkflowStepSetting[], saved: StepPositionMap | null) {
  return steps.reduce<StepPositionMap>((acc, step, index) => {
    const candidate = saved?.[step.id];
    acc[step.id] = candidate ?? getDefaultStepPosition(index);
    return acc;
  }, {});
}

function loadSavedLayouts() {
  if (typeof window === "undefined") return {};

  try {
    const raw = window.localStorage.getItem(DESIGNER_LAYOUT_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveWorkflowLayout(workflowId: string, layout: StepPositionMap) {
  if (typeof window === "undefined") return;

  const current = loadSavedLayouts();
  current[workflowId] = layout;
  window.localStorage.setItem(DESIGNER_LAYOUT_STORAGE_KEY, JSON.stringify(current));
}

function getWorkflowLayout(workflowId: string) {
  const current = loadSavedLayouts();
  const saved = current[workflowId];
  return saved && typeof saved === "object" ? (saved as StepPositionMap) : null;
}

function loadSavedEdgeMaps() {
  if (typeof window === "undefined") return {};

  try {
    const raw = window.localStorage.getItem(DESIGNER_EDGE_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveWorkflowEdges(workflowId: string, edges: DesignerEdge[]) {
  if (typeof window === "undefined") return;

  const current = loadSavedEdgeMaps();
  current[workflowId] = edges;
  window.localStorage.setItem(DESIGNER_EDGE_STORAGE_KEY, JSON.stringify(current));
}

function getWorkflowEdges(workflowId: string) {
  const current = loadSavedEdgeMaps();
  const saved = current[workflowId];
  return Array.isArray(saved) ? (saved as DesignerEdge[]) : null;
}

function buildDefaultEdges(steps: WorkflowStepSetting[]) {
  return steps.slice(1).map((step, index) => ({
    id: `edge-${steps[index].id}-${step.id}`,
    from: steps[index].id,
    to: step.id,
    type: resolveEdgeType(step),
  }));
}

function normalizeEdges(steps: WorkflowStepSetting[], saved: DesignerEdge[] | null) {
  const stepIds = new Set(steps.map((step) => step.id));
  const filtered = (saved ?? []).filter(
    (edge) => stepIds.has(edge.from) && stepIds.has(edge.to) && edge.from !== edge.to,
  );

  return filtered.length > 0 || steps.length < 2 ? filtered : buildDefaultEdges(steps);
}

function getPortPos(position: StepPosition, side: "top" | "bottom") {
  const cx = position.x + NODE_WIDTH / 2;
  return side === "top"
    ? { x: cx, y: position.y }
    : { x: cx, y: position.y + NODE_HEIGHT };
}

function buildEdgePath(from: StepPosition, to: StepPosition) {
  const x1 = from.x + NODE_WIDTH / 2;
  const y1 = from.y + NODE_HEIGHT;
  const x2 = to.x + NODE_WIDTH / 2;
  const y2 = to.y;

  if (Math.abs(x1 - x2) < 6) {
    return `M${x1} ${y1} L${x2} ${y2}`;
  }

  const middleY = y1 + (y2 - y1) * 0.5;
  return `M${x1} ${y1} L${x1} ${middleY} L${x2} ${middleY} L${x2} ${y2}`;
}

function reorderSteps(steps: WorkflowStepSetting[], draggedId: string, targetId: string) {
  if (draggedId === targetId) return steps;

  const nextSteps = [...steps];
  const draggedIndex = nextSteps.findIndex((step) => step.id === draggedId);
  const targetIndex = nextSteps.findIndex((step) => step.id === targetId);
  if (draggedIndex < 0 || targetIndex < 0) return steps;

  const [dragged] = nextSteps.splice(draggedIndex, 1);
  nextSteps.splice(targetIndex, 0, dragged);
  return nextSteps;
}

function TagSelector({
  label,
  placeholder,
  options,
  selectedIds,
  onChange,
  fallbackIconKey,
  tone,
}: {
  label: string;
  placeholder: string;
  options: Array<{ id: string; name: string; iconKey?: MasterIconKey }>;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  fallbackIconKey: MasterIconKey;
  tone: CapabilityTone;
}) {
  const theme = useTheme();
  const selectedOptions = options.filter((option) => selectedIds.includes(option.id));
  const toneClasses = getCapabilityToneClasses(tone);

  return (
    <Autocomplete
      multiple
      size="small"
      options={options}
      value={selectedOptions}
      disableCloseOnSelect
      limitTags={2}
      isOptionEqualToValue={(option, value) => option.id === value.id}
      getOptionLabel={(option) => option.name}
      onChange={(_, values) => onChange(values.map((value) => value.id))}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          placeholder={placeholder}
          sx={{
            "& .MuiInputLabel-root": { fontSize: 13 },
            "& .MuiOutlinedInput-root": {
              minHeight: 40,
              borderRadius: "12px",
              fontSize: 13,
              bgcolor:
                theme.palette.mode === "dark"
                  ? "rgba(15, 23, 42, 0.72)"
                  : alpha(theme.palette.background.paper, 0.96),
            },
          }}
        />
      )}
      renderTags={(value, getTagProps) =>
        value.map((option, index) => (
          <Chip
            {...getTagProps({ index })}
            key={option.id}
            label={option.name}
            size="small"
            sx={{
              borderRadius: "9999px",
              border: "1px solid",
              borderColor:
                tone === "qualification" ? "rgba(16, 185, 129, 0.2)" : "rgba(59, 130, 246, 0.2)",
              bgcolor:
                tone === "qualification" ? "rgba(16, 185, 129, 0.08)" : "rgba(59, 130, 246, 0.08)",
            }}
            icon={(() => {
              const iconOption = getMasterIconOption(option.iconKey, fallbackIconKey);
              const Icon = iconOption.icon;
              return <Icon className={`h-3.5 w-3.5 ${toneClasses.accentClass}`} />;
            })()}
          />
        ))
      }
      renderOption={(props, option) => {
        const iconOption = getMasterIconOption(option.iconKey, fallbackIconKey);
        const Icon = iconOption.icon;

        return (
          <li {...props}>
            <div className="flex items-center gap-2">
              <span className={`flex h-6 w-6 items-center justify-center rounded-md border ${toneClasses.surfaceClass}`}>
                <Icon className={`h-3.5 w-3.5 ${toneClasses.accentClass}`} />
              </span>
              <span>{option.name}</span>
            </div>
          </li>
        );
      }}
    />
  );
}

export function WorkflowDesignerPage() {
  const theme = useTheme();
  const c = useThemeColors();
  const navigate = useNavigate();
  const { workflowId = "" } = useParams();
  const {
    shippers,
    sites,
    processes,
    qualifications,
    skills,
    workflows,
    setWorkflows,
  } = useMasterData();
  const [selectedStepId, setSelectedStepId] = useState("");
  const [paletteKeyword, setPaletteKeyword] = useState("");
  const [layout, setLayout] = useState<StepPositionMap>({});
  const [designerEdges, setDesignerEdges] = useState<DesignerEdge[]>([]);
  const [orderDragStepId, setOrderDragStepId] = useState("");
  const [canvasDragStepId, setCanvasDragStepId] = useState("");
  const [isCanvasDragOver, setIsCanvasDragOver] = useState(false);
  const [draggingNode, setDraggingNode] = useState<DraggingNodeState | null>(null);
  const [connectingFromId, setConnectingFromId] = useState("");
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [editingNodeId, setEditingNodeId] = useState("");
  const [edgeMenu, setEdgeMenu] = useState<EdgeMenuState | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const workflow = useMemo(
    () => workflows.find((item) => item.id === workflowId) ?? null,
    [workflowId, workflows],
  );
  const site = useMemo(
    () => sites.find((item) => item.id === workflow?.siteId) ?? null,
    [sites, workflow],
  );
  const siteLayoutAreas = useMemo(
    () => site?.layoutAreas ?? [],
    [site],
  );
  const workflowShipper = useMemo(
    () => shippers.find((item) => item.id === workflow?.shipperId) ?? null,
    [shippers, workflow],
  );
  const shipperTone = useMemo(() => {
    const index = Math.max(shippers.findIndex((item) => item.id === workflow?.shipperId), 0);
    return getShipperTone(index);
  }, [shippers, workflow]);
  const processMap = useMemo(() => new Map(processes.map((process) => [process.id, process])), [processes]);
  const selectedStep = useMemo(
    () => workflow?.steps.find((step) => step.id === selectedStepId) ?? workflow?.steps[0] ?? null,
    [selectedStepId, workflow],
  );
  const editingStep = useMemo(
    () => workflow?.steps.find((step) => step.id === editingNodeId) ?? null,
    [editingNodeId, workflow],
  );
  const filteredProcesses = useMemo(() => {
    const normalizedKeyword = paletteKeyword.trim().toLowerCase();
    if (!normalizedKeyword) return processes;
    return processes.filter((process) => {
      const bag = `${process.name} ${process.description}`.toLowerCase();
      return bag.includes(normalizedKeyword);
    });
  }, [paletteKeyword, processes]);
  const canvasHeight = Math.max(620, (workflow?.steps.length ?? 0) * 132 + 120);

  useEffect(() => {
    if (!workflow) return;
    setLayout(normalizeLayout(workflow.steps, getWorkflowLayout(workflow.id)));
  }, [workflow]);

  useEffect(() => {
    if (!workflow) return;
    setDesignerEdges(normalizeEdges(workflow.steps, getWorkflowEdges(workflow.id)));
  }, [workflow]);

  useEffect(() => {
    if (!workflow) return;
    setLayout((prev) => normalizeLayout(workflow.steps, prev));
  }, [workflow]);

  useEffect(() => {
    if (!workflow) return;
    saveWorkflowLayout(workflow.id, layout);
  }, [layout, workflow]);

  useEffect(() => {
    if (!workflow) return;
    saveWorkflowEdges(workflow.id, designerEdges);
  }, [designerEdges, workflow]);

  useEffect(() => {
    if (!workflow?.steps.length) {
      setSelectedStepId("");
      return;
    }

    if (!workflow.steps.some((step) => step.id === selectedStepId)) {
      setSelectedStepId(workflow.steps[0].id);
    }
  }, [selectedStepId, workflow]);

  const fieldSx = {
    "& .MuiInputLabel-root": { fontSize: 13 },
    "& .MuiOutlinedInput-root": {
      borderRadius: "12px",
      fontSize: 13,
      bgcolor:
        theme.palette.mode === "dark"
          ? "rgba(15, 23, 42, 0.72)"
          : alpha(theme.palette.background.paper, 0.96),
    },
  } as const;

  const updateWorkflow = (mutate: (current: WorkflowDefinition) => WorkflowDefinition) => {
    if (!workflow) return;
    setWorkflows((prev) =>
      prev.map((item) =>
        item.id === workflow.id ? { ...mutate(item), updatedAt: new Date().toISOString() } : item,
      ),
    );
  };

  const updateStep = (stepId: string, mutate: (current: WorkflowStepSetting) => WorkflowStepSetting) => {
    updateWorkflow((currentWorkflow) => ({
      ...currentWorkflow,
      steps: currentWorkflow.steps.map((step) => (step.id === stepId ? mutate(step) : step)),
    }));
  };

  const addStepFromProcess = (processId: string, position?: StepPosition) => {
    const process = processMap.get(processId);
    if (!workflow || !process) return;

    const nextStep = buildStepFromProcess(process, siteLayoutAreas[0]?.id ? [siteLayoutAreas[0].id] : []);
    updateWorkflow((currentWorkflow) => ({
      ...currentWorkflow,
      steps: [...currentWorkflow.steps, nextStep],
    }));

    setLayout((prev) => ({
      ...prev,
      [nextStep.id]: position ?? getDefaultStepPosition(workflow.steps.length),
    }));
    setSelectedStepId(nextStep.id);
  };

  const removeStep = (stepId: string) => {
    updateWorkflow((currentWorkflow) => ({
      ...currentWorkflow,
      steps: currentWorkflow.steps.filter((step) => step.id !== stepId),
    }));

    setLayout((prev) => {
      const next = { ...prev };
      delete next[stepId];
      return next;
    });
  };

  const autoLayout = () => {
    if (!workflow) return;
    const inDegree: Record<string, number> = {};
    const levelMap: Record<string, number> = {};

    workflow.steps.forEach((step) => {
      inDegree[step.id] = 0;
      levelMap[step.id] = 0;
    });

    designerEdges.forEach((edge) => {
      inDegree[edge.to] = (inDegree[edge.to] ?? 0) + 1;
    });

    const queue = workflow.steps
      .filter((step) => (inDegree[step.id] ?? 0) === 0)
      .map((step) => step.id);

    const visited = new Set(queue);

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      designerEdges
        .filter((edge) => edge.from === currentId)
        .forEach((edge) => {
          levelMap[edge.to] = Math.max(levelMap[edge.to] ?? 0, (levelMap[currentId] ?? 0) + 1);
          if (!visited.has(edge.to)) {
            visited.add(edge.to);
            queue.push(edge.to);
          }
        });
    }

    const grouped: Record<number, string[]> = {};
    workflow.steps.forEach((step) => {
      const level = levelMap[step.id] ?? 0;
      grouped[level] ??= [];
      grouped[level].push(step.id);
    });

    setLayout(
      workflow.steps.reduce<StepPositionMap>((acc, step) => {
        const level = levelMap[step.id] ?? 0;
        const siblings = grouped[level] ?? [step.id];
        const index = siblings.indexOf(step.id);
        const totalWidth = siblings.length * (NODE_WIDTH + 48) - 48;
        const startX = Math.max(40, (760 - totalWidth) / 2);

        acc[step.id] = {
          x: startX + index * (NODE_WIDTH + 48),
          y: 40 + level * 120,
        };

        return acc;
      }, {}),
    );
  };

  const moveStepToTop = (stepId: string) => {
    updateWorkflow((currentWorkflow) => {
      const nextSteps = [...currentWorkflow.steps];
      const index = nextSteps.findIndex((step) => step.id === stepId);
      if (index <= 0) return currentWorkflow;
      const [step] = nextSteps.splice(index, 1);
      nextSteps.unshift(step);
      return { ...currentWorkflow, steps: nextSteps };
    });
  };

  const moveStepToBottom = (stepId: string) => {
    updateWorkflow((currentWorkflow) => {
      const nextSteps = [...currentWorkflow.steps];
      const index = nextSteps.findIndex((step) => step.id === stepId);
      if (index < 0 || index === nextSteps.length - 1) return currentWorkflow;
      const [step] = nextSteps.splice(index, 1);
      nextSteps.push(step);
      return { ...currentWorkflow, steps: nextSteps };
    });
  };

  const updatePosition = (stepId: string, nextPosition: StepPosition) => {
    const width = canvasRef.current?.clientWidth ?? 900;
    setLayout((prev) => ({
      ...prev,
      [stepId]: {
        x: clamp(nextPosition.x, 24, Math.max(24, width - NODE_WIDTH - 24)),
        y: clamp(nextPosition.y, 24, Math.max(24, canvasHeight - NODE_HEIGHT - 24)),
      },
    }));
  };

  const beginCanvasDrag = (event: ReactPointerEvent<HTMLButtonElement>, stepId: string) => {
    if (!canvasRef.current) return;

    event.preventDefault();
    setSelectedStepId(stepId);
    setCanvasDragStepId(stepId);

    const canvasRect = canvasRef.current.getBoundingClientRect();
    const currentPosition = layout[stepId] ?? getDefaultStepPosition(0);
    const offsetX = event.clientX - canvasRect.left - currentPosition.x;
    const offsetY = event.clientY - canvasRect.top - currentPosition.y;

    const handleMove = (moveEvent: PointerEvent) => {
      updatePosition(stepId, {
        x: moveEvent.clientX - canvasRect.left - offsetX,
        y: moveEvent.clientY - canvasRect.top - offsetY,
      });
    };

    const handleUp = () => {
      setCanvasDragStepId("");
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  };

  const handlePaletteDragStart = (event: ReactDragEvent<HTMLButtonElement>, processId: string) => {
    const payload: PaletteDragPayload = { type: "process", processId };
    event.dataTransfer.setData("application/fluxview-palette", JSON.stringify(payload));
    event.dataTransfer.effectAllowed = "copy";
  };

  const handleCanvasDrop = (event: ReactDragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsCanvasDragOver(false);

    if (!canvasRef.current) return;

    const raw = event.dataTransfer.getData("application/fluxview-palette");
    if (!raw) return;

    try {
      const payload = JSON.parse(raw) as PaletteDragPayload;
      if (payload.type !== "process") return;

      const rect = canvasRef.current.getBoundingClientRect();
      addStepFromProcess(payload.processId, {
        x: event.clientX - rect.left - NODE_WIDTH / 2,
        y: event.clientY - rect.top - NODE_HEIGHT / 2,
      });
    } catch {
      // Ignore invalid drag payloads.
    }
  };

  const handleCanvasMouseMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const nextMousePos = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };

    setMousePos(nextMousePos);

    if (draggingNode) {
      updatePosition(draggingNode.id, {
        x: nextMousePos.x - draggingNode.offsetX,
        y: nextMousePos.y - draggingNode.offsetY,
      });
    }
  };

  const handleCanvasMouseUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!canvasRef.current) {
      setDraggingNode(null);
      setConnectingFromId("");
      return;
    }

    if (connectingFromId) {
      const rect = canvasRef.current.getBoundingClientRect();
      const dropX = event.clientX - rect.left;
      const dropY = event.clientY - rect.top;
      const targetStep = workflow.steps.find((step) => {
        const position = layout[step.id] ?? getDefaultStepPosition(0);
        return (
          dropX >= position.x &&
          dropX <= position.x + NODE_WIDTH &&
          dropY >= position.y &&
          dropY <= position.y + NODE_HEIGHT &&
          step.id !== connectingFromId
        );
      });

      if (targetStep) {
        const edgeId = `edge-${connectingFromId}-${targetStep.id}`;
        setDesignerEdges((prev) => {
          if (prev.some((edge) => edge.from === connectingFromId && edge.to === targetStep.id)) {
            return prev;
          }

          return [...prev, { id: edgeId, from: connectingFromId, to: targetStep.id, type: "serial" }];
        });
      }
    }

    setDraggingNode(null);
    setConnectingFromId("");
  };

  const handleNodeMouseDown = (event: ReactPointerEvent<HTMLDivElement>, stepId: string) => {
    if (!canvasRef.current) return;
    if ((event.target as HTMLElement).dataset.port) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const position = layout[stepId] ?? getDefaultStepPosition(0);
    setSelectedStepId(stepId);
    setDraggingNode({
      id: stepId,
      offsetX: event.clientX - rect.left - position.x,
      offsetY: event.clientY - rect.top - position.y,
    });
  };

  const handlePortMouseDown = (event: ReactPointerEvent<HTMLDivElement>, stepId: string) => {
    event.stopPropagation();
    setSelectedStepId(stepId);
    setConnectingFromId(stepId);
  };

  const forceSave = () => {
    if (!workflow) return;
    saveWorkflowLayout(workflow.id, layout);
    saveWorkflowEdges(workflow.id, designerEdges);
    updateWorkflow((currentWorkflow) => ({ ...currentWorkflow }));
  };

  if (!workflow) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="text-center">
          <div className="text-lg font-semibold text-slate-900">対象のテンプレートが見つかりません</div>
          <Button
            variant="contained"
            startIcon={<ArrowLeft size={16} />}
            onClick={() => navigate("/workflow-management")}
            sx={{ mt: 3, borderRadius: "12px", fontWeight: 700, boxShadow: "none" }}
          >
            業務管理へ戻る
          </Button>
        </div>
      </div>
    );
  }

  const activeEdgeMenu = edgeMenu ? designerEdges.find((edge) => edge.id === edgeMenu.edgeId) ?? null : null;
  const standardProcesses = filteredProcesses.filter((_, index) => index % 5 < 3);
  const specialProcesses = filteredProcesses.filter((_, index) => index % 5 >= 3);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[#F5F5F3]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="text-[15px] font-semibold text-[#2C2C2A]">業務管理</span>
          <span className="rounded-md bg-[#F0F0EE] px-3 py-1 text-[12px] text-[#7D7B73]">
            {workflowShipper?.name ?? "荷主未設定"} / {site?.name ?? "拠点未選択"}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outlined"
            startIcon={<ArrowLeft size={15} />}
            onClick={() => navigate(`/workflow-management?workflowId=${workflow.id}`)}
            sx={{ minHeight: 36, borderRadius: "8px", fontWeight: 700 }}
          >
            一覧へ戻る
          </Button>
          <Button
            variant="outlined"
            startIcon={<Sparkles size={15} />}
            onClick={autoLayout}
            sx={{ minHeight: 36, borderRadius: "8px", fontWeight: 700 }}
          >
            自動整列
          </Button>
          <Button
            variant="contained"
            onClick={forceSave}
            sx={{ minHeight: 36, borderRadius: "8px", fontWeight: 700, boxShadow: "none" }}
          >
            保存
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <aside className="flex h-full w-[190px] shrink-0 flex-col border-r border-slate-200 bg-[#FAFAF8]">
          <div className="border-b border-slate-200 px-4 py-3">
            <div className="text-[13px] font-semibold text-[#2C2C2A]">業務マスタ</div>
            <TextField
              size="small"
              value={paletteKeyword}
              onChange={(event) => setPaletteKeyword(event.target.value)}
              placeholder="検索..."
              sx={{
                mt: 1,
                "& .MuiOutlinedInput-root": {
                  borderRadius: "8px",
                  fontSize: 12,
                  bgcolor: "#fff",
                },
              }}
              fullWidth
            />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
            <div className="mb-2 text-[11px] text-[#888780]">標準業務</div>
            {standardProcesses.map((process) => {
              const tone = getProcessTone(process.id);
              return (
                <div
                  key={process.id}
                  draggable
                  onDragStart={(event) => handlePaletteDragStart(event as unknown as ReactDragEvent<HTMLButtonElement>, process.id)}
                  className="mb-1.5 cursor-grab rounded-md border px-3 py-2 text-[12px] font-semibold"
                  style={{ backgroundColor: tone.bg, borderColor: tone.border, color: tone.text }}
                >
                  {process.name}
                </div>
              );
            })}

            <div className="mb-2 mt-4 text-[11px] text-[#888780]">例外業務</div>
            {specialProcesses.map((process) => {
              const tone = getProcessTone(process.id);
              return (
                <div
                  key={process.id}
                  draggable
                  onDragStart={(event) => handlePaletteDragStart(event as unknown as ReactDragEvent<HTMLButtonElement>, process.id)}
                  className="mb-1.5 cursor-grab rounded-md border px-3 py-2 text-[12px] font-semibold"
                  style={{ backgroundColor: tone.bg, borderColor: tone.border, color: tone.text }}
                >
                  {process.name}
                </div>
              );
            })}
          </div>

          <div className="border-t border-slate-200 px-3 py-3 text-[11px] leading-5 text-[#B4B2A9]">
            業務をドラッグしてキャンバスへドロップ
          </div>
        </aside>

        <div
          ref={canvasRef}
          className="relative min-h-0 flex-1 overflow-hidden"
          onPointerMove={handleCanvasMouseMove}
          onPointerUp={handleCanvasMouseUp}
          onDragOver={(event) => {
            event.preventDefault();
            setIsCanvasDragOver(true);
          }}
          onDragLeave={(event) => {
            if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
            setIsCanvasDragOver(false);
          }}
          onDrop={handleCanvasDrop}
        >
          <svg className="absolute inset-0 h-full w-full pointer-events-none">
            <defs>
              <pattern id="workflow-grid" width="20" height="20" patternUnits="userSpaceOnUse">
                <path d="M20 0L0 0L0 20" fill="none" stroke="#E8E8E4" strokeWidth="0.5" />
              </pattern>
              <marker id="dag-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M2 1L8 5L2 9" fill="none" stroke="context-stroke" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </marker>
            </defs>
            <rect width="100%" height="100%" fill="url(#workflow-grid)" />
          </svg>

          <svg className="absolute inset-0 h-full w-full">
            {designerEdges.map((edge) => {
              const fromPos = layout[edge.from];
              const toPos = layout[edge.to];
              if (!fromPos || !toPos) return null;

              const edgeColor =
                edge.type === "split" ? "#BA7517"
                : edge.type === "copy" ? "#534AB7"
                : "#0F6E56";
              const edgeLabel =
                edge.type === "split" ? "分岐"
                : edge.type === "copy" ? "引当"
                : "直列";
              const fromPort = getPortPos(fromPos, "bottom");
              const toPort = getPortPos(toPos, "top");
              const labelX = (fromPort.x + toPort.x) / 2;
              const labelY = (fromPort.y + toPort.y) / 2;

              return (
                <g key={edge.id}>
                  <path
                    d={buildEdgePath(fromPos, toPos)}
                    fill="none"
                    stroke={edgeColor}
                    strokeWidth="1.5"
                    strokeDasharray={edge.type === "serial" ? "none" : "6 4"}
                    markerEnd="url(#dag-arrow)"
                  />
                  <path
                    d={buildEdgePath(fromPos, toPos)}
                    fill="none"
                    stroke="transparent"
                    strokeWidth="14"
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
                    <rect x={labelX - 22} y={labelY - 9} width={44} height={18} rx={4} fill="#fff" stroke={edgeColor} strokeWidth="0.5" />
                    <text x={labelX} y={labelY + 1} textAnchor="middle" dominantBaseline="central" style={{ fontSize: 10, fontWeight: 500, fill: edgeColor }}>
                      {edgeLabel}
                    </text>
                  </g>
                </g>
              );
            })}

            {connectingFromId && layout[connectingFromId] && (
              <line
                x1={getPortPos(layout[connectingFromId], "bottom").x}
                y1={getPortPos(layout[connectingFromId], "bottom").y}
                x2={mousePos.x}
                y2={mousePos.y}
                stroke="#185FA5"
                strokeWidth="1.5"
                strokeDasharray="4 4"
              />
            )}
          </svg>

          {workflow.steps.map((step, index) => {
            const process = processMap.get(step.processId);
            const position = layout[step.id] ?? getDefaultStepPosition(index);
            const tone = getProcessTone(step.processId);

            return (
              <div
                key={step.id}
                onPointerDown={(event) => handleNodeMouseDown(event, step.id)}
                onDoubleClick={() => {
                  setSelectedStepId(step.id);
                  setEditingNodeId(step.id);
                }}
                className="absolute flex select-none flex-col items-center justify-center rounded-[10px] border-[1.5px]"
                style={{
                  left: position.x,
                  top: position.y,
                  width: NODE_WIDTH,
                  height: NODE_HEIGHT,
                  backgroundColor: tone.bg,
                  borderColor: tone.border,
                  cursor: draggingNode?.id === step.id ? "grabbing" : "grab",
                  boxShadow: draggingNode?.id === step.id ? "0 4px 12px rgba(0,0,0,0.1)" : "none",
                }}
              >
                <div className="text-[13px] font-semibold" style={{ color: tone.text }}>
                  {process?.name ?? "未設定業務"}
                </div>
                <div className="mt-1 text-[10px]" style={{ color: tone.text, opacity: 0.7 }}>
                  UPH:{step.uph} / {step.standardHeadcount}人
                </div>

                <div
                  data-port="top"
                  className="absolute left-1/2 top-[-5px] h-[10px] w-[10px] -translate-x-1/2 rounded-full bg-white"
                  style={{ border: `2px solid ${tone.border}` }}
                />
                <div
                  data-port="bottom"
                  onPointerDown={(event) => handlePortMouseDown(event, step.id)}
                  className="absolute bottom-[-5px] left-1/2 h-[10px] w-[10px] -translate-x-1/2 rounded-full bg-white cursor-crosshair"
                  style={{ border: `2px solid ${tone.border}` }}
                />
              </div>
            );
          })}

          <div className="absolute left-3 top-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-500">
            ダブルクリック: 業務編集 / 下ポートからドラッグ: 連線作成 / 連線ラベルクリック: タイプ変更
          </div>

          <div className="absolute bottom-3 right-3 flex gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] text-[#5F5E5A]">
            {[
              { label: "直列", color: "#0F6E56", dashed: false },
              { label: "引当", color: "#534AB7", dashed: true },
              { label: "分岐", color: "#BA7517", dashed: true },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-2">
                <svg width="16" height="4">
                  <line
                    x1="0"
                    y1="2"
                    x2="16"
                    y2="2"
                    stroke={item.color}
                    strokeWidth="2"
                    strokeDasharray={item.dashed ? "4 3" : "none"}
                  />
                </svg>
                {item.label}
              </div>
            ))}
          </div>

          {isCanvasDragOver && (
            <div className="pointer-events-none absolute inset-0 border-2 border-dashed border-[#85B7EB] bg-[#F4F9FF]/70" />
          )}
        </div>
      </div>

      {editingStep && (
        <Dialog
          open
          onClose={() => setEditingNodeId("")}
          maxWidth="sm"
          fullWidth
          PaperProps={{
            sx: {
              borderRadius: "14px",
              boxShadow: "0 8px 32px rgba(0,0,0,0.15)",
            },
          }}
        >
          <DialogTitle sx={{ px: 3, py: 2.25, borderBottom: "1px solid #E5E7EB", fontWeight: 700 }}>
            {(processMap.get(editingStep.processId)?.name ?? "未設定業務")} ・ 業務設定
          </DialogTitle>
          <DialogContent sx={{ px: 3, py: 2.5 }}>
            <div className="grid gap-4">
              <Autocomplete
                multiple
                options={siteLayoutAreas}
                value={siteLayoutAreas.filter((area) => (editingStep.layoutAreaIds ?? []).includes(area.id))}
                isOptionEqualToValue={(option, value) => option.id === value.id}
                getOptionLabel={(option) => option.name}
                onChange={(_, values) =>
                  updateStep(editingStep.id, (currentStep) => ({
                    ...currentStep,
                    layoutAreaIds: values.map((value) => value.id),
                  }))
                }
                disabled={siteLayoutAreas.length === 0}
                renderTags={(value, getTagProps) =>
                  value.map((option, index) => (
                    <Chip {...getTagProps({ index })} key={option.id} label={option.name} size="small" />
                  ))
                }
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="作業区域"
                    placeholder={siteLayoutAreas.length > 0 ? "区域を選択" : "区域未登録"}
                    helperText={
                      siteLayoutAreas.length > 0
                        ? "この業務を実施する区域を複数選択できます"
                        : "拠点詳細の「設備・レイアウト」で区域を登録してください"
                    }
                    sx={fieldSx}
                  />
                )}
              />

              <div className="grid gap-3 sm:grid-cols-2">
                <TextField
                  size="small"
                  label="UPH"
                  type="number"
                  value={editingStep.uph}
                  onChange={(event) =>
                    updateStep(editingStep.id, (currentStep) => ({
                      ...currentStep,
                      uph: Math.max(0, Number(event.target.value) || 0),
                    }))
                  }
                  sx={fieldSx}
                />
                <TextField
                  size="small"
                  label="標準人数"
                  type="number"
                  value={editingStep.standardHeadcount}
                  onChange={(event) =>
                    updateStep(editingStep.id, (currentStep) => ({
                      ...currentStep,
                      standardHeadcount: Math.max(1, Number(event.target.value) || 1),
                    }))
                  }
                  sx={fieldSx}
                />
              </div>

              <TagSelector
                label="必要資格"
                placeholder="資格を選択"
                options={qualifications}
                selectedIds={editingStep.requiredQualificationIds}
                onChange={(ids) =>
                  updateStep(editingStep.id, (currentStep) => ({
                    ...currentStep,
                    requiredQualificationIds: ids,
                  }))
                }
                fallbackIconKey={DEFAULT_QUALIFICATION_ICON_KEY}
                tone="qualification"
              />

              <TagSelector
                label="必要スキル"
                placeholder="スキルを選択"
                options={skills}
                selectedIds={editingStep.requiredSkillIds}
                onChange={(ids) =>
                  updateStep(editingStep.id, (currentStep) => ({
                    ...currentStep,
                    requiredSkillIds: ids,
                  }))
                }
                fallbackIconKey={DEFAULT_SKILL_ICON_KEY}
                tone="skill"
              />

              <TextField
                label="マニュアル・注意事項"
                value={[editingStep.manual ?? "", editingStep.caution ?? ""].filter(Boolean).join("\n")}
                onChange={(event) =>
                  updateStep(editingStep.id, (currentStep) => ({
                    ...currentStep,
                    manual: event.target.value,
                  }))
                }
                placeholder="作業メモや注意事項を入力"
                multiline
                minRows={4}
                sx={fieldSx}
              />
            </div>
          </DialogContent>
          <DialogActions sx={{ justifyContent: "space-between", px: 3, py: 2, borderTop: "1px solid #E5E7EB" }}>
            <Button
              color="error"
              variant="outlined"
              onClick={() => {
                removeStep(editingStep.id);
                setDesignerEdges((prev) => prev.filter((edge) => edge.from !== editingStep.id && edge.to !== editingStep.id));
                setEditingNodeId("");
              }}
            >
              削除
            </Button>
            <div className="flex gap-2">
              <Button onClick={() => setEditingNodeId("")}>キャンセル</Button>
              <Button variant="contained" onClick={() => setEditingNodeId("")} sx={{ boxShadow: "none" }}>
                保存
              </Button>
            </div>
          </DialogActions>
        </Dialog>
      )}

      {activeEdgeMenu && edgeMenu && (
        <div className="fixed inset-0 z-[150]" onClick={() => setEdgeMenu(null)}>
          <div
            className="absolute w-[220px] rounded-[10px] border border-slate-200 bg-white p-2 shadow-[0_4px_16px_rgba(0,0,0,0.1)]"
            style={{ left: edgeMenu.x, top: edgeMenu.y }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="px-2 py-1 text-[11px] text-slate-400">連線タイプ</div>
            {[
              { key: "serial", label: "直列", desc: "通常の前後業務", color: "#0F6E56" },
              { key: "copy", label: "引当", desc: "条件付きの派生業務", color: "#534AB7" },
              { key: "split", label: "分岐", desc: "例外処理や分岐業務", color: "#BA7517" },
            ].map((item) => (
              <div
                key={item.key}
                onClick={() => {
                  setDesignerEdges((prev) =>
                    prev.map((edge) => (edge.id === activeEdgeMenu.id ? { ...edge, type: item.key as PreviewEdgeType } : edge)),
                  );
                  setEdgeMenu(null);
                }}
                className="mb-1 flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-[#F7FBFF]"
              >
                <div className="h-[3px] w-5 rounded-sm" style={{ backgroundColor: item.color }} />
                <div>
                  <div className="text-[12px] font-semibold text-slate-900">{item.label}</div>
                  <div className="text-[10px] text-slate-500">{item.desc}</div>
                </div>
              </div>
            ))}
            <div className="mt-1 border-t border-slate-100 pt-1">
              <div
                onClick={() => {
                  setDesignerEdges((prev) => prev.filter((edge) => edge.id !== activeEdgeMenu.id));
                  setEdgeMenu(null);
                }}
                className="cursor-pointer rounded-md px-2 py-2 text-[12px] text-[#A32D2D] hover:bg-[#FFF4F4]"
              >
                連線を削除
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden p-6">
      <section className="mb-4 rounded-[28px] border border-slate-200/80 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.08)]">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 px-6 py-5">
          <div className="flex min-w-0 items-center gap-3">
            <div
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold"
              style={{ backgroundColor: shipperTone.bg, color: shipperTone.text }}
            >
              {getShipperInitials(workflowShipper?.name ?? "")}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-[#E6F1FB] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#185FA5]">
                  Designer
                </span>
                <span className="text-[12px] text-slate-500">{site?.name ?? "拠点未選択"}</span>
              </div>
              <div className="mt-1 truncate text-[19px] font-semibold text-slate-900">{workflow.name}</div>
              <div className="mt-1 text-[12px] text-slate-500">
                {workflowShipper?.name ?? "荷主未設定"} ・ {workflow.steps.length} 業務 ・ 更新日 {formatUpdatedAt(workflow.updatedAt)}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outlined"
              startIcon={<ArrowLeft size={16} />}
              onClick={() => navigate(`/workflow-management?workflowId=${workflow.id}`)}
              sx={{ minHeight: 40, borderRadius: "12px", fontWeight: 700 }}
            >
              一覧へ戻る
            </Button>
            <Button
              variant="outlined"
              startIcon={<Sparkles size={16} />}
              onClick={autoLayout}
              sx={{ minHeight: 40, borderRadius: "12px", fontWeight: 700 }}
            >
              自動整列
            </Button>
          </div>
        </div>

        <div className="grid gap-3 px-6 py-4 md:grid-cols-3">
          {[
            { label: "ドラッグで追加", value: "工程ライブラリから画布へ" },
            { label: "ドラッグで配置", value: "ノードを掴んで自由に移動" },
            { label: "順序も調整", value: "左の工程順で並び替え" },
          ].map((item) => (
            <div key={item.label} className="rounded-2xl border border-slate-200 bg-[#FAFAF8] px-4 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{item.label}</div>
              <div className="mt-1 text-[13px] font-semibold text-slate-900">{item.value}</div>
            </div>
          ))}
        </div>
      </section>

      <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[280px_minmax(0,1fr)_340px]">
        <aside className="flex min-h-0 flex-col gap-4">
          <section className="flex min-h-0 flex-col rounded-[24px] border border-slate-200 bg-white shadow-[0_16px_40px_rgba(15,23,42,0.06)]">
            <div className="border-b border-slate-200 px-4 py-4">
              <div className="flex items-center gap-2 text-[13px] font-semibold text-slate-900">
                <LayoutGrid className="h-4 w-4 text-slate-500" />
                工程ライブラリ
              </div>
              <div className="mt-1 text-[11px] text-slate-500">工程をドラッグして画布へ追加できます</div>
            </div>

            <div className="border-b border-slate-200 px-4 py-3">
              <TextField
                size="small"
                label="工程検索"
                value={paletteKeyword}
                onChange={(event) => setPaletteKeyword(event.target.value)}
                placeholder="工程名で絞り込み"
                sx={fieldSx}
                fullWidth
              />
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
              <div className="space-y-2">
                {filteredProcesses.map((process) => (
                  <button
                    key={process.id}
                    type="button"
                    draggable
                    onDragStart={(event) => handlePaletteDragStart(event, process.id)}
                    onClick={() => addStepFromProcess(process.id)}
                    className="group flex w-full items-start justify-between rounded-2xl border border-slate-200 bg-[#FCFCFB] px-3 py-3 text-left transition hover:border-[#85B7EB] hover:bg-[#F7FBFF]"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <GripVertical className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:text-slate-400" />
                        <span className="truncate text-[13px] font-semibold text-slate-900">{process.name}</span>
                      </div>
                      <div className="mt-1 pl-6 text-[11px] leading-5 text-slate-500">
                        {process.description || "デフォルトの資格・スキル・人員設定で追加します。"}
                      </div>
                    </div>
                    <span className="ml-3 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#E6F1FB] text-[#185FA5]">
                      <Plus className="h-4 w-4" />
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="flex min-h-0 flex-col rounded-[24px] border border-slate-200 bg-white shadow-[0_16px_40px_rgba(15,23,42,0.06)]">
            <div className="border-b border-slate-200 px-4 py-4">
              <div className="flex items-center gap-2 text-[13px] font-semibold text-slate-900">
                <Workflow className="h-4 w-4 text-slate-500" />
                工程順
              </div>
              <div className="mt-1 text-[11px] text-slate-500">順番をドラッグすると連線順も更新されます</div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
              <div className="space-y-2">
                {workflow.steps.map((step, index) => {
                  const process = processMap.get(step.processId);
                  const isActive = step.id === selectedStep?.id;

                  return (
                    <button
                      key={step.id}
                      type="button"
                      draggable
                      onDragStart={() => setOrderDragStepId(step.id)}
                      onDragEnd={() => setOrderDragStepId("")}
                      onDragOver={(event) => {
                        if (!orderDragStepId) return;
                        event.preventDefault();
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        if (!orderDragStepId || orderDragStepId === step.id) return;
                        updateWorkflow((currentWorkflow) => ({
                          ...currentWorkflow,
                          steps: reorderSteps(currentWorkflow.steps, orderDragStepId, step.id),
                        }));
                        setOrderDragStepId("");
                      }}
                      onClick={() => setSelectedStepId(step.id)}
                      className={`flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left transition ${
                        isActive ? "border-[#85B7EB] bg-[#E6F1FB]" : "border-slate-200 bg-[#FCFCFB] hover:border-slate-300"
                      }`}
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-[11px] font-semibold text-slate-500">
                        {index + 1}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className={`truncate text-[13px] font-semibold ${isActive ? "text-[#0C447C]" : "text-slate-900"}`}>
                          {process?.name ?? "未設定工程"}
                        </div>
                        <div className="mt-1 text-[11px] text-slate-500">
                          {step.standardHeadcount} 名 ・ UPH {step.uph}
                        </div>
                      </div>
                      <GripVertical className="h-4 w-4 shrink-0 text-slate-300" />
                    </button>
                  );
                })}
              </div>
            </div>
          </section>
        </aside>

        <section className="min-h-0 rounded-[24px] border border-slate-200 bg-white shadow-[0_16px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
            <div>
              <div className="text-[14px] font-semibold text-slate-900">ドラッグ式業務設計</div>
              <div className="mt-1 text-[11px] text-slate-500">工程カードを掴んで配置し、順番変更は左パネルから行います</div>
            </div>
            <div className="rounded-full bg-[#F5F5F3] px-3 py-1.5 text-[11px] font-semibold text-slate-500">
              {canvasDragStepId ? "配置中..." : "変更は即時保存"}
            </div>
          </div>

          <div className="min-h-0 overflow-auto p-5">
            <div
              ref={canvasRef}
              className={`relative rounded-[24px] border border-dashed transition ${
                isCanvasDragOver ? "border-[#85B7EB] bg-[#F4F9FF]" : "border-slate-300 bg-[#FAFAF8]"
              }`}
              style={{ minHeight: canvasHeight }}
              onClick={(event) => {
                if (event.target === event.currentTarget) {
                  setSelectedStepId("");
                }
              }}
              onDragOver={(event) => {
                event.preventDefault();
                setIsCanvasDragOver(true);
              }}
              onDragLeave={(event) => {
                if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
                setIsCanvasDragOver(false);
              }}
              onDrop={handleCanvasDrop}
            >
              <div className="pointer-events-none absolute left-5 top-5 flex items-center gap-2 rounded-full bg-white/90 px-3 py-1.5 text-[11px] text-slate-500 shadow-sm">
                <MousePointer2 className="h-3.5 w-3.5" />
                工程ライブラリからここへドロップ
              </div>

              <svg className="pointer-events-none absolute inset-0 h-full w-full">
                <defs>
                  <marker
                    id="workflow-designer-arrow"
                    viewBox="0 0 10 10"
                    refX="8"
                    refY="5"
                    markerWidth="5"
                    markerHeight="5"
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

                {workflow.steps.slice(1).map((step, index) => {
                  const fromStep = workflow.steps[index];
                  const from = layout[fromStep.id] ?? getDefaultStepPosition(index);
                  const to = layout[step.id] ?? getDefaultStepPosition(index + 1);
                  const edgeType = resolveEdgeType(step);
                  const edgeColor =
                    edgeType === "split" ? "#BA7517"
                    : edgeType === "copy" ? "#534AB7"
                    : "#0F6E56";

                  return (
                    <path
                      key={`${fromStep.id}:${step.id}`}
                      d={buildEdgePath(from, to)}
                      fill="none"
                      stroke={edgeColor}
                      strokeWidth="1.6"
                      strokeDasharray={edgeType === "serial" ? "none" : "6 4"}
                      markerEnd="url(#workflow-designer-arrow)"
                    />
                  );
                })}
              </svg>

              {workflow.steps.map((step, index) => {
                const process = processMap.get(step.processId);
                const position = layout[step.id] ?? getDefaultStepPosition(index);
                const isActive = step.id === selectedStep?.id;
                const edgeType = resolveEdgeType(step);
                const palette =
                  edgeType === "split"
                    ? { bg: "#FAECE7", text: "#712B13", border: "#F0997B", chip: "#FFF5EF" }
                    : edgeType === "copy"
                      ? { bg: "#E8EEFF", text: "#314087", border: "#9BAAF5", chip: "#F4F6FF" }
                      : { bg: "#E1F5EE", text: "#085041", border: "#5DCAA5", chip: "#EFFBF6" };

                return (
                  <button
                    key={step.id}
                    type="button"
                    className={`absolute overflow-hidden rounded-[20px] border text-left shadow-[0_18px_35px_rgba(15,23,42,0.08)] transition ${
                      isActive ? "ring-2 ring-[#85B7EB]" : ""
                    } ${canvasDragStepId === step.id ? "cursor-grabbing" : "cursor-grab"}`}
                    style={{
                      left: position.x,
                      top: position.y,
                      width: NODE_WIDTH,
                      minHeight: NODE_HEIGHT,
                      backgroundColor: palette.bg,
                      borderColor: palette.border,
                    }}
                    onPointerDown={(event) => beginCanvasDrag(event, step.id)}
                    onClick={(event) => {
                      event.stopPropagation();
                      setSelectedStepId(step.id);
                    }}
                  >
                    <div className="flex items-center justify-between border-b border-black/5 px-3 py-2">
                      <span className="rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                        STEP {index + 1}
                      </span>
                      <GripVertical className="h-4 w-4 text-black/30" />
                    </div>
                    <div className="px-3 py-3">
                      <div className="text-[13px] font-semibold" style={{ color: palette.text }}>
                        {process?.name ?? "未設定工程"}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
                        <span className="rounded-full px-2 py-0.5 text-slate-500" style={{ backgroundColor: palette.chip }}>
                          {step.standardHeadcount} 名
                        </span>
                        <span className="rounded-full px-2 py-0.5 text-slate-500" style={{ backgroundColor: palette.chip }}>
                          UPH {step.uph}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        <aside className="flex min-h-0 flex-col rounded-[24px] border border-slate-200 bg-white shadow-[0_16px_40px_rgba(15,23,42,0.06)]">
          <div className="border-b border-slate-200 px-5 py-4">
            <div className="text-[14px] font-semibold text-slate-900">工程設定</div>
            <div className="mt-1 text-[11px] text-slate-500">選択中の工程の内容を編集します</div>
          </div>

          {!selectedStep ? (
            <div className="flex flex-1 items-center justify-center px-6 text-center">
              <div>
                <div className="text-[14px] font-semibold text-slate-900">工程を選択してください</div>
                <div className="mt-2 text-[12px] leading-6 text-slate-500">
                  画布上のカードか左側の工程順リストをクリックすると詳細を編集できます。
                </div>
              </div>
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
              <div className="space-y-4">
                <div className="rounded-2xl border border-slate-200 bg-[#FAFAF8] px-4 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                        Selected Step
                      </div>
                      <div className="mt-1 text-[15px] font-semibold text-slate-900">
                        {processMap.get(selectedStep.processId)?.name ?? "未設定工程"}
                      </div>
                    </div>
                    <Button
                      color="error"
                      variant="outlined"
                      startIcon={<Trash2 size={15} />}
                      onClick={() => removeStep(selectedStep.id)}
                      sx={{ borderRadius: "12px", fontWeight: 700 }}
                    >
                      削除
                    </Button>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <Button
                      variant="outlined"
                      onClick={() => moveStepToTop(selectedStep.id)}
                      sx={{ borderRadius: "12px", fontWeight: 700 }}
                    >
                      先頭へ
                    </Button>
                    <Button
                      variant="outlined"
                      onClick={() => moveStepToBottom(selectedStep.id)}
                      sx={{ borderRadius: "12px", fontWeight: 700 }}
                    >
                      末尾へ
                    </Button>
                  </div>
                </div>

                <TextField
                  select
                  size="small"
                  label="工程"
                  value={selectedStep.processId}
                  onChange={(event) =>
                    updateStep(selectedStep.id, (currentStep) => {
                      const nextProcess = processMap.get(event.target.value);
                      return {
                        ...currentStep,
                        processId: event.target.value,
                        requiredQualificationIds: nextProcess?.defaultQualificationIds ?? currentStep.requiredQualificationIds,
                        requiredSkillIds: nextProcess?.defaultSkillIds ?? currentStep.requiredSkillIds,
                        standardHeadcount: nextProcess?.defaultHeadcount ?? currentStep.standardHeadcount,
                        uph: nextProcess?.defaultUph ?? currentStep.uph,
                      };
                    })
                  }
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
                  options={siteLayoutAreas}
                  value={siteLayoutAreas.filter((area) => (selectedStep.layoutAreaIds ?? []).includes(area.id))}
                  isOptionEqualToValue={(option, value) => option.id === value.id}
                  getOptionLabel={(option) => option.name}
                  onChange={(_, values) =>
                    updateStep(selectedStep.id, (currentStep) => ({
                      ...currentStep,
                      layoutAreaIds: values.map((value) => value.id),
                    }))
                  }
                  disabled={siteLayoutAreas.length === 0}
                  renderTags={(value, getTagProps) =>
                    value.map((option, index) => (
                      <Chip {...getTagProps({ index })} key={option.id} label={option.name} size="small" />
                    ))
                  }
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="作業区域"
                      placeholder={siteLayoutAreas.length > 0 ? "区域を選択" : "区域未登録"}
                      helperText={
                        siteLayoutAreas.length > 0
                          ? "工程を実施する区域を複数選択できます"
                          : "拠点詳細で区域を登録すると選択できます"
                      }
                      sx={fieldSx}
                      fullWidth
                    />
                  )}
                />

                <div className="grid gap-3 sm:grid-cols-2">
                  <TextField
                    size="small"
                    label="標準人数"
                    type="number"
                    value={selectedStep.standardHeadcount}
                    onChange={(event) =>
                      updateStep(selectedStep.id, (currentStep) => ({
                        ...currentStep,
                        standardHeadcount: Math.max(1, Number(event.target.value) || 1),
                      }))
                    }
                    sx={fieldSx}
                  />
                  <TextField
                    size="small"
                    label="UPH"
                    type="number"
                    value={selectedStep.uph}
                    onChange={(event) =>
                      updateStep(selectedStep.id, (currentStep) => ({
                        ...currentStep,
                        uph: Math.max(0, Number(event.target.value) || 0),
                      }))
                    }
                    sx={fieldSx}
                  />
                </div>

                <TagSelector
                  label="必要資格"
                  placeholder="資格を選択"
                  options={qualifications}
                  selectedIds={selectedStep.requiredQualificationIds}
                  onChange={(ids) =>
                    updateStep(selectedStep.id, (currentStep) => ({
                      ...currentStep,
                      requiredQualificationIds: ids,
                    }))
                  }
                  fallbackIconKey={DEFAULT_QUALIFICATION_ICON_KEY}
                  tone="qualification"
                />

                <TagSelector
                  label="必要スキル"
                  placeholder="スキルを選択"
                  options={skills}
                  selectedIds={selectedStep.requiredSkillIds}
                  onChange={(ids) =>
                    updateStep(selectedStep.id, (currentStep) => ({
                      ...currentStep,
                      requiredSkillIds: ids,
                    }))
                  }
                  fallbackIconKey={DEFAULT_SKILL_ICON_KEY}
                  tone="skill"
                />

                <TextField
                  label="マニュアル"
                  value={selectedStep.manual ?? ""}
                  onChange={(event) =>
                    updateStep(selectedStep.id, (currentStep) => ({
                      ...currentStep,
                      manual: event.target.value,
                    }))
                  }
                  placeholder="作業メモや分岐条件を入力"
                  multiline
                  minRows={4}
                  sx={fieldSx}
                  fullWidth
                />

                <TextField
                  label="注意事項"
                  value={selectedStep.caution ?? ""}
                  onChange={(event) =>
                    updateStep(selectedStep.id, (currentStep) => ({
                      ...currentStep,
                      caution: event.target.value,
                    }))
                  }
                  placeholder="例外対応や注意ポイントを入力"
                  multiline
                  minRows={4}
                  sx={fieldSx}
                  fullWidth
                />
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
