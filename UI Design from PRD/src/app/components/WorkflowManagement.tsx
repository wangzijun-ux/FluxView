import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ClipboardList,
  Plus,
  Search,
  Trash2,
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
  IconButton,
  InputAdornment,
  MenuItem,
  TextField,
  useTheme,
} from "@mui/material";
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

const makeId = (prefix: string) => `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
const byUpdatedAtDesc = (a: WorkflowDefinition, b: WorkflowDefinition) =>
  new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();

function buildStepFromProcess(process: ProcessMaster): WorkflowStepSetting {
  return {
    id: makeId("step"),
    processId: process.id,
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
  return date.toLocaleString("ja-JP", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
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
            "& .MuiInputLabel-root": {
              fontSize: 13,
            },
            "& .MuiOutlinedInput-root": {
              minHeight: 40,
              borderRadius: "10px",
              fontSize: 13,
              bgcolor:
                theme.palette.mode === "dark"
                  ? "rgba(26, 26, 46, 0.84)"
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

export function WorkflowManagement() {
  const theme = useTheme();
  const c = useThemeColors();
  const {
    shippers,
    sites,
    qualifications,
    skills,
    processes,
    workflows,
    setWorkflows,
    selectedSiteId,
  } = useMasterData();

  const [selectedWorkflowId, setSelectedWorkflowId] = useState("");
  const [keyword, setKeyword] = useState("");
  const [filterProcessId, setFilterProcessId] = useState("all");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newWorkflowShipperId, setNewWorkflowShipperId] = useState("");
  const [addStepDialogOpen, setAddStepDialogOpen] = useState(false);
  const [newStepProcessId, setNewStepProcessId] = useState("");

  const activeSite = useMemo(
    () => sites.find((site) => site.id === selectedSiteId) ?? null,
    [sites, selectedSiteId],
  );
  const activeShipper = useMemo(
    () => shippers.find((shipper) => shipper.id === activeSite?.shipperId) ?? null,
    [shippers, activeSite],
  );
  const activeWorkflowShippers = useMemo(
    () => shippers.filter((shipper) => shipper.status === "active"),
    [shippers],
  );
  const processMap = useMemo(() => new Map(processes.map((process) => [process.id, process])), [processes]);

  useEffect(() => {
    if (!newStepProcessId && processes.length > 0) {
      setNewStepProcessId(processes[0].id);
    }
  }, [newStepProcessId, processes]);

  useEffect(() => {
    if (!createDialogOpen) return;
    if (newWorkflowShipperId) return;
    setNewWorkflowShipperId(activeShipper?.id ?? activeWorkflowShippers[0]?.id ?? "");
  }, [createDialogOpen, newWorkflowShipperId, activeShipper, activeWorkflowShippers]);

  const siteWorkflows = useMemo(
    () => workflows.filter((workflow) => workflow.siteId === selectedSiteId).sort(byUpdatedAtDesc),
    [workflows, selectedSiteId],
  );

  const filteredWorkflows = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    return siteWorkflows.filter((workflow) => {
      if (filterProcessId !== "all" && !workflow.steps.some((step) => step.processId === filterProcessId)) {
        return false;
      }

      if (!normalizedKeyword) return true;

      const bag = [
        workflow.name,
        ...workflow.steps.map((step) => processMap.get(step.processId)?.name ?? ""),
        ...workflow.steps.map((step) => step.manual ?? ""),
        ...workflow.steps.map((step) => step.caution ?? ""),
      ]
        .join(" ")
        .toLowerCase();

      return bag.includes(normalizedKeyword);
    });
  }, [siteWorkflows, filterProcessId, keyword, processMap]);

  useEffect(() => {
    if (filteredWorkflows.length === 0) {
      setSelectedWorkflowId("");
      return;
    }

    if (!filteredWorkflows.some((workflow) => workflow.id === selectedWorkflowId)) {
      setSelectedWorkflowId(filteredWorkflows[0].id);
    }
  }, [filteredWorkflows, selectedWorkflowId]);

  const selectedWorkflow = useMemo(
    () => workflows.find((workflow) => workflow.id === selectedWorkflowId) ?? null,
    [workflows, selectedWorkflowId],
  );
  const selectedWorkflowShipper = useMemo(
    () => shippers.find((shipper) => shipper.id === selectedWorkflow?.shipperId) ?? null,
    [shippers, selectedWorkflow],
  );

  const updateWorkflow = (workflowId: string, mutate: (workflow: WorkflowDefinition) => WorkflowDefinition) => {
    setWorkflows((prev) =>
      prev.map((workflow) =>
        workflow.id === workflowId ? { ...mutate(workflow), updatedAt: new Date().toISOString() } : workflow,
      ),
    );
  };

  const createWorkflow = () => {
    if (!activeSite || !newWorkflowShipperId) return;

    const nextIndex = siteWorkflows.length + 1;
    const workflowName = newName.trim() || `${activeSite.name}_業務${String(nextIndex).padStart(2, "0")}`;
    const firstProcess = processes[0];

    const nextWorkflow: WorkflowDefinition = {
      id: makeId("workflow"),
      name: workflowName,
      shipperId: newWorkflowShipperId,
      siteId: activeSite.id,
      updatedAt: new Date().toISOString(),
      steps: firstProcess ? [buildStepFromProcess(firstProcess)] : [],
    };

    setWorkflows((prev) => [nextWorkflow, ...prev]);
    setSelectedWorkflowId(nextWorkflow.id);
    setCreateDialogOpen(false);
    setNewName("");
    setNewWorkflowShipperId(activeShipper?.id ?? activeWorkflowShippers[0]?.id ?? "");
  };

  const deleteWorkflow = (workflowId: string) => {
    setWorkflows((prev) => prev.filter((workflow) => workflow.id !== workflowId));
  };

  const addStep = () => {
    if (!selectedWorkflow || !newStepProcessId) return;
    const process = processMap.get(newStepProcessId);
    if (!process) return;

    updateWorkflow(selectedWorkflow.id, (workflow) => ({
      ...workflow,
      steps: [...workflow.steps, buildStepFromProcess(process)],
    }));

    setAddStepDialogOpen(false);
  };

  const updateStep = (stepId: string, mutate: (step: WorkflowStepSetting) => WorkflowStepSetting) => {
    if (!selectedWorkflow) return;
    updateWorkflow(selectedWorkflow.id, (workflow) => ({
      ...workflow,
      steps: workflow.steps.map((step) => (step.id === stepId ? mutate(step) : step)),
    }));
  };

  const removeStep = (stepId: string) => {
    if (!selectedWorkflow) return;
    updateWorkflow(selectedWorkflow.id, (workflow) => ({
      ...workflow,
      steps: workflow.steps.filter((step) => step.id !== stepId),
    }));
  };

  const moveStep = (stepId: string, direction: "up" | "down") => {
    if (!selectedWorkflow) return;
    updateWorkflow(selectedWorkflow.id, (workflow) => {
      const nextSteps = [...workflow.steps];
      const index = nextSteps.findIndex((step) => step.id === stepId);
      if (index < 0) return workflow;

      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= nextSteps.length) return workflow;

      [nextSteps[index], nextSteps[targetIndex]] = [nextSteps[targetIndex], nextSteps[index]];
      return { ...workflow, steps: nextSteps };
    });
  };

  const fieldSx = {
    "& .MuiInputLabel-root": {
      fontSize: 13,
    },
    "& .MuiOutlinedInput-root": {
      borderRadius: "10px",
      fontSize: 13,
      bgcolor:
        theme.palette.mode === "dark"
          ? "rgba(26, 26, 46, 0.84)"
          : alpha(theme.palette.background.paper, 0.96),
    },
  } as const;
  const containedButtonSx = {
    minHeight: 40,
    borderRadius: "12px",
    px: 2.5,
    fontWeight: 700,
    boxShadow: "none",
  } as const;
  const outlinedButtonSx = {
    minHeight: 40,
    borderRadius: "12px",
    fontWeight: 700,
    borderColor: alpha(theme.palette.divider, 0.9),
  } as const;
  const dangerButtonSx = {
    ...outlinedButtonSx,
    borderColor: alpha(theme.palette.error.main, 0.28),
  } as const;
  const iconButtonSx = {
    border: `1px solid ${alpha(theme.palette.divider, 0.9)}`,
    borderRadius: "12px",
    bgcolor: theme.palette.mode === "dark" ? alpha(theme.palette.background.default, 0.18) : alpha(theme.palette.background.paper, 0.92),
  } as const;
  const deleteIconButtonSx = {
    border: `1px solid ${alpha(theme.palette.error.main, 0.28)}`,
    borderRadius: "12px",
    bgcolor: theme.palette.mode === "dark" ? alpha(theme.palette.error.main, 0.08) : alpha(theme.palette.error.main, 0.04),
  } as const;
  const dialogPaperSx = {
    borderRadius: "24px",
    border: `1px solid ${alpha(theme.palette.divider, 0.9)}`,
    bgcolor: alpha(theme.palette.background.paper, theme.palette.mode === "dark" ? 0.98 : 1),
    backgroundImage: "none",
    boxShadow: theme.palette.mode === "dark"
      ? "0 24px 60px rgba(2, 6, 23, 0.42)"
      : "0 24px 60px rgba(15, 23, 42, 0.14)",
  } as const;
  const cardClass = `${c.bgCard} border ${c.border} rounded-2xl`;
  const surfaceClass = `${c.bgSurface} border ${c.borderCard} rounded-2xl`;
  const statChipClass = `rounded-full px-3 py-1 text-xs ${c.bgSurface} ${c.textSecondary}`;

  if (!activeSite || !activeShipper) {
    return (
      <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden p-6">
        <section className={`${cardClass} flex flex-1 items-center justify-center p-10`}>
          <div className="max-w-[480px] text-center">
            <div className={`mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border ${c.borderCard} ${c.bgSurface}`}>
              <ClipboardList className={`h-7 w-7 ${c.textSecondary}`} />
            </div>
            <div className={`mt-4 text-lg font-semibold ${c.textPrimary}`}>拠点を選択してください</div>
            <div className={`mt-2 text-sm leading-6 ${c.textSecondary}`}>
              上部メニューで拠点を選ぶと、この画面でその拠点の業務だけを編集できます。
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden p-6">
      <section className={`${cardClass} shrink-0`}>
        <div className={`flex flex-col gap-4 border-b px-5 py-4 ${c.border}`}>
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className={`text-lg font-semibold ${c.textPrimary}`}>業務管理</div>
              <div className={`text-sm ${c.textSecondary}`}>
                拠点は上部メニューの選択内容に固定されます。ここでは業務名と工程設定に集中できます。
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className={statChipClass}>拠点: {activeSite.name}</span>
              <span className={statChipClass}>荷主: {activeShipper.name}</span>
              <span className={statChipClass}>業務数: {siteWorkflows.length} 件</span>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-[minmax(0,1.2fr)_220px_auto]">
            <TextField
              size="small"
              label="検索"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="業務名 / 工程 / マニュアル / 注意事項"
              sx={fieldSx}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Search size={16} />
                  </InputAdornment>
                ),
              }}
            />
            <TextField
              select
              size="small"
              label="工程"
              value={filterProcessId}
              onChange={(event) => setFilterProcessId(event.target.value)}
              sx={fieldSx}
            >
              <MenuItem value="all">すべて</MenuItem>
              {processes.map((process) => (
                <MenuItem key={process.id} value={process.id}>
                  {process.name}
                </MenuItem>
              ))}
            </TextField>
            <Button
              variant="contained"
              startIcon={<Plus size={16} />}
              onClick={() => setCreateDialogOpen(true)}
              sx={containedButtonSx}
            >
              新規業務
            </Button>
          </div>
        </div>
      </section>

      <div className="grid min-h-0 flex-1 gap-4 overflow-hidden xl:grid-cols-[320px_minmax(0,1fr)]">
        <section className={`${cardClass} flex min-h-0 flex-col overflow-hidden`}>
          <div className={`border-b px-5 py-4 ${c.border}`}>
            <div className={`text-[15px] font-semibold ${c.textPrimary}`}>業務一覧</div>
            <div className={`mt-1 text-[12px] ${c.textSecondary}`}>{filteredWorkflows.length} 件を表示中</div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            <div className="grid gap-2">
              {filteredWorkflows.map((workflow) => {
                const active = workflow.id === selectedWorkflowId;
                return (
                  <button
                    key={workflow.id}
                    type="button"
                    onClick={() => setSelectedWorkflowId(workflow.id)}
                    aria-pressed={active}
                    className={[
                      "w-full rounded-2xl border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60",
                      active
                        ? "border-cyan-500/40 bg-cyan-500/10"
                        : `${c.borderCard} ${c.bgSurface} ${c.bgCardHover}`,
                    ].join(" ")}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className={`min-w-0 truncate text-sm font-semibold ${c.textPrimary}`}>{workflow.name}</div>
                      <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-medium ${active ? "bg-cyan-500 text-white" : `${c.bgCard} ${c.textSecondary}`}`}>
                        {workflow.steps.length}工程
                      </span>
                    </div>
                    <div className={`mt-2 text-[11px] ${c.textMuted}`}>更新 {formatUpdatedAt(workflow.updatedAt)}</div>
                  </button>
                );
              })}

              {filteredWorkflows.length === 0 && (
                <div className="px-4 py-10 text-center">
                  <div className={`text-sm ${c.textSecondary}`}>条件に一致する業務がありません</div>
                </div>
              )}
            </div>
          </div>
        </section>

        <section className={`${cardClass} flex min-h-0 flex-col overflow-hidden`}>
          {!selectedWorkflow ? (
            <div className="flex flex-1 items-center justify-center px-6">
              <div className="max-w-[420px] text-center">
                <div className={`mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border ${c.borderCard} ${c.bgSurface}`}>
                  <ClipboardList className={`h-7 w-7 ${c.textSecondary}`} />
                </div>
                <div className={`mt-4 text-lg font-semibold ${c.textPrimary}`}>業務を選択してください</div>
                <div className={`mt-2 text-sm leading-6 ${c.textSecondary}`}>
                  左側の一覧から業務を選ぶと、工程順、必要資格、必要スキル、マニュアル、注意事項を編集できます。
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className={`border-b px-5 py-4 ${c.border}`}>
                <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                  <div>
                    <div className={`text-lg font-semibold ${c.textPrimary}`}>{selectedWorkflow.name}</div>
                    <div className={`mt-1 text-sm ${c.textSecondary}`}>{selectedWorkflowShipper?.name ?? "未設定荷主"}</div>
                    <div className={`mt-2 text-[11px] ${c.textMuted}`}>更新 {formatUpdatedAt(selectedWorkflow.updatedAt)}</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outlined"
                      startIcon={<Plus size={16} />}
                      onClick={() => setAddStepDialogOpen(true)}
                      sx={outlinedButtonSx}
                    >
                      工程追加
                    </Button>
                    <Button
                      color="error"
                      variant="outlined"
                      startIcon={<Trash2 size={16} />}
                      onClick={() => deleteWorkflow(selectedWorkflow.id)}
                      sx={dangerButtonSx}
                    >
                      業務削除
                    </Button>
                  </div>
                </div>
              </div>

              <div className={`border-b px-5 py-4 ${c.border}`}>
                <TextField
                  size="small"
                  label="業務名"
                  value={selectedWorkflow.name}
                  onChange={(event) =>
                    updateWorkflow(selectedWorkflow.id, (workflow) => ({
                      ...workflow,
                      name: event.target.value,
                    }))
                  }
                  sx={{ ...fieldSx, maxWidth: 560 }}
                  fullWidth
                />
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-5">
                <div className="grid gap-4">
                  {selectedWorkflow.steps.map((step, index) => {
                    const process = processMap.get(step.processId);
                    return (
                      <section key={step.id} className={`${surfaceClass} overflow-hidden`}>
                        <div className={`flex flex-col gap-3 border-b px-4 py-4 ${c.borderCard} lg:flex-row lg:items-center lg:justify-between`}>
                          <div className="flex items-center gap-3">
                            <span className="rounded-full bg-cyan-500 px-2.5 py-1 text-[10px] font-semibold text-white">
                              工程 {index + 1}
                            </span>
                            <div>
                              <div className={`text-sm font-semibold ${c.textPrimary}`}>{process?.name ?? "未設定工程"}</div>
                              <div className={`text-[11px] ${c.textMuted}`}>順番変更や削除もこのカードから操作できます</div>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            <IconButton
                              size="small"
                              onClick={() => moveStep(step.id, "up")}
                              disabled={index === 0}
                              sx={iconButtonSx}
                              aria-label={`工程 ${index + 1} を上へ移動`}
                            >
                              <ArrowUp size={16} />
                            </IconButton>
                            <IconButton
                              size="small"
                              onClick={() => moveStep(step.id, "down")}
                              disabled={index === selectedWorkflow.steps.length - 1}
                              sx={iconButtonSx}
                              aria-label={`工程 ${index + 1} を下へ移動`}
                            >
                              <ArrowDown size={16} />
                            </IconButton>
                            <IconButton
                              size="small"
                              color="error"
                              onClick={() => removeStep(step.id)}
                              sx={deleteIconButtonSx}
                              aria-label={`工程 ${index + 1} を削除`}
                            >
                              <Trash2 size={16} />
                            </IconButton>
                          </div>
                        </div>

                        <div className="grid gap-4 p-4 xl:grid-cols-2">
                          <div className="grid gap-3">
                            <TextField
                              select
                              size="small"
                              label="工程"
                              value={step.processId}
                              onChange={(event) =>
                                updateStep(step.id, (currentStep) => {
                                  const nextProcess = processMap.get(event.target.value);
                                  return {
                                    ...currentStep,
                                    processId: event.target.value,
                                    requiredQualificationIds:
                                      nextProcess?.defaultQualificationIds ?? currentStep.requiredQualificationIds,
                                    requiredSkillIds:
                                      nextProcess?.defaultSkillIds ?? currentStep.requiredSkillIds,
                                    standardHeadcount:
                                      nextProcess?.defaultHeadcount ?? currentStep.standardHeadcount,
                                    uph: nextProcess?.defaultUph ?? currentStep.uph,
                                  };
                                })
                              }
                              sx={fieldSx}
                            >
                              {processes.map((processOption) => (
                                <MenuItem key={processOption.id} value={processOption.id}>
                                  {processOption.name}
                                </MenuItem>
                              ))}
                            </TextField>

                            <div className="grid gap-3 sm:grid-cols-2">
                              <TextField
                                size="small"
                                label="標準人数"
                                type="number"
                                value={step.standardHeadcount}
                                onChange={(event) =>
                                  updateStep(step.id, (currentStep) => ({
                                    ...currentStep,
                                    standardHeadcount: Math.max(1, Number(event.target.value) || 1),
                                  }))
                                }
                                sx={fieldSx}
                              />
                              <TextField
                                size="small"
                                label="標準UPH"
                                type="number"
                                value={step.uph}
                                onChange={(event) =>
                                  updateStep(step.id, (currentStep) => ({
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
                              selectedIds={step.requiredQualificationIds}
                              onChange={(ids) =>
                                updateStep(step.id, (currentStep) => ({
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
                              selectedIds={step.requiredSkillIds}
                              onChange={(ids) =>
                                updateStep(step.id, (currentStep) => ({
                                  ...currentStep,
                                  requiredSkillIds: ids,
                                }))
                              }
                              fallbackIconKey={DEFAULT_SKILL_ICON_KEY}
                              tone="skill"
                            />
                          </div>

                          <div className="grid gap-3">
                            <TextField
                              label="マニュアル"
                              value={step.manual ?? ""}
                              onChange={(event) =>
                                updateStep(step.id, (currentStep) => ({
                                  ...currentStep,
                                  manual: event.target.value,
                                }))
                              }
                              placeholder="工程の手順、参照先、操作ルールを記載"
                              multiline
                              minRows={4}
                              sx={fieldSx}
                            />

                            <TextField
                              label="注意事項"
                              value={step.caution ?? ""}
                              onChange={(event) =>
                                updateStep(step.id, (currentStep) => ({
                                  ...currentStep,
                                  caution: event.target.value,
                                }))
                              }
                              placeholder="安全面、品質面、引継ぎ時の注意点を記載"
                              multiline
                              minRows={4}
                              sx={fieldSx}
                            />
                          </div>
                        </div>
                      </section>
                    );
                  })}

                  {selectedWorkflow.steps.length === 0 && (
                    <section className={`${surfaceClass} p-10 text-center`}>
                      <div className={`text-sm ${c.textSecondary}`}>工程がありません。工程追加から開始してください。</div>
                    </section>
                  )}
                </div>
              </div>
            </>
          )}
        </section>
      </div>

      <Dialog
        open={createDialogOpen}
        onClose={() => {
          setCreateDialogOpen(false);
          setNewWorkflowShipperId(activeShipper?.id ?? activeWorkflowShippers[0]?.id ?? "");
        }}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: dialogPaperSx }}
      >
        <DialogTitle sx={{ px: 3, py: 2.5, fontWeight: 700 }}>新規業務を作成</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 1.5, px: 3, pt: "8px !important" }}>
          <TextField
            select
            size="small"
            label="荷主"
            value={newWorkflowShipperId}
            onChange={(event) => setNewWorkflowShipperId(event.target.value)}
            sx={fieldSx}
          >
            {activeWorkflowShippers.map((shipper) => (
              <MenuItem key={shipper.id} value={shipper.id}>
                {shipper.name}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            size="small"
            label="業務名"
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder={`${activeSite.name}_業務01`}
            sx={fieldSx}
          />
          <div className={`text-[12px] ${c.textSecondary}`}>
            拠点は上部メニューの選択内容が自動で反映されます。ここでは再選択は不要です。
          </div>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button
            onClick={() => {
              setCreateDialogOpen(false);
              setNewWorkflowShipperId(activeShipper?.id ?? activeWorkflowShippers[0]?.id ?? "");
            }}
          >
            キャンセル
          </Button>
          <Button variant="contained" onClick={createWorkflow} sx={containedButtonSx}>
            作成
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={addStepDialogOpen}
        onClose={() => setAddStepDialogOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: dialogPaperSx }}
      >
        <DialogTitle sx={{ px: 3, py: 2.5, fontWeight: 700 }}>工程を追加</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 1.5, px: 3, pt: "8px !important" }}>
          <TextField
            select
            size="small"
            label="工程"
            value={newStepProcessId}
            onChange={(event) => setNewStepProcessId(event.target.value)}
            sx={fieldSx}
          >
            {processes.map((process) => (
              <MenuItem key={process.id} value={process.id}>
                {process.name}
              </MenuItem>
            ))}
          </TextField>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setAddStepDialogOpen(false)}>キャンセル</Button>
          <Button variant="contained" onClick={addStep} sx={containedButtonSx}>
            追加
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}
