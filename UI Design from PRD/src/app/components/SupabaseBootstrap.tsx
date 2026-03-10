import { useEffect, useState, type ReactNode } from "react";
import {
  flushSupabaseStorageSync,
  hydrateSupabaseStorageToLocalStorage,
  installSupabaseStorageSync,
  isSupabaseStorageEnabled,
} from "../lib/supabaseStorage";

export function SupabaseBootstrap({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(!isSupabaseStorageEnabled());

  useEffect(() => {
    installSupabaseStorageSync();

    let cancelled = false;
    const bootstrap = async () => {
      try {
        await hydrateSupabaseStorageToLocalStorage();
      } finally {
        if (!cancelled) setReady(true);
      }
    };

    void bootstrap();

    const handlePageHide = () => {
      void flushSupabaseStorageSync();
    };

    window.addEventListener("pagehide", handlePageHide);
    return () => {
      cancelled = true;
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, []);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-100">
        <div className="rounded-3xl border border-slate-800 bg-slate-900 px-6 py-5 text-center shadow-2xl">
          <div className="text-sm font-semibold">Supabase と同期中</div>
          <div className="mt-2 text-xs text-slate-400">保存済みデータを読み込んでいます...</div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
