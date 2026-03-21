import { useState, type FormEvent, type ReactNode } from "react";
import { ArrowRight, LockKeyhole } from "lucide-react";
import { DEMO_ACCESS_PASSWORD, grantDemoAccess, hasDemoAccess } from "../lib/demoAccess";
import { useTheme, useThemeColors } from "./ThemeContext";

type DemoAccessGateProps = {
  title: string;
  children: ReactNode;
};

export function DemoAccessGate({ title, children }: DemoAccessGateProps) {
  const [granted, setGranted] = useState(() => hasDemoAccess());
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const c = useThemeColors();
  const { isDark } = useTheme();

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (password !== DEMO_ACCESS_PASSWORD) {
      setError("パスワードが正しくありません。");
      return;
    }

    grantDemoAccess();
    setGranted(true);
    setError("");
    setPassword("");
  };

  if (granted) {
    return <>{children}</>;
  }

  return (
    <div className={`min-h-screen w-full ${c.bg} relative overflow-hidden px-4 py-8 sm:px-6 lg:px-8`}>
      <div className="pointer-events-none absolute left-[-8%] top-[-8%] h-[360px] w-[360px] rounded-full bg-cyan-500/10 blur-[100px]" />
      <div className="pointer-events-none absolute bottom-[-10%] right-[-10%] h-[360px] w-[360px] rounded-full bg-blue-600/10 blur-[120px]" />

      <div className="mx-auto flex min-h-screen max-w-md items-center justify-center">
        <div className={`w-full rounded-[28px] border p-8 shadow-2xl ${isDark ? "bg-[#111827]/88" : "bg-white/92"} ${c.borderCard} backdrop-blur-xl`}>
          <div className="flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#0891b2,#2563eb)] text-white shadow-[0_18px_40px_rgba(37,99,235,0.28)]">
              <LockKeyhole className="h-8 w-8" />
            </div>
          </div>

          <div className="mt-6 text-center">
            <div className={`text-[12px] font-semibold tracking-[0.24em] ${c.textMuted}`}>DEMO ACCESS</div>
            <h1 className={`mt-3 text-[28px] font-semibold tracking-[-0.04em] ${c.textPrimary}`}>{title}</h1>
            <p className={`mt-2 text-[14px] leading-6 ${c.textSecondary}`}>
              DEMOを表示するにはパスワード入力が必要です。
            </p>
          </div>

          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            <label className="block">
              <div className={`mb-2 text-[12px] font-medium ${c.textSecondary}`}>パスワード</div>
              <div className="relative">
                <LockKeyhole className={`pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 ${c.textMuted}`} />
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  placeholder="Enter password"
                  className={`h-12 w-full rounded-2xl border pl-11 pr-4 text-[14px] outline-none transition ${c.bgInput} ${c.borderCard} ${c.textPrimary}`}
                />
              </div>
            </label>

            {error ? <div className="text-[12px] font-medium text-rose-500">{error}</div> : null}

            <button
              type="submit"
              className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl bg-[linear-gradient(135deg,#0891b2,#2563eb)] px-4 text-[14px] font-semibold text-white shadow-[0_18px_40px_rgba(37,99,235,0.24)] transition hover:brightness-110"
            >
              DEMOに入る
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
