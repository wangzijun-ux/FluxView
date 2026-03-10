import { Bell, ChevronDown, MapPin, Moon, RotateCcw, Sun, UserCircle2 } from "lucide-react";
import { useLocation, useNavigate } from "react-router";
import { useMasterData } from "./MasterDataContext";
import { useTheme, useThemeColors } from "./ThemeContext";

const pageLabels: Record<string, string> = {
  "/": "ダッシュボード",
  "/live-command": "現場配置",
  "/performance": "作業可視化",
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
  const c = useThemeColors();
  const { toggleTheme, isDark } = useTheme();
  const { sites, workflows, selectedSiteId, setSelectedSiteId } = useMasterData();

  const activeSite = sites.find((site) => site.id === selectedSiteId) ?? sites[0];
  const workflowCount = activeSite
    ? workflows.filter((workflow) => workflow.siteId === activeSite.id).length
    : workflows.length;
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

  return (
    <header
      className={`sticky top-0 z-40 shrink-0 border-b backdrop-blur-xl ${
        isDark ? "border-[#232838] bg-[#0f1119]/92" : "border-slate-200/90 bg-white/92"
      }`}
    >
      <div className="flex h-[88px] items-center justify-between gap-4 px-5 md:px-6">
        <div className="min-w-0">
          <div className={`truncate text-base font-semibold ${c.textPrimary}`}>{pageLabel}</div>
          <div className={`truncate text-xs ${c.textSecondary}`}>{pageSubtitle}</div>
        </div>

        <div className="flex items-center gap-2">
          <div
            className={`flex h-11 min-w-[260px] items-center gap-3 rounded-2xl border px-4 shadow-sm ${
              isDark ? "border-[#2a3044] bg-[#171a24]" : "border-slate-200 bg-[#f6f7fb]"
            }`}
          >
            <MapPin className={`h-4 w-4 shrink-0 ${isDark ? "text-cyan-300" : "text-cyan-600"}`} />
            <div className="min-w-0 flex-1">
              <div className={`text-[10px] uppercase tracking-[0.18em] ${c.textMuted}`}>Site</div>
              <select
                aria-label="site-selector"
                value={activeSite?.id ?? ""}
                onChange={(event) => setSelectedSiteId(event.target.value)}
                className={`w-full appearance-none bg-transparent pr-4 text-sm font-medium outline-none ${c.textPrimary}`}
              >
                {sites.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.name}
                  </option>
                ))}
              </select>
            </div>
            <ChevronDown className={`h-4 w-4 shrink-0 ${c.textMuted}`} />
          </div>

          <button
            type="button"
            aria-label="demo-reset"
            onClick={handleDemoReset}
            className={`inline-flex h-11 items-center gap-2 rounded-2xl border px-4 text-sm font-medium transition-all ${
              isDark
                ? "border-rose-500/30 bg-rose-500/10 text-rose-200 hover:bg-rose-500/15"
                : "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
            }`}
          >
            <RotateCcw className="h-4 w-4" />
            <span className="hidden xl:inline">データリセット</span>
          </button>

          <button
            type="button"
            aria-label="toggle-theme"
            onClick={toggleTheme}
            className={`inline-flex h-11 w-11 items-center justify-center rounded-2xl border transition-all ${
              isDark
                ? "border-[#2a3044] bg-[#171a24] text-amber-300 hover:bg-[#1d2130]"
                : "border-slate-200 bg-[#f6f7fb] text-slate-700 hover:bg-white"
            }`}
          >
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>

          <button
            type="button"
            aria-label="notifications"
            onClick={() => navigate("/notifications")}
            className={`relative inline-flex h-11 w-11 items-center justify-center rounded-2xl border transition-all ${
              isDark
                ? "border-[#2a3044] bg-[#171a24] text-slate-200 hover:bg-[#1d2130]"
                : "border-slate-200 bg-[#f6f7fb] text-slate-700 hover:bg-white"
            }`}
          >
            <Bell className="h-4 w-4" />
            <span className="absolute right-1.5 top-1.5 inline-flex min-w-[18px] items-center justify-center rounded-full bg-rose-500 px-1.5 text-[10px] font-bold text-white">
              {notificationCount}
            </span>
          </button>

          <button
            type="button"
            aria-label="user-menu"
            onClick={() => navigate("/user-management")}
            className={`inline-flex h-11 items-center gap-3 rounded-2xl border pl-2 pr-4 transition-all ${
              isDark
                ? "border-[#2a3044] bg-[#171a24] hover:bg-[#1d2130]"
                : "border-slate-200 bg-[#f6f7fb] hover:bg-white"
            }`}
          >
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 text-xs font-bold text-white">
              AD
            </span>
            <span className="hidden text-left md:block">
              <span className={`block text-sm font-semibold ${c.textPrimary}`}>Admin User</span>
              <span className={`block text-[11px] ${c.textMuted}`}>Operations</span>
            </span>
            <UserCircle2 className={`hidden h-4 w-4 md:block ${c.textMuted}`} />
          </button>
        </div>
      </div>
    </header>
  );
}
