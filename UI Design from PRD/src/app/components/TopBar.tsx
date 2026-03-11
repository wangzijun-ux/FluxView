import { Bell, ChevronDown, Moon, RotateCcw, Send, Sun } from "lucide-react";
import {
  AppBar,
  Avatar,
  Badge,
  Box,
  Button,
  FormControl,
  IconButton,
  MenuItem,
  Select,
  Stack,
  Toolbar,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import { useLocation, useNavigate } from "react-router";
import { useMasterData } from "./MasterDataContext";
import { useTheme } from "./ThemeContext";
import { seedDemoWorkerSubmissionData } from "./workerMobileStore";

const pageLabels: Record<string, string> = {
  "/": "ダッシュボード",
  "/live-command": "現場配置",
  "/performance": "作業可視化",
  "/submission-records": "送信実績",
  "/process-summary": "進捗管理",
  "/attendance": "勤怠管理",
  "/cost-analysis": "コスト分析",
  "/dispatch": "派遣管理",
  "/workflow-management": "ワークフロー管理",
  "/master-management": "マスタ管理",
  "/user-management": "ユーザー管理",
  "/notifications": "通知管理",
  "/settings": "設定",
};

const pageSubtitles: Record<string, string> = {
  "/": "当日の進捗とワークフロー状況を俯瞰します。",
  "/live-command": "時間帯ごとの人員配置を調整します。",
  "/performance": "現場配置の結果をワークフロー別・作業員別に可視化します。",
  "/submission-records": "現場作業者が送信した実績ログを工程別に確認します。",
  "/process-summary": "全体把握と予定数管理を同じ画面で行います。",
  "/attendance": "勤務計画とシフト調整を行います。",
  "/cost-analysis": "雇用区分別の原価と予算差異を分析します。",
  "/dispatch": "派遣会社別の予定・実績・稼働率を管理します。",
  "/workflow-management": "工程設定と作業順序をテーブル形式で管理します。",
  "/master-management": "荷主・拠点・エリア・資格・スキル・派遣会社・工程を管理します。",
  "/user-management": "ユーザー管理とロール・権限設定を行います。",
  "/notifications": "通知作成・配信状況・既読状況を管理します。",
  "/settings": "システム設定、デバイス設定、外部連携を管理します。",
};

export function TopBar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { toggleTheme, isDark } = useTheme();
  const { sites, workflows, shippers, areas, processes, selectedSiteId, setSelectedSiteId } = useMasterData();

  const activeSite = sites.find((site) => site.id === selectedSiteId) ?? sites[0];
  const workflowCount = activeSite ? workflows.filter((workflow) => workflow.siteId === activeSite.id).length : workflows.length;
  const notificationCount = Math.max(1, workflowCount);
  const pageLabel = pageLabels[location.pathname] ?? "FluxView";
  const pageSubtitle = pageSubtitles[location.pathname] ?? `${activeSite?.name ?? "拠点未選択"} | ワークフロー ${workflowCount} 件`;

  const handleDemoReset = () => {
    const confirmed = window.confirm("保存済みデータを初期状態へ戻します。デモ用の変更内容はすべて削除されます。続行しますか？");
    if (!confirmed) return;

    Object.keys(window.localStorage).forEach((key) => {
      if (key.startsWith("fluxview-") && key !== "fluxview-theme") {
        window.localStorage.removeItem(key);
      }
    });

    window.location.reload();
  };

  const handleSeedSubmissionRecords = () => {
    const confirmed = window.confirm(
      `選択中拠点「${activeSite?.name ?? "未選択"}」の本日分送信実績を生成します。既存の同拠点データは上書きされます。続行しますか？`,
    );
    if (!confirmed) return;

    const result = seedDemoWorkerSubmissionData({
      selectedSiteId,
      sites,
      workflows,
      shippers,
      areas,
      processes,
    });

    if (result.recordCount <= 0) {
      window.alert("送信実績を生成できませんでした。選択中拠点にワークフローが登録されているか確認してください。");
      return;
    }

    window.alert(
      `${result.dateKey} の送信実績を生成しました。\n作業者 ${result.workerCount} 名 / 作業 ${result.taskCount} 件 / 送信実績 ${result.recordCount} 件`,
    );
    window.location.reload();
  };

  return (
    <AppBar
      position="sticky"
      color="transparent"
      elevation={0}
      sx={{
        top: 0,
        backdropFilter: "blur(14px)",
        bgcolor: isDark ? alpha("#0f172a", 0.84) : alpha("#ffffff", 0.84),
        borderBottom: 1,
        borderColor: "divider",
      }}
    >
      <Toolbar
        sx={{
          minHeight: "88px !important",
          px: { xs: 2, md: 3 },
          gap: 2,
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Box sx={{ minWidth: 0, pr: 2 }}>
          <Typography variant="h6" noWrap>
            {pageLabel}
          </Typography>
          <Typography variant="body2" color="text.secondary" noWrap>
            {pageSubtitle}
          </Typography>
        </Box>

        <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
          <Box sx={{ display: { xs: "none", md: "block" }, minWidth: 220 }}>
            <FormControl size="small" fullWidth>
              <Select
                value={activeSite?.id ?? ""}
                onChange={(event) => setSelectedSiteId(event.target.value)}
                IconComponent={ChevronDown as never}
                sx={{
                  minWidth: 220,
                  borderRadius: 3,
                  bgcolor: isDark ? alpha("#0f172a", 0.28) : alpha("#f8fafc", 0.92),
                  fontSize: 14,
                  fontWeight: 600,
                  "& .MuiSelect-select": { py: 1.1, pr: 4 },
                }}
              >
                {sites.map((site) => (
                  <MenuItem key={site.id} value={site.id}>
                    {site.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>

          <Button
            onClick={handleSeedSubmissionRecords}
            startIcon={<Send size={15} />}
            variant="text"
            color="inherit"
            sx={{
              minHeight: 40,
              px: 1.25,
              color: "text.secondary",
              display: { xs: "none", lg: "inline-flex" },
            }}
          >
            送信実績生成
          </Button>

          <Button
            onClick={handleDemoReset}
            startIcon={<RotateCcw size={15} />}
            variant="text"
            color="inherit"
            sx={{
              minHeight: 40,
              px: 1.25,
              color: "text.secondary",
              display: { xs: "none", xl: "inline-flex" },
            }}
          >
            データリセット
          </Button>

          <IconButton
            onClick={toggleTheme}
            sx={{
              width: 40,
              height: 40,
              borderRadius: 3,
              color: "text.secondary",
              bgcolor: isDark ? alpha("#0f172a", 0.28) : alpha("#f8fafc", 0.92),
              "&:hover": {
                bgcolor: isDark ? alpha("#0f172a", 0.44) : alpha("#e2e8f0", 0.92),
              },
            }}
          >
            {isDark ? <Sun size={16} /> : <Moon size={16} />}
          </IconButton>

          <IconButton
            onClick={() => navigate("/notifications")}
            sx={{
              width: 40,
              height: 40,
              borderRadius: 3,
              color: "text.secondary",
              bgcolor: isDark ? alpha("#0f172a", 0.28) : alpha("#f8fafc", 0.92),
              "&:hover": {
                bgcolor: isDark ? alpha("#0f172a", 0.44) : alpha("#e2e8f0", 0.92),
              },
            }}
          >
            <Badge badgeContent={notificationCount} color="error" overlap="circular">
              <Bell size={16} />
            </Badge>
          </IconButton>

          <Box
            onClick={() => navigate("/user-management")}
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1,
              minHeight: 40,
              pl: 0.75,
              pr: { xs: 0.75, md: 1.25 },
              borderRadius: 3,
              cursor: "pointer",
              color: "text.primary",
              "&:hover": {
                bgcolor: isDark ? alpha("#0f172a", 0.32) : alpha("#e2e8f0", 0.56),
              },
            }}
          >
            <Avatar sx={{ width: 32, height: 32, backgroundImage: "linear-gradient(135deg, #0891b2, #2563eb)" }}>AD</Avatar>
            <Box sx={{ display: { xs: "none", md: "block" } }}>
              <Typography variant="subtitle2" sx={{ lineHeight: 1.1, fontWeight: 700 }}>
                Admin User
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Operations
              </Typography>
            </Box>
          </Box>
        </Stack>
      </Toolbar>
    </AppBar>
  );
}
