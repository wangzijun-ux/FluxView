import { useMemo } from "react";
import { Activity, CalendarClock, Gauge, Truck, Users } from "lucide-react";
import { useMasterData } from "./MasterDataContext";
import { useThemeColors } from "./ThemeContext";

const USER_STORAGE_KEY = "fluxview-users-v1";

type DispatchUserSnapshot = {
  id: string;
  name: string;
  employmentType: "正社員" | "パートナー" | "派遣";
  dispatchCompanyId?: string;
  status: "active" | "inactive" | "locked";
  performance?: {
    uph?: number;
    attendanceRate?: number;
  };
};

function readDispatchUsers(): DispatchUserSnapshot[] {
  try {
    const raw = localStorage.getItem(USER_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as DispatchUserSnapshot[]) : [];
  } catch {
    return [];
  }
}

function formatHours(value: number) {
  return `${value.toFixed(1)}h`;
}

function formatYen(value: number) {
  return `¥${value.toLocaleString()}/h`;
}

function compactWorkflowName(name: string) {
  const chunks = name.split("_");
  return chunks[chunks.length - 1] ?? name;
}

export function DispatchManagement() {
  const c = useThemeColors();
  const { dispatchCompanies, workflows, processes, selectedSiteId, sites } = useMasterData();

  const persistedUsers = useMemo(() => readDispatchUsers(), []);
  const processMap = useMemo(() => new Map(processes.map((item) => [item.id, item.name])), [processes]);
  const activeSite = sites.find((site) => site.id === selectedSiteId) ?? null;
  const siteWorkflows = useMemo(
    () => workflows.filter((workflow) => workflow.siteId === selectedSiteId),
    [selectedSiteId, workflows],
  );

  const companyRows = useMemo(() => {
    const workflowFactor = Math.max(siteWorkflows.length, 1);

    return dispatchCompanies.map((company, index) => {
      const assignedUsers = persistedUsers.filter(
        (user) => user.employmentType === "派遣" && user.dispatchCompanyId === company.id,
      );
      const averageAttendance =
        assignedUsers.length > 0
          ? assignedUsers.reduce((sum, user) => sum + (user.performance?.attendanceRate ?? 90), 0) / assignedUsers.length
          : 88 + ((workflowFactor + index) % 6) * 2;
      const plannedHours = workflowFactor * 18 + 12 + index * 3 + assignedUsers.length * 5;
      const actualHours = Number((plannedHours * Math.min(1.06, averageAttendance / 100)).toFixed(1));
      const utilization = plannedHours === 0 ? 0 : Math.round((actualHours / plannedHours) * 100);
      const averageUph =
        assignedUsers.length > 0
          ? Math.round(assignedUsers.reduce((sum, user) => sum + (user.performance?.uph ?? 110), 0) / assignedUsers.length)
          : 108 + workflowFactor * 4 + index * 3;
      const previewWorkflows =
        siteWorkflows.length === 0
          ? ["業務未設定"]
          : siteWorkflows
              .slice(index % siteWorkflows.length, (index % siteWorkflows.length) + Math.min(2, siteWorkflows.length))
              .map((workflow) => {
                const stepNames = workflow.steps
                  .slice(0, 2)
                  .map((step) => processMap.get(step.processId) ?? "工程未設定")
                  .join(" / ");
                return `${compactWorkflowName(workflow.name)}${stepNames ? ` | ${stepNames}` : ""}`;
              });

      return {
        ...company,
        plannedHours,
        actualHours,
        utilization,
        averageUph,
        assignedCount: assignedUsers.length,
        estimatedCost: Math.round(actualHours * company.unitPrice),
        workflowPreview: previewWorkflows,
      };
    });
  }, [dispatchCompanies, persistedUsers, processMap, siteWorkflows]);

  const summary = useMemo(() => {
    const plannedHours = companyRows.reduce((sum, row) => sum + row.plannedHours, 0);
    const actualHours = companyRows.reduce((sum, row) => sum + row.actualHours, 0);
    const averageUtilization = companyRows.length > 0 ? Math.round(companyRows.reduce((sum, row) => sum + row.utilization, 0) / companyRows.length) : 0;
    const activeCompanies = companyRows.filter((row) => row.status === "active").length;

    return { plannedHours, actualHours, averageUtilization, activeCompanies };
  }, [companyRows]);

  const cardClass = `${c.bgCard} border ${c.border} rounded-xl`;

  return (
    <div className="p-6 h-full flex flex-col gap-4">
      <div className="grid gap-3 md:grid-cols-4">
        {[
          { icon: Truck, label: "稼働中会社数", value: `${summary.activeCompanies}社`, sub: `登録 ${dispatchCompanies.length} 社`, color: "text-cyan-400", bg: "bg-cyan-500/10" },
          { icon: CalendarClock, label: "予定時間", value: formatHours(summary.plannedHours), sub: activeSite?.name ?? "拠点未選択", color: "text-violet-400", bg: "bg-violet-500/10" },
          { icon: Activity, label: "実労働時間", value: formatHours(summary.actualHours), sub: `派遣作業者 ${companyRows.reduce((sum, row) => sum + row.assignedCount, 0)} 名`, color: "text-emerald-400", bg: "bg-emerald-500/10" },
          { icon: Gauge, label: "平均稼働率", value: `${summary.averageUtilization}%`, sub: `対象業務 ${siteWorkflows.length} 件`, color: "text-amber-400", bg: "bg-amber-500/10" },
        ].map((item) => (
          <div key={item.label} className={`${cardClass} p-4 flex items-center gap-3`}>
            <div className={`w-10 h-10 rounded-xl ${item.bg} flex items-center justify-center`}>
              <item.icon className={`w-5 h-5 ${item.color}`} />
            </div>
            <div>
              <div className={`text-[11px] ${c.textMuted}`}>{item.label}</div>
              <div className={`text-[20px] ${c.textPrimary} tabular-nums`}>{item.value}</div>
              <div className={`text-[11px] ${c.textSecondary}`}>{item.sub}</div>
            </div>
          </div>
        ))}
      </div>

      <div className={`${cardClass} p-4 flex flex-wrap items-center justify-between gap-3`}>
        <div>
          <div className={`text-[14px] ${c.textPrimary}`}>派遣会社別の稼働状況</div>
          <div className={`text-[12px] ${c.textSecondary}`}>
            {activeSite ? `${activeSite.name} の業務を基準に表示しています。` : "拠点選択に連動して表示します。"}
          </div>
        </div>
      </div>

      <div className={`${cardClass} overflow-hidden flex-1`}>
        <div className="overflow-auto h-full">
          <table className="w-full min-w-[1180px]">
            <thead className={`sticky top-0 z-10 ${c.bgCard}`}>
              <tr className={`border-b ${c.border}`}>
                {["派遣会社", "対象業務", "予定時間", "実労働時間", "稼働率", "UPH", "単価", "実績コスト"].map((header) => (
                  <th key={header} className={`px-4 py-3 text-left text-[12px] ${c.textMuted}`}>{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {companyRows.map((row) => (
                <tr key={row.id} className={`border-b ${c.borderCard} ${c.bgCardHover}`}>
                  <td className="px-4 py-3 align-top">
                    <div className="flex items-start gap-3">
                      <div className={`mt-0.5 w-2.5 h-2.5 rounded-full ${row.status === "active" ? "bg-emerald-400" : "bg-gray-400"}`} />
                      <div>
                        <div className={`text-[13px] ${c.textPrimary}`}>{row.name}</div>
                        <div className={`text-[11px] ${c.textSecondary}`}>{row.contactName} | {row.phone}</div>
                        <div className={`text-[11px] ${c.textMuted}`}>配置人数 {row.assignedCount} 名</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <div className="flex flex-wrap gap-1.5">
                      {row.workflowPreview.map((label) => (
                        <span key={label} className={`inline-flex max-w-[320px] truncate rounded-full border px-2 py-1 text-[11px] ${c.borderCard} ${c.bgSurface} ${c.textSecondary}`}>
                          {label}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className={`px-4 py-3 text-[13px] ${c.textPrimary} tabular-nums`}>{formatHours(row.plannedHours)}</td>
                  <td className={`px-4 py-3 text-[13px] ${c.textPrimary} tabular-nums`}>{formatHours(row.actualHours)}</td>
                  <td className="px-4 py-3 min-w-[180px]">
                    <div className="flex items-center gap-3">
                      <div className={`h-2 flex-1 rounded-full ${c.bgSurface} overflow-hidden`}>
                        <div className={`h-full rounded-full ${row.utilization >= 95 ? "bg-emerald-400" : row.utilization >= 85 ? "bg-cyan-400" : "bg-amber-400"}`} style={{ width: `${Math.min(row.utilization, 100)}%` }} />
                      </div>
                      <span className={`w-10 text-right text-[12px] ${c.textPrimary} tabular-nums`}>{row.utilization}%</span>
                    </div>
                  </td>
                  <td className={`px-4 py-3 text-[13px] text-cyan-400 tabular-nums`}>{row.averageUph}</td>
                  <td className={`px-4 py-3 text-[13px] ${c.textPrimary} tabular-nums`}>{formatYen(row.unitPrice)}</td>
                  <td className={`px-4 py-3 text-[13px] ${c.textPrimary} tabular-nums`}>¥{row.estimatedCost.toLocaleString()}</td>
                </tr>
              ))}
              {companyRows.length === 0 && (
                <tr>
                  <td colSpan={8} className={`px-4 py-10 text-center text-[13px] ${c.textMuted}`}>
                    マスタ管理で派遣会社を登録すると、ここに会社別の稼働状況を表示します。
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
