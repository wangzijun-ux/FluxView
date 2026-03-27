import { Bell, ChevronDown, Moon, Sun } from "lucide-react";
import {
  AppBar,
  Badge,
  Box,
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

const pageLabels: Record<string, string> = {
  "/": "ダッシュボード",
  "/live-command": "現場配置",
  "/performance": "作業可視化",
  "/submission-records": "送信実績",
  "/process-summary": "進捗管理",
  "/attendance": "シフト管理",
  "/cost-analysis": "コスト分析",
  "/dispatch": "派遣管理",
  "/master-management": "マスタ管理",
  "/user-management": "ユーザー管理",
  "/notifications": "通知管理",
  "/settings": "設定",
};

const pageSubtitles: Record<string, string> = {
  "/": "当日の進捗と業務状況を俯瞰します。",
  "/live-command": "時間帯ごとの人員配置を調整します。",
  "/performance": "現場配置の結果を業務別・作業員別に可視化します。",
  "/submission-records": "現場作業者が送信した実績ログを確認し、管理者評価を付与します。",
  "/process-summary": "業務別・工程別に予定数入力と進捗確認を行います。",
  "/attendance": "月次シフトの作成・取込・調整を行います。",
  "/cost-analysis": "雇用区分別の原価と予算差異を分析します。",
  "/dispatch": "派遣会社別の予定・実績・稼働率を管理します。",
  "/master-management": "荷主・拠点・資格・スキル・派遣会社を管理します。",
  "/user-management": "ユーザー管理とロール・権限設定を行います。",
  "/notifications": "通知作成・配信状況・既読状況を管理します。",
  "/settings": "システム設定、デバイス設定、外部連携を管理します。",
};

export function TopBar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { toggleTheme, isDark } = useTheme();
  const { sites, workflows, selectedSiteId, setSelectedSiteId } = useMasterData();

  const activeSite = sites.find((site) => site.id === selectedSiteId) ?? sites[0];
  const workflowCount = activeSite ? workflows.filter((workflow) => workflow.siteId === activeSite.id).length : workflows.length;
  const notificationCount = Math.max(1, workflowCount);
  const isSiteDetailPage = location.pathname.startsWith("/master/sites/");
  const pageLabel = isSiteDetailPage ? "拠点詳細" : pageLabels[location.pathname] ?? "FluxView";
  const pageSubtitle = isSiteDetailPage
    ? `${activeSite?.name ?? "拠点未選択"} | 契約荷主と拠点設定を管理します。`
    : pageSubtitles[location.pathname] ?? `${activeSite?.name ?? "拠点未選択"} | 業務 ${workflowCount} 件`;
  return (
    <AppBar
      position="sticky"
      color="transparent"
      elevation={0}
      sx={{
        top: 0,
        zIndex: 40,
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
        </Stack>
      </Toolbar>
    </AppBar>
  );
}





