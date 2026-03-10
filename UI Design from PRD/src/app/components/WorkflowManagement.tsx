import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Filter,
  Plus,
  Route,
  Save,
  Search,
  Trash2,
} from "lucide-react";
import {
  alpha,
  Autocomplete,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  InputAdornment,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
  useTheme,
} from "@mui/material";
import { useMasterData } from "./MasterDataContext";
import type { AreaMaster, ProcessMaster, WorkflowDefinition, WorkflowStepSetting } from "./masterStore";

const makeId = (prefix: string) => `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
const byUpdatedAtDesc = (a: WorkflowDefinition, b: WorkflowDefinition) =>
  new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
const VIRTUAL_AREA_PREFIX = "virtual-area:";

function buildStepFromProcess(process: ProcessMaster): WorkflowStepSetting {
  return {
    id: makeId("step"),
    processId: process.id,
    requiredQualificationIds: process.defaultQualificationIds,
    requiredSkillIds: process.defaultSkillIds,
    standardHeadcount: process.defaultHeadcount,
    uph: process.defaultUph,
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
}: {
  label: string;
  placeholder: string;
  options: Array<{ id: string; name: string }>;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const theme = useTheme();
  const selectedOptions = options.filter((option) => selectedIds.includes(option.id));
  const selectorBorderColor =
    theme.palette.mode === "dark" ? "rgba(42, 42, 62, 1)" : "rgba(229, 231, 235, 1)";
  const selectorFieldSx = {
    "& .MuiInputLabel-root": {
      fontSize: 13,
    },
    "& .MuiOutlinedInput-root": {
      minHeight: 40,
      alignItems: "flex-start",
      borderRadius: "10px",
      fontSize: 13,
      bgcolor:
        theme.palette.mode === "dark"
          ? "rgba(26, 26, 46, 0.84)"
          : alpha(theme.palette.background.paper, 0.96),
      "& fieldset": {
        borderColor: selectorBorderColor,
      },
      "&:hover fieldset": {
        borderColor:
          theme.palette.mode === "dark" ? "rgba(56, 189, 248, 0.36)" : "rgba(37, 99, 235, 0.28)",
      },
      "&.Mui-focused fieldset": {
        borderColor:
          theme.palette.mode === "dark" ? "rgba(56, 189, 248, 0.58)" : "rgba(37, 99, 235, 0.54)",
      },
    },
  } as const;

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
      renderInput={(params) => <TextField {...params} label={label} placeholder={placeholder} sx={selectorFieldSx} />}
      renderTags={(value, getTagProps) =>
        value.map((option, index) => (
          <Chip {...getTagProps({ index })} key={option.id} label={option.name} size="small" />
        ))
      }
    />
  );
}

export function WorkflowManagement() {
  const theme = useTheme();
  const { shippers, sites, areas, setAreas, qualifications, skills, processes, workflows, setWorkflows } =
    useMasterData();

  const [selectedWorkflowId, setSelectedWorkflowId] = useState("");

  const [filterShipperId, setFilterShipperId] = useState("all");
  const [filterSiteId, setFilterSiteId] = useState("all");
  const [filterAreaId, setFilterAreaId] = useState("all");
  const [filterProcessId, setFilterProcessId] = useState("all");
  const [filterKeyword, setFilterKeyword] = useState("");

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newShipperId, setNewShipperId] = useState("");
  const [newSiteId, setNewSiteId] = useState("");
  const [newAreaId, setNewAreaId] = useState("");

  const [addStepDialogOpen, setAddStepDialogOpen] = useState(false);
  const [newStepProcessId, setNewStepProcessId] = useState("");

  useEffect(() => {
    if (!newShipperId && shippers.length > 0) setNewShipperId(shippers[0].id);
  }, [newShipperId, shippers]);

  useEffect(() => {
    const availableSites = sites.filter((site) => site.shipperId === newShipperId);
    if (availableSites.length === 0) {
      setNewSiteId("");
      return;
    }
    if (!availableSites.some((site) => site.id === newSiteId)) {
      setNewSiteId(availableSites[0].id);
    }
  }, [newShipperId, newSiteId, sites]);

  useEffect(() => {
    if (!newStepProcessId && processes.length > 0) {
      setNewStepProcessId(processes[0].id);
    }
  }, [newStepProcessId, processes]);

  const shipperMap = useMemo(() => new Map(shippers.map((item) => [item.id, item])), [shippers]);
  const siteMap = useMemo(() => new Map(sites.map((item) => [item.id, item])), [sites]);
  const areaMap = useMemo(() => new Map(areas.map((item) => [item.id, item])), [areas]);
  const processMap = useMemo(() => new Map(processes.map((item) => [item.id, item])), [processes]);
  const createAreaOptions = useMemo(() => {
    const selectedSite = sites.find((site) => site.id === newSiteId);
    if (!selectedSite) return [] as Array<{ id: string; name: string; description: string }>;

    const sameNameSiteIds = sites
      .filter((site) => site.name === selectedSite.name)
      .map((site) => site.id);

    const optionMap = new Map<string, { id: string; name: string; description: string }>();
    areas
      .filter((area) => sameNameSiteIds.includes(area.siteId))
      .forEach((area) => {
        if (optionMap.has(area.name)) return;
        const sameSiteArea = areas.find(
          (candidate) => candidate.siteId === selectedSite.id && candidate.name === area.name,
        );

        optionMap.set(area.name, {
          id: sameSiteArea?.id ?? `${VIRTUAL_AREA_PREFIX}${area.name}`,
          name: area.name,
          description: sameSiteArea?.description ?? area.description,
        });
      });

    return Array.from(optionMap.values()).sort((a, b) =>
      a.name.localeCompare(b.name, "ja-JP", { numeric: true, sensitivity: "base" }),
    );
  }, [areas, newSiteId, sites]);

  useEffect(() => {
    if (createAreaOptions.length === 0) {
      setNewAreaId("");
      return;
    }
    if (!createAreaOptions.some((area) => area.id === newAreaId)) {
      setNewAreaId(createAreaOptions[0].id);
    }
  }, [createAreaOptions, newAreaId]);

  const filteredSites = useMemo(
    () => sites.filter((site) => filterShipperId === "all" || site.shipperId === filterShipperId),
    [sites, filterShipperId],
  );
  const filteredAreas = useMemo(
    () => areas.filter((area) => filterSiteId === "all" || area.siteId === filterSiteId),
    [areas, filterSiteId],
  );

  useEffect(() => {
    if (filterSiteId !== "all" && !filteredSites.some((site) => site.id === filterSiteId)) {
      setFilterSiteId("all");
    }
  }, [filterSiteId, filteredSites]);

  useEffect(() => {
    if (filterAreaId !== "all" && !filteredAreas.some((area) => area.id === filterAreaId)) {
      setFilterAreaId("all");
    }
  }, [filterAreaId, filteredAreas]);
  const filteredWorkflows = useMemo(
    () =>
      workflows
        .filter((workflow) => {
          if (filterShipperId !== "all" && workflow.shipperId !== filterShipperId) return false;
          if (filterSiteId !== "all" && workflow.siteId !== filterSiteId) return false;
          if (filterAreaId !== "all" && workflow.areaId !== filterAreaId) return false;
          if (filterProcessId !== "all" && !workflow.steps.some((step) => step.processId === filterProcessId)) {
            return false;
          }
          if (!filterKeyword.trim()) return true;

          const keyword = filterKeyword.trim().toLowerCase();
          const bag =
            `${workflow.name} ${shipperMap.get(workflow.shipperId)?.name ?? ""} ${
              siteMap.get(workflow.siteId)?.name ?? ""
            } ${areaMap.get(workflow.areaId)?.name ?? ""}`.toLowerCase();
          return bag.includes(keyword);
        })
        .sort(byUpdatedAtDesc),
    [
      workflows,
      filterShipperId,
      filterSiteId,
      filterAreaId,
      filterProcessId,
      filterKeyword,
      shipperMap,
      siteMap,
      areaMap,
    ],
  );

  useEffect(() => {
    if (filteredWorkflows.length > 0 && !filteredWorkflows.some((workflow) => workflow.id === selectedWorkflowId)) {
      setSelectedWorkflowId(filteredWorkflows[0].id);
    }
    if (filteredWorkflows.length === 0) {
      setSelectedWorkflowId("");
    }
  }, [filteredWorkflows, selectedWorkflowId]);

  const selectedWorkflow = workflows.find((workflow) => workflow.id === selectedWorkflowId);
  const selectedWorkflowSites = selectedWorkflow
    ? sites.filter((site) => site.shipperId === selectedWorkflow.shipperId)
    : [];
  const selectedWorkflowAreas = selectedWorkflow
    ? areas.filter((area) => area.siteId === selectedWorkflow.siteId)
    : [];

  const updateWorkflow = (workflowId: string, mutate: (workflow: WorkflowDefinition) => WorkflowDefinition) => {
    setWorkflows((prev) =>
      prev.map((workflow) =>
        workflow.id === workflowId ? { ...mutate(workflow), updatedAt: new Date().toISOString() } : workflow,
      ),
    );
  };

  const updateWorkflowMeta = (
    workflowId: string,
    field: "name" | "shipperId" | "siteId" | "areaId",
    value: string,
  ) => {
    updateWorkflow(workflowId, (workflow) => {
      if (field === "name") {
        return { ...workflow, name: value };
      }

      if (field === "shipperId") {
        const nextSites = sites.filter((site) => site.shipperId === value);
        const nextSiteId = nextSites.find((site) => site.id === workflow.siteId)?.id ?? nextSites[0]?.id ?? "";
        const nextAreas = areas.filter((area) => area.siteId === nextSiteId);
        const nextAreaId = nextAreas.find((area) => area.id === workflow.areaId)?.id ?? nextAreas[0]?.id ?? "";
        return { ...workflow, shipperId: value, siteId: nextSiteId, areaId: nextAreaId };
      }

      if (field === "siteId") {
        const nextAreas = areas.filter((area) => area.siteId === value);
        const nextAreaId = nextAreas.find((area) => area.id === workflow.areaId)?.id ?? nextAreas[0]?.id ?? "";
        return { ...workflow, siteId: value, areaId: nextAreaId };
      }

      return { ...workflow, areaId: value };
    });
  };

  const createWorkflow = () => {
    if (!newShipperId || !newSiteId || !newAreaId) return;

    let nextAreaId = newAreaId;
    if (newAreaId.startsWith(VIRTUAL_AREA_PREFIX)) {
      const nextAreaName = newAreaId.replace(VIRTUAL_AREA_PREFIX, "");
      const template = createAreaOptions.find((option) => option.id === newAreaId);
      const createdArea: AreaMaster = {
        id: makeId("area"),
        siteId: newSiteId,
        name: nextAreaName,
        description: template?.description ?? `${nextAreaName}作業`,
      };
      setAreas((prev) => [...prev, createdArea]);
      nextAreaId = createdArea.id;
    }

    const selectedAreaName =
      createAreaOptions.find((option) => option.id === newAreaId)?.name ?? areaMap.get(nextAreaId)?.name ?? "";
    const autoName = `${shipperMap.get(newShipperId)?.name ?? ""}_${siteMap.get(newSiteId)?.name ?? ""}_${
      selectedAreaName
    }`;
    const firstStepProcess = processes[0];
    const workflow: WorkflowDefinition = {
      id: makeId("workflow"),
      name: newName.trim() || autoName,
      shipperId: newShipperId,
      siteId: newSiteId,
      areaId: nextAreaId,
      steps: firstStepProcess ? [buildStepFromProcess(firstStepProcess)] : [],
      updatedAt: new Date().toISOString(),
    };

    setWorkflows((prev) => [workflow, ...prev]);
    setSelectedWorkflowId(workflow.id);
    setCreateDialogOpen(false);
    setNewName("");
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
      const target = direction === "up" ? index - 1 : index + 1;
      if (target < 0 || target >= nextSteps.length) return workflow;
      [nextSteps[index], nextSteps[target]] = [nextSteps[target], nextSteps[index]];
      return { ...workflow, steps: nextSteps };
    });
  };

  const borderColor = theme.palette.mode === "dark" ? "rgba(42, 42, 62, 1)" : "rgba(229, 231, 235, 1)";
  const headerBackground = alpha(
    theme.palette.background.default,
    theme.palette.mode === "dark" ? 0.32 : 0.72,
  );
  const fieldBackground =
    theme.palette.mode === "dark"
      ? "rgba(26, 26, 46, 0.84)"
      : alpha(theme.palette.background.paper, 0.96);
  const panelSx = {
    borderRadius: "16px",
    bgcolor: alpha(theme.palette.background.paper, theme.palette.mode === "dark" ? 0.92 : 0.98),
    border: `1px solid ${borderColor}`,
    boxShadow: "none",
  } as const;
  const childCardSx = {
    borderRadius: "14px",
    border: `1px solid ${borderColor}`,
    boxShadow: "none",
  } as const;
  const titleBarSx = {
    px: 2.25,
    py: 1.75,
    borderBottom: `1px solid ${borderColor}`,
    bgcolor: headerBackground,
  } as const;
  const dialogTitleSx = {
    ...titleBarSx,
    px: 2.5,
    py: 1.75,
  } as const;
  const dialogContentSx = {
    px: 2.5,
    pt: 2.25,
    pb: 2.5,
    display: "grid",
    gap: 1.5,
  } as const;
  const dialogActionsSx = {
    px: 2.5,
    py: 1.5,
    borderTop: `1px solid ${borderColor}`,
    bgcolor: alpha(theme.palette.background.default, theme.palette.mode === "dark" ? 0.18 : 0.4),
  } as const;
  const dialogFieldGroupSx = {
    display: "grid",
    gap: 0.75,
  } as const;
  const fieldSx = {
    "& .MuiInputLabel-root": {
      fontSize: 13,
    },
    "& .MuiOutlinedInput-root": {
      minHeight: 40,
      borderRadius: "10px",
      fontSize: 13,
      bgcolor: fieldBackground,
      "& fieldset": {
        borderColor,
      },
      "&:hover fieldset": {
        borderColor:
          theme.palette.mode === "dark" ? "rgba(56, 189, 248, 0.36)" : "rgba(37, 99, 235, 0.28)",
      },
      "&.Mui-focused fieldset": {
        borderColor:
          theme.palette.mode === "dark" ? "rgba(56, 189, 248, 0.58)" : "rgba(37, 99, 235, 0.54)",
      },
    },
  } as const;
  const buttonBaseSx = {
    minHeight: 40,
    px: 2,
    borderRadius: "10px",
    fontSize: 13,
    fontWeight: 700,
    lineHeight: 1,
    whiteSpace: "nowrap",
    boxShadow: "none",
  } as const;
  const primaryButtonSx = {
    ...buttonBaseSx,
    "&:hover": {
      boxShadow: "none",
    },
  } as const;
  const outlinedButtonSx = {
    ...buttonBaseSx,
    borderColor,
    color: theme.palette.text.primary,
    bgcolor: alpha(theme.palette.background.default, theme.palette.mode === "dark" ? 0.12 : 0.5),
    "&:hover": {
      borderColor: theme.palette.primary.main,
      bgcolor: alpha(theme.palette.primary.main, theme.palette.mode === "dark" ? 0.1 : 0.05),
    },
  } as const;
  const dangerButtonSx = {
    ...buttonBaseSx,
    borderColor: alpha(theme.palette.error.main, 0.38),
    color: theme.palette.error.main,
    bgcolor: alpha(theme.palette.error.main, theme.palette.mode === "dark" ? 0.08 : 0.03),
    "&:hover": {
      borderColor: alpha(theme.palette.error.main, 0.62),
      bgcolor: alpha(theme.palette.error.main, theme.palette.mode === "dark" ? 0.14 : 0.06),
    },
  } as const;
  const iconButtonSx = {
    width: 36,
    height: 36,
    borderRadius: "10px",
    border: `1px solid ${borderColor}`,
    bgcolor: alpha(theme.palette.background.default, theme.palette.mode === "dark" ? 0.12 : 0.56),
    color: theme.palette.text.secondary,
    "&:hover": {
      borderColor: theme.palette.primary.main,
      bgcolor: alpha(theme.palette.primary.main, theme.palette.mode === "dark" ? 0.1 : 0.05),
      color: theme.palette.text.primary,
    },
    "&.Mui-disabled": {
      borderColor,
    },
  } as const;
  const dangerIconButtonSx = {
    ...iconButtonSx,
    borderColor: alpha(theme.palette.error.main, 0.34),
    color: alpha(theme.palette.error.main, 0.92),
    "&:hover": {
      borderColor: alpha(theme.palette.error.main, 0.6),
      bgcolor: alpha(theme.palette.error.main, theme.palette.mode === "dark" ? 0.14 : 0.06),
      color: theme.palette.error.main,
    },
  } as const;

  return (
    <Box sx={{ display: "grid", gap: 2, p: { xs: 2, md: 2.5 }, height: "100%", minHeight: 0 }}>
      <Paper sx={panelSx}>
        <Stack
          direction={{ xs: "column", lg: "row" }}
          justifyContent="space-between"
          spacing={2}
          sx={titleBarSx}
        >
          <Box>
            <Stack direction="row" spacing={1} alignItems="center">
              <Filter size={16} />
              <Typography variant="subtitle1" fontWeight={700}>
                絞り込み
              </Typography>
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              一覧を絞り込んで対象ワークフローを選択します。
            </Typography>
          </Box>
          <Stack direction="row" spacing={1}>
            <Chip label={`${filteredWorkflows.length} 件表示`} color="primary" variant="outlined" />
            <Button
              variant="contained"
              startIcon={<Plus size={16} />}
              onClick={() => setCreateDialogOpen(true)}
              sx={primaryButtonSx}
            >
              新規作成
            </Button>
          </Stack>
        </Stack>

        <Box
          sx={{
            p: { xs: 2, md: 2.25 },
            display: "grid",
            gap: 1.25,
            gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr))", xl: "repeat(5, minmax(0, 1fr))" },
          }}
        >
          <TextField
            select
            size="small"
            label="荷主"
            value={filterShipperId}
            onChange={(event) => setFilterShipperId(event.target.value)}
            sx={fieldSx}
          >
            <MenuItem value="all">すべて</MenuItem>
            {shippers.map((shipper) => (
              <MenuItem key={shipper.id} value={shipper.id}>
                {shipper.name}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            size="small"
            label="拠点"
            value={filterSiteId}
            onChange={(event) => setFilterSiteId(event.target.value)}
            sx={fieldSx}
          >
            <MenuItem value="all">すべて</MenuItem>
            {filteredSites.map((site) => (
              <MenuItem key={site.id} value={site.id}>
                {site.name}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            size="small"
            label="エリア"
            value={filterAreaId}
            onChange={(event) => setFilterAreaId(event.target.value)}
            sx={fieldSx}
          >
            <MenuItem value="all">すべて</MenuItem>
            {filteredAreas.map((area) => (
              <MenuItem key={area.id} value={area.id}>
                {area.name}
              </MenuItem>
            ))}
          </TextField>
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
          <TextField
            size="small"
            label="キーワード"
            value={filterKeyword}
            onChange={(event) => setFilterKeyword(event.target.value)}
            placeholder="ワークフロー名で検索"
            sx={fieldSx}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Search size={16} />
                </InputAdornment>
              ),
            }}
          />
        </Box>
      </Paper>
      <Box
        sx={{
          display: "grid",
          gap: 2,
          minHeight: 0,
          flex: 1,
          gridTemplateColumns: { xs: "1fr", xl: "340px minmax(0, 1fr)" },
        }}
      >
        <Paper sx={{ ...panelSx, minHeight: 0, display: "flex", flexDirection: "column" }}>
          <Box sx={titleBarSx}>
            <Typography variant="subtitle1" fontWeight={700}>
              ワークフロー一覧
            </Typography>
            <Typography variant="body2" color="text.secondary">
              更新順 / クリックで右側に詳細表示
            </Typography>
          </Box>
          <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto", p: 1.25 }}>
            <Stack spacing={1}>
              {filteredWorkflows.map((workflow) => {
                const active = workflow.id === selectedWorkflowId;
                return (
                  <Box
                    key={workflow.id}
                    onClick={() => setSelectedWorkflowId(workflow.id)}
                    sx={{
                      p: 1.25,
                      ...childCardSx,
                      borderColor: active ? theme.palette.primary.main : borderColor,
                      bgcolor: active ? alpha(theme.palette.primary.main, theme.palette.mode === "dark" ? 0.14 : 0.08) : "transparent",
                      cursor: "pointer",
                      transition: "background-color 160ms ease, border-color 160ms ease",
                      "&:hover": {
                        bgcolor: active
                          ? alpha(theme.palette.primary.main, theme.palette.mode === "dark" ? 0.18 : 0.11)
                          : alpha(theme.palette.primary.main, 0.04),
                      },
                    }}
                  >
                    <Stack direction="row" justifyContent="space-between" spacing={1.5}>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="subtitle2" noWrap>
                          {workflow.name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" noWrap>
                          {shipperMap.get(workflow.shipperId)?.name ?? "-"}
                        </Typography>
                      </Box>
                      <Chip
                        label={`${workflow.steps.length}工程`}
                        size="small"
                        color={active ? "primary" : "default"}
                        variant={active ? "filled" : "outlined"}
                      />
                    </Stack>
                    <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" sx={{ mt: 1 }}>
                      <Chip label={siteMap.get(workflow.siteId)?.name ?? "-"} size="small" variant="outlined" />
                      <Chip label={areaMap.get(workflow.areaId)?.name ?? "-"} size="small" variant="outlined" />
                    </Stack>
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>
                      更新 {formatUpdatedAt(workflow.updatedAt)}
                    </Typography>
                  </Box>
                );
              })}
              {filteredWorkflows.length === 0 && (
                <Box
                  sx={{
                    py: 8,
                    textAlign: "center",
                    ...childCardSx,
                  }}
                >
                  <Typography variant="body2" color="text.secondary">
                    条件に一致するワークフローがありません
                  </Typography>
                </Box>
              )}
            </Stack>
          </Box>
        </Paper>

        <Paper sx={{ ...panelSx, minHeight: 0, display: "flex", flexDirection: "column" }}>
          {!selectedWorkflow ? (
            <Box sx={{ flex: 1, display: "grid", placeItems: "center", px: 3 }}>
              <Box sx={{ textAlign: "center", maxWidth: 420 }}>
                <Route size={28} />
                <Typography variant="h6" sx={{ mt: 1.5 }}>
                  ワークフローを選択してください
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  左の一覧から対象を選ぶと、基本情報と工程順序をまとめて編集できます。
                </Typography>
              </Box>
            </Box>
          ) : (
            <>
              <Box sx={titleBarSx}>
                <Stack direction={{ xs: "column", lg: "row" }} justifyContent="space-between" spacing={1.75}>
                  <Box>
                    <Typography variant="h6">{selectedWorkflow.name}</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                      {shipperMap.get(selectedWorkflow.shipperId)?.name ?? "-"} / {siteMap.get(selectedWorkflow.siteId)?.name ?? "-"} / {areaMap.get(selectedWorkflow.areaId)?.name ?? "-"}
                    </Typography>
                  </Box>
                  <Stack direction="row" spacing={1}>
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
                      削除
                    </Button>
                  </Stack>
                </Stack>
              </Box>

              <Box sx={{ px: 2.5, py: 2.25 }}>
                <Box
                  sx={{
                    display: "grid",
                    gap: 1.25,
                    gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr))", xl: "repeat(4, minmax(0, 1fr))" },
                  }}
                >
                  <TextField
                    size="small"
                    label="ワークフロー名"
                    value={selectedWorkflow.name}
                    onChange={(event) => updateWorkflowMeta(selectedWorkflow.id, "name", event.target.value)}
                    sx={fieldSx}
                  />
                  <TextField
                    select
                    size="small"
                    label="荷主"
                    value={selectedWorkflow.shipperId}
                    onChange={(event) => updateWorkflowMeta(selectedWorkflow.id, "shipperId", event.target.value)}
                    sx={fieldSx}
                  >
                    {shippers.map((shipper) => (
                      <MenuItem key={shipper.id} value={shipper.id}>
                        {shipper.name}
                      </MenuItem>
                    ))}
                  </TextField>
                  <TextField
                    select
                    size="small"
                    label="拠点"
                    value={selectedWorkflow.siteId}
                    onChange={(event) => updateWorkflowMeta(selectedWorkflow.id, "siteId", event.target.value)}
                    sx={fieldSx}
                  >
                    {selectedWorkflowSites.map((site) => (
                      <MenuItem key={site.id} value={site.id}>
                        {site.name}
                      </MenuItem>
                    ))}
                  </TextField>
                  <TextField
                    select
                    size="small"
                    label="エリア"
                    value={selectedWorkflow.areaId}
                    onChange={(event) => updateWorkflowMeta(selectedWorkflow.id, "areaId", event.target.value)}
                    sx={fieldSx}
                  >
                    {selectedWorkflowAreas.map((area) => (
                      <MenuItem key={area.id} value={area.id}>
                        {area.name}
                      </MenuItem>
                    ))}
                  </TextField>
                </Box>

                <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mt: 1.75 }}>
                  <Chip label={`${selectedWorkflow.steps.length} 工程`} color="primary" variant="outlined" />
                  <Chip
                    label={`標準人数 ${selectedWorkflow.steps.reduce((sum, step) => sum + step.standardHeadcount, 0)} 名`}
                    variant="outlined"
                  />
                  <Chip
                    label={`合計UPH ${selectedWorkflow.steps.reduce((sum, step) => sum + step.uph, 0).toLocaleString("ja-JP")}`}
                    variant="outlined"
                  />
                  <Chip label={`最終更新 ${formatUpdatedAt(selectedWorkflow.updatedAt)}`} variant="outlined" />
                </Stack>
              </Box>

              <Divider />

              <Box sx={{ px: 2.5, py: 1.75 }}>
                <Typography variant="subtitle1" fontWeight={700}>
                  工程フロー
                </Typography>
                <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mt: 1.25 }}>
                  {selectedWorkflow.steps.map((step, index) => (
                    <Chip key={step.id} label={`${index + 1}. ${processMap.get(step.processId)?.name ?? "未設定工程"}`} />
                  ))}
                  {selectedWorkflow.steps.length === 0 && <Chip label="工程未登録" variant="outlined" />}
                </Stack>
              </Box>

              <Divider />

              <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto", p: 2.5 }}>
                <Stack spacing={1.25}>
                  {selectedWorkflow.steps.map((step, index) => {
                    const process = processMap.get(step.processId);
                    return (
                      <Paper
                        key={step.id}
                        variant="outlined"
                        sx={{
                          ...childCardSx,
                          p: 1.75,
                          bgcolor: alpha(theme.palette.background.default, theme.palette.mode === "dark" ? 0.22 : 0.5),
                        }}
                      >
                        <Stack direction={{ xs: "column", xl: "row" }} justifyContent="space-between" spacing={2}>
                          <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
                            <Chip label={`STEP ${index + 1}`} color="primary" size="small" />
                            <Box sx={{ minWidth: 0 }}>
                              <Typography variant="subtitle2">{process?.name ?? "未設定工程"}</Typography>
                              <Typography variant="caption" color="text.secondary">
                                {process?.description ?? "工程説明なし"}
                              </Typography>
                            </Box>
                          </Stack>
                          <Stack direction="row" spacing={0.5} alignItems="center" justifyContent="flex-end">
                            <IconButton size="small" onClick={() => moveStep(step.id, "up")} disabled={index === 0} sx={iconButtonSx}>
                              <ArrowUp size={16} />
                            </IconButton>
                            <IconButton
                              size="small"
                              onClick={() => moveStep(step.id, "down")}
                              disabled={index === selectedWorkflow.steps.length - 1}
                              sx={iconButtonSx}
                            >
                              <ArrowDown size={16} />
                            </IconButton>
                            <IconButton size="small" color="error" onClick={() => removeStep(step.id)} sx={dangerIconButtonSx}>
                              <Trash2 size={16} />
                            </IconButton>
                          </Stack>
                        </Stack>

                        <Box
                          sx={{
                            mt: 2,
                            display: "grid",
                            gap: 1.25,
                            gridTemplateColumns: { xs: "1fr", md: "minmax(0, 2fr) repeat(2, minmax(0, 1fr))" },
                          }}
                        >
                          <TextField
                            select
                            size="small"
                            label="工程"
                            value={step.processId}
                            onChange={(event) => {
                              const nextProcess = processMap.get(event.target.value);
                              updateStep(step.id, (source) => ({
                                ...source,
                                processId: event.target.value,
                                requiredQualificationIds: nextProcess?.defaultQualificationIds ?? source.requiredQualificationIds,
                                requiredSkillIds: nextProcess?.defaultSkillIds ?? source.requiredSkillIds,
                                standardHeadcount: nextProcess?.defaultHeadcount ?? source.standardHeadcount,
                                uph: nextProcess?.defaultUph ?? source.uph,
                              }));
                            }}
                            sx={fieldSx}
                          >
                            {processes.map((item) => (
                              <MenuItem key={item.id} value={item.id}>
                                {item.name}
                              </MenuItem>
                            ))}
                          </TextField>
                          <TextField
                            type="number"
                            size="small"
                            label="標準人数"
                            value={step.standardHeadcount}
                            onChange={(event) =>
                              updateStep(step.id, (source) => ({
                                ...source,
                                standardHeadcount: Number(event.target.value) || 1,
                              }))
                            }
                            sx={fieldSx}
                          />
                          <TextField
                            type="number"
                            size="small"
                            label="標準UPH"
                            value={step.uph}
                            onChange={(event) =>
                              updateStep(step.id, (source) => ({
                                ...source,
                                uph: Number(event.target.value) || 0,
                              }))
                            }
                            sx={fieldSx}
                          />
                        </Box>

                        <Box
                          sx={{
                            mt: 1.5,
                            display: "grid",
                            gap: 1.25,
                            gridTemplateColumns: { xs: "1fr", xl: "repeat(2, minmax(0, 1fr))" },
                          }}
                        >
                          <TagSelector
                            label="所要資格"
                            placeholder="資格を選択"
                            options={qualifications}
                            selectedIds={step.requiredQualificationIds}
                            onChange={(values) =>
                              updateStep(step.id, (source) => ({ ...source, requiredQualificationIds: values }))
                            }
                          />
                          <TagSelector
                            label="所要スキル"
                            placeholder="スキルを選択"
                            options={skills}
                            selectedIds={step.requiredSkillIds}
                            onChange={(values) =>
                              updateStep(step.id, (source) => ({ ...source, requiredSkillIds: values }))
                            }
                          />
                        </Box>
                      </Paper>
                    );
                  })}

                  {selectedWorkflow.steps.length === 0 && (
                    <Box
                      sx={{
                        py: 8,
                        textAlign: "center",
                        ...childCardSx,
                      }}
                    >
                      <Typography variant="body2" color="text.secondary">
                        工程が未登録です。「工程追加」から登録してください。
                      </Typography>
                    </Box>
                  )}
                </Stack>
              </Box>

              <Divider />

              <Stack direction="row" spacing={1} alignItems="center" sx={{ px: 2.5, py: 1.5, color: "text.secondary" }}>
                <Save size={14} />
                <Typography variant="caption">変更は自動保存されます。</Typography>
              </Stack>
            </>
          )}
        </Paper>
      </Box>

      <Dialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        fullWidth
        maxWidth="sm"
        PaperProps={{ sx: { ...panelSx } }}
      >
        <DialogTitle sx={dialogTitleSx}>
          <Typography variant="subtitle1" fontWeight={700}>
            ワークフローを新規作成
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            荷主・拠点・エリアを選択して初期ワークフローを作成します。
          </Typography>
        </DialogTitle>
        <DialogContent sx={dialogContentSx}>
          <Box sx={dialogFieldGroupSx}>
            <Typography variant="caption" color="text.secondary" fontWeight={700}>
              荷主
            </Typography>
            <TextField
              select
              size="small"
              value={newShipperId}
              onChange={(event) => setNewShipperId(event.target.value)}
              sx={fieldSx}
            >
              {shippers.map((shipper) => (
                <MenuItem key={shipper.id} value={shipper.id}>
                  {shipper.name}
                </MenuItem>
              ))}
            </TextField>
          </Box>
          <Box sx={dialogFieldGroupSx}>
            <Typography variant="caption" color="text.secondary" fontWeight={700}>
              拠点
            </Typography>
            <TextField
              select
              size="small"
              value={newSiteId}
              onChange={(event) => setNewSiteId(event.target.value)}
              sx={fieldSx}
            >
              {sites
                .filter((site) => site.shipperId === newShipperId)
                .map((site) => (
                  <MenuItem key={site.id} value={site.id}>
                    {site.name}
                  </MenuItem>
                ))}
            </TextField>
          </Box>
          <Box sx={dialogFieldGroupSx}>
            <Typography variant="caption" color="text.secondary" fontWeight={700}>
              エリア
            </Typography>
            <TextField
              select
              size="small"
              value={newAreaId}
              onChange={(event) => setNewAreaId(event.target.value)}
              sx={fieldSx}
            >
              {createAreaOptions.map((area) => (
                <MenuItem key={area.id} value={area.id}>
                  {area.name}
                </MenuItem>
              ))}
            </TextField>
          </Box>
          <Box sx={dialogFieldGroupSx}>
            <Typography variant="caption" color="text.secondary" fontWeight={700}>
              ワークフロー名
            </Typography>
            <TextField
              size="small"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="未入力時は荷主_拠点_エリアで自動命名"
              sx={fieldSx}
            />
          </Box>
        </DialogContent>
        <DialogActions sx={dialogActionsSx}>
          <Button onClick={() => setCreateDialogOpen(false)} sx={outlinedButtonSx}>
            キャンセル
          </Button>
          <Button variant="contained" onClick={createWorkflow} sx={primaryButtonSx}>
            作成
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={addStepDialogOpen}
        onClose={() => setAddStepDialogOpen(false)}
        fullWidth
        maxWidth="xs"
        PaperProps={{ sx: { ...panelSx } }}
      >
        <DialogTitle sx={dialogTitleSx}>
          <Typography variant="subtitle1" fontWeight={700}>
            工程を追加
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            追加する工程を選択すると、標準設定を引き継いで登録します。
          </Typography>
        </DialogTitle>
        <DialogContent sx={{ ...dialogContentSx, pb: 2.25 }}>
          <Box sx={dialogFieldGroupSx}>
            <Typography variant="caption" color="text.secondary" fontWeight={700}>
              工程
            </Typography>
            <TextField
              select
              size="small"
              fullWidth
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
          </Box>
        </DialogContent>
        <DialogActions sx={dialogActionsSx}>
          <Button onClick={() => setAddStepDialogOpen(false)} sx={outlinedButtonSx}>
            キャンセル
          </Button>
          <Button variant="contained" onClick={addStep} sx={primaryButtonSx}>
            追加
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
