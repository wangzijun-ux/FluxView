import { useState } from "react";
import { useNavigate, useLocation } from "react-router";
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
  Settings,
  UserCog,
} from "lucide-react";
import { useThemeColors } from "./ThemeContext";

type NavItem = {
  icon: typeof LayoutDashboard;
  label: string;
  path: string;
};

const navItems: NavItem[] = [
  { icon: LayoutDashboard, label: "\u30c0\u30c3\u30b7\u30e5\u30dc\u30fc\u30c9", path: "/" },
  { icon: Map, label: "\u73fe\u5834\u914d\u7f6e", path: "/live-command" },
  { icon: CalendarClock, label: "\u4f5c\u696d\u53ef\u8996\u5316", path: "/performance" },
  { icon: BarChart3, label: "\u9032\u6357\u7ba1\u7406", path: "/process-summary" },
  { icon: Clock, label: "\u52e4\u6020\u7ba1\u7406", path: "/attendance" },
  { icon: PieChart, label: "\u30b3\u30b9\u30c8\u5206\u6790", path: "/cost-analysis" },
  { icon: Building2, label: "\u6d3e\u9063\u7ba1\u7406", path: "/dispatch" },
  { icon: GitBranch, label: "\u30ef\u30fc\u30af\u30d5\u30ed\u30fc\u7ba1\u7406", path: "/workflow-management" },
  { icon: Database, label: "\u30de\u30b9\u30bf\u7ba1\u7406", path: "/master-management" },
  { icon: UserCog, label: "\u30e6\u30fc\u30b6\u30fc\u7ba1\u7406", path: "/user-management" },
  { icon: Bell, label: "\u901a\u77e5\u7ba1\u7406", path: "/notifications" },
  { icon: Settings, label: "\u8a2d\u5b9a", path: "/settings" },
];

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const c = useThemeColors();

  return (
    <div
      className={`h-full ${c.bgSidebar} border-r ${c.border} flex flex-col transition-all duration-300 ${
        collapsed ? "w-[68px]" : "w-[240px]"
      }`}
    >
      <div className={`flex h-[88px] shrink-0 items-center border-b px-4 ${c.border}`}>
        {collapsed ? (
          <div className="w-8 h-8 mx-auto rounded-lg bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center shrink-0">
            <Activity className="w-5 h-5 text-white" />
          </div>
        ) : (
          <img
            src={c.isDark ? "/logo-dark.png" : "/logo-light.png"}
            alt="FluxView Logo"
            className="h-8 object-contain"
          />
        )}
      </div>

      <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all ${
                isActive ? c.navActive : c.navInactive
              }`}
              title={collapsed ? item.label : ""}
            >
              <item.icon className="w-5 h-5 shrink-0" />
              {!collapsed && <span className="text-[14px]">{item.label}</span>}
            </button>
          );
        })}
      </nav>

      <div className={`px-4 py-4 border-t ${c.border} transition-all duration-300 overflow-hidden`}>
        <div className={`flex items-center gap-3 ${collapsed ? "justify-center" : ""}`}>
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shrink-0 shadow-lg text-white font-bold text-sm">
            AD
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-semibold ${c.textPrimary} truncate`}>Admin User</p>
              <p className={`text-xs ${c.textSecondary} truncate`}>Administrator</p>
            </div>
          )}
        </div>
      </div>

      <div className="px-2 pb-2">
        <button
          onClick={() => navigate("/login")}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-red-400 hover:bg-red-500/10 transition-all ${
            collapsed ? "justify-center" : ""
          }`}
          title={collapsed ? "\u30ed\u30b0\u30a2\u30a6\u30c8" : ""}
        >
          <LogOut className="w-5 h-5 shrink-0" />
          {!collapsed && <span className="text-[14px]">{"\u30ed\u30b0\u30a2\u30a6\u30c8"}</span>}
        </button>
      </div>

      <div className="px-2 pb-2">
        <button
          onClick={() => navigate("/worker")}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-amber-400 hover:bg-amber-500/10 transition-all ${
            collapsed ? "justify-center" : ""
          }`}
        >
          <HardHat className="w-5 h-5 shrink-0" />
          {!collapsed && <span className="text-[14px]">{"\u4f5c\u696d\u8005\u30d3\u30e5\u30fc"}</span>}
        </button>
      </div>

      <div className="px-2 pb-4">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className={`w-full flex items-center justify-center p-2 rounded-lg transition-all ${c.navCollapse}`}
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}

