import { useState } from "react";
import { useNavigate, useLocation } from "react-router";
import {
  LayoutDashboard,
  Workflow,
  Users,
  CalendarClock,
  Truck,
  Bell,
  Settings,
  ChevronLeft,
  ChevronRight,
  Activity,
  HardHat,
  Map,
  Sun,
  Moon,
  PieChart,
  UserCog,
  BarChart3,
} from "lucide-react";
import { useTheme, useThemeColors } from "./ThemeContext";

const navItems = [
  { icon: LayoutDashboard, label: "ダッシュボード", path: "/" },
  { icon: Workflow, label: "工程ビルダー", path: "/process-builder" },
  { icon: Map, label: "配置マップ", path: "/live-command" },
  { icon: BarChart3, label: "工程サマリー", path: "/process-summary" },
  { icon: Users, label: "スタッフ管理", path: "/staff" },
  { icon: CalendarClock, label: "スケジュール", path: "/schedule" },
  { icon: Truck, label: "派遣管理", path: "/dispatch" },
  { icon: PieChart, label: "原価分析", path: "/cost-analysis" },
  { icon: Bell, label: "通知管理", path: "/notifications" },
  { icon: UserCog, label: "ユーザー管理", path: "/user-management" },
  { icon: Settings, label: "設定", path: "/settings" },
];

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { toggleTheme, isDark } = useTheme();
  const c = useThemeColors();

  return (
    <div
      className={`h-full ${c.bgSidebar} border-r ${c.border} flex flex-col transition-all duration-300 ${collapsed ? "w-[68px]" : "w-[240px]"
        }`}
    >
      {/* Logo */}
      <div className={`flex items-center px-4 py-5 border-b ${c.border} min-h-[73px]`}>
        {collapsed ? (
          <div className="w-8 h-8 mx-auto rounded-lg bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center shrink-0">
            <Activity className="w-5 h-5 text-white" />
          </div>
        ) : (
          <img
            src={isDark ? "/logo-dark.png" : "/logo-light.png"}
            alt="FluxView Logo"
            className="h-8 object-contain"
          />
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all ${isActive ? c.navActive : c.navInactive
                }`}
            >
              <item.icon className="w-5 h-5 shrink-0" />
              {!collapsed && <span className="text-[14px]">{item.label}</span>}
            </button>
          );
        })}
      </nav>

      {/* Worker View Link */}
      <div className="px-2 pb-2">
        <button
          onClick={() => navigate("/worker")}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-amber-400 hover:bg-amber-500/10 transition-all"
        >
          <HardHat className="w-5 h-5 shrink-0" />
          {!collapsed && <span className="text-[14px]">作業員ビュー</span>}
        </button>
      </div>

      {/* Theme Toggle */}
      <div className="px-2 pb-2">
        <button
          onClick={toggleTheme}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all ${c.navCollapse}`}
        >
          {isDark ? (
            <Sun className="w-5 h-5 shrink-0 text-amber-400" />
          ) : (
            <Moon className="w-5 h-5 shrink-0 text-indigo-500" />
          )}
          {!collapsed && (
            <span className="text-[14px]">
              {isDark ? "ライトモード" : "ダークモード"}
            </span>
          )}
        </button>
      </div>

      {/* Collapse Toggle */}
      <div className="px-2 pb-4">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className={`w-full flex items-center justify-center p-2 rounded-lg transition-all ${c.navCollapse}`}
        >
          {collapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <ChevronLeft className="w-4 h-4" />
          )}
        </button>
      </div>
    </div>
  );
}