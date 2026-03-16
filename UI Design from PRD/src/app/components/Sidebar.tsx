import {
  Activity,
  BarChart3,
  Bell,
  Building2,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Clock,
  Database,
  GitBranch,
  HardHat,
  LayoutDashboard,
  LogOut,
  Map,
  PieChart,
  Send,
  Settings,
  UserCog,
} from "lucide-react";
import {
  Avatar,
  Box,
  Divider,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import { useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { useTheme } from "./ThemeContext";

type NavItem = {
  icon: typeof LayoutDashboard;
  label: string;
  path: string;
};

const navItems: NavItem[] = [
  { icon: LayoutDashboard, label: "ダッシュボード", path: "/" },
  { icon: Map, label: "現場配置", path: "/live-command" },
  { icon: CalendarClock, label: "作業可視化", path: "/performance" },
  { icon: Send, label: "送信実績", path: "/submission-records" },
  { icon: BarChart3, label: "進捗管理", path: "/process-summary" },
  { icon: Clock, label: "勤怠管理", path: "/attendance" },
  { icon: PieChart, label: "コスト分析", path: "/cost-analysis" },
  { icon: Building2, label: "派遣管理", path: "/dispatch" },
  { icon: GitBranch, label: "ワークフロー管理", path: "/workflow-management" },
  { icon: Database, label: "マスタ管理", path: "/master-management" },
  { icon: UserCog, label: "ユーザー管理", path: "/user-management" },
  { icon: Bell, label: "通知管理", path: "/notifications" },
  { icon: Settings, label: "設定", path: "/settings" },
];

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { isDark } = useTheme();

  const sidebarWidth = collapsed ? 84 : 264;

  return (
    <Box
      sx={{
        width: sidebarWidth,
        flexShrink: 0,
        transition: "width 220ms ease",
        borderRight: 1,
        borderColor: "divider",
        bgcolor: isDark ? alpha("#0b1120", 0.92) : alpha("#ffffff", 0.96),
      }}
    >
      <Box sx={{ display: "flex", height: "100%", minHeight: 0, flexDirection: "column" }}>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: collapsed ? "center" : "space-between",
            minHeight: 88,
            px: collapsed ? 1.5 : 2.5,
            borderBottom: 1,
            borderColor: "divider",
          }}
        >
          {collapsed ? (
            <Avatar
              variant="rounded"
              sx={{
                width: 38,
                height: 38,
                bgcolor: "primary.main",
                backgroundImage: "linear-gradient(135deg, #0891b2, #2563eb)",
              }}
            >
              <Activity size={18} />
            </Avatar>
          ) : (
            <Box
              component="img"
              src="/logo-light.png"
              alt="FluxView Logo"
              sx={{
                height: 30,
                width: "auto",
                filter: isDark ? "brightness(0) invert(1)" : "none",
              }}
            />
          )}

          {!collapsed && (
            <IconButton
              onClick={() => setCollapsed(true)}
              size="small"
              sx={{
                color: "text.secondary",
                border: 1,
                borderColor: "divider",
                bgcolor: isDark ? alpha("#0f172a", 0.35) : alpha("#f8fafc", 0.92),
              }}
            >
              <ChevronLeft size={16} />
            </IconButton>
          )}
        </Box>

        <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto", px: 1.25, py: 1.5 }}>
          <List disablePadding sx={{ display: "grid", gap: 0.5 }}>
            {navItems.map((item) => {
              const isActive = location.pathname === item.path;
              const Icon = item.icon;
              const content = (
                <ListItemButton
                  onClick={() => navigate(item.path)}
                  selected={isActive}
                  sx={{
                    minHeight: 42,
                    px: collapsed ? 1.25 : 1.5,
                    py: 0.75,
                    justifyContent: collapsed ? "center" : "flex-start",
                    color: isActive ? "text.primary" : "text.secondary",
                    bgcolor: isActive ? alpha("#2563eb", isDark ? 0.14 : 0.08) : "transparent",
                    borderRadius: 3,
                    position: "relative",
                    transition: "background-color 180ms ease, color 180ms ease",
                    "&::before": isActive
                      ? {
                          content: '""',
                          position: "absolute",
                          left: 6,
                          top: 9,
                          bottom: 9,
                          width: 3,
                          borderRadius: 999,
                          bgcolor: "primary.main",
                        }
                      : undefined,
                    "&:hover": {
                      bgcolor: isActive ? alpha("#2563eb", isDark ? 0.18 : 0.12) : alpha("#94a3b8", isDark ? 0.08 : 0.12),
                    },
                    "& .MuiListItemIcon-root": {
                      color: "inherit",
                    },
                  }}
                >
                  <ListItemIcon
                    sx={{
                      minWidth: collapsed ? 0 : 34,
                      justifyContent: "center",
                      ml: isActive && !collapsed ? 0.75 : 0,
                      transition: "margin 180ms ease",
                    }}
                  >
                    <Icon size={18} />
                  </ListItemIcon>
                  {!collapsed && (
                    <ListItemText
                      primary={item.label}
                      primaryTypographyProps={{
                        fontSize: 14,
                        fontWeight: isActive ? 700 : 500,
                        letterSpacing: "0.01em",
                      }}
                    />
                  )}
                </ListItemButton>
              );

              return collapsed ? (
                <Tooltip key={item.path} title={item.label} placement="right">
                  {content}
                </Tooltip>
              ) : (
                <Box key={item.path}>{content}</Box>
              );
            })}
          </List>
        </Box>

        <Divider />

        <Box sx={{ px: 1.25, py: 1.5 }}>
          <Stack spacing={0.75}>
            <Box
              sx={{
                px: collapsed ? 0.75 : 1.25,
                py: 1,
                borderRadius: 3,
                bgcolor: isDark ? alpha("#0f172a", 0.28) : alpha("#f8fafc", 0.84),
              }}
            >
              <Stack direction="row" spacing={1.25} alignItems="center" justifyContent={collapsed ? "center" : "flex-start"}>
                <Avatar sx={{ width: 34, height: 34, backgroundImage: "linear-gradient(135deg, #0891b2, #2563eb)" }}>AD</Avatar>
                {!collapsed && (
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }} noWrap>
                      Admin User
                    </Typography>
                    <Typography variant="caption" color="text.secondary" noWrap>
                      Administrator
                    </Typography>
                  </Box>
                )}
              </Stack>
            </Box>

            <Tooltip title={collapsed ? "作業者ビュー" : ""} placement="right">
              <ListItemButton
                onClick={() => navigate("/worker")}
                sx={{
                  minHeight: 40,
                  justifyContent: collapsed ? "center" : "flex-start",
                  color: "warning.main",
                  borderRadius: 3,
                  "&:hover": { bgcolor: alpha("#f59e0b", 0.12) },
                }}
              >
                <ListItemIcon sx={{ minWidth: collapsed ? 0 : 34, color: "inherit", justifyContent: "center" }}>
                  <HardHat size={18} />
                </ListItemIcon>
                {!collapsed && <ListItemText primary="作業者ビュー" primaryTypographyProps={{ fontSize: 14, fontWeight: 600 }} />}
              </ListItemButton>
            </Tooltip>

            <Tooltip title={collapsed ? "作業者ビュー（バンド）" : ""} placement="right">
              <ListItemButton
                onClick={() => navigate("/worker-band")}
                sx={{
                  minHeight: 40,
                  justifyContent: collapsed ? "center" : "flex-start",
                  color: "info.main",
                  borderRadius: 3,
                  "&:hover": { bgcolor: alpha("#0ea5e9", 0.12) },
                }}
              >
                <ListItemIcon sx={{ minWidth: collapsed ? 0 : 34, color: "inherit", justifyContent: "center" }}>
                  <Activity size={18} />
                </ListItemIcon>
                {!collapsed && <ListItemText primary="作業者ビュー（バンド）" primaryTypographyProps={{ fontSize: 14, fontWeight: 600 }} />}
              </ListItemButton>
            </Tooltip>

            <Tooltip title={collapsed ? "ログアウト" : ""} placement="right">
              <ListItemButton
                onClick={() => navigate("/login")}
                sx={{
                  minHeight: 40,
                  justifyContent: collapsed ? "center" : "flex-start",
                  color: "error.main",
                  borderRadius: 3,
                  "&:hover": { bgcolor: alpha("#ef4444", 0.12) },
                }}
              >
                <ListItemIcon sx={{ minWidth: collapsed ? 0 : 34, color: "inherit", justifyContent: "center" }}>
                  <LogOut size={18} />
                </ListItemIcon>
                {!collapsed && <ListItemText primary="ログアウト" primaryTypographyProps={{ fontSize: 14, fontWeight: 600 }} />}
              </ListItemButton>
            </Tooltip>

            {collapsed && (
              <IconButton
                onClick={() => setCollapsed(false)}
                size="small"
                sx={{
                  alignSelf: "center",
                  mt: 0.5,
                  border: 1,
                  borderColor: "divider",
                  bgcolor: isDark ? alpha("#0f172a", 0.35) : alpha("#f8fafc", 0.92),
                }}
              >
                <ChevronRight size={16} />
              </IconButton>
            )}
          </Stack>
        </Box>
      </Box>
    </Box>
  );
}
