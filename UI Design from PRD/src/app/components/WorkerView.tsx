import { useState } from "react";
import {
  ArrowLeft,
  Bell,
  CheckCircle2,
  Pause,
  Play,
  Square,
  Package,
  Clock,
  User,
  Globe,
  AlertTriangle,
  Megaphone,
  Shield,
} from "lucide-react";
import { useNavigate } from "react-router";

type TaskStatus = "idle" | "working" | "paused" | "completed";
type Language = "ja" | "en" | "zh" | "vi";

const translations: Record<Language, Record<string, string>> = {
  ja: {
    greeting: "こんにちは",
    currentTask: "現在のタスク",
    start: "開始",
    pause: "中断",
    complete: "完了",
    quantity: "数量",
    notifications: "お知らせ",
    uph: "UPH",
    todayProgress: "本日の実績",
    items: "件",
    backToAdmin: "管理画面へ戻る",
    zone: "配置エリア",
    time: "経過時間",
    nfcHint: "NFCバッジでログイン中",
  },
  en: {
    greeting: "Hello",
    currentTask: "Current Task",
    start: "START",
    pause: "PAUSE",
    complete: "DONE",
    quantity: "Quantity",
    notifications: "Notifications",
    uph: "UPH",
    todayProgress: "Today's Progress",
    items: "items",
    backToAdmin: "Back to Admin",
    zone: "Zone",
    time: "Elapsed",
    nfcHint: "Logged in via NFC badge",
  },
  zh: {
    greeting: "你好",
    currentTask: "当前任务",
    start: "开始",
    pause: "暂停",
    complete: "完成",
    quantity: "数量",
    notifications: "通知",
    uph: "UPH",
    todayProgress: "今日进度",
    items: "件",
    backToAdmin: "返回管理",
    zone: "区域",
    time: "经过时间",
    nfcHint: "NFC工牌已登录",
  },
  vi: {
    greeting: "Xin chào",
    currentTask: "Nhiệm vụ",
    start: "BẮT ĐẦU",
    pause: "TẠM DỪNG",
    complete: "HOÀN THÀNH",
    quantity: "Số lượng",
    notifications: "Thông báo",
    uph: "UPH",
    todayProgress: "Tiến độ hôm nay",
    items: "mục",
    backToAdmin: "Quay lại",
    zone: "Khu vực",
    time: "Thời gian",
    nfcHint: "Đã đăng nhập NFC",
  },
};

const workerNotifications = [
  { type: "move", message: "検品完了後、E棟の梱包ラインへ移動してください", time: "14:32" },
  { type: "safety", message: "A棟3番レーン: フォークリフト点検中、迂回路を使用", time: "13:15" },
  { type: "announce", message: "明日の出勤時間が5:30に変更されました", time: "12:00" },
];

export function WorkerView() {
  const navigate = useNavigate();
  const [taskStatus, setTaskStatus] = useState<TaskStatus>("idle");
  const [quantity, setQuantity] = useState(0);
  const [lang, setLang] = useState<Language>("ja");
  const [showNotifications, setShowNotifications] = useState(false);

  const t = translations[lang];

  const handleStart = () => setTaskStatus("working");
  const handlePause = () => setTaskStatus("paused");
  const handleComplete = () => {
    setTaskStatus("completed");
    setTimeout(() => setTaskStatus("idle"), 2000);
  };

  return (
    <div className="h-screen bg-white flex flex-col">
      {/* Top Bar */}
      <div className="bg-gray-50 border-b border-gray-200 px-5 py-3 flex items-center justify-between">
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-2 text-gray-500 text-[14px]"
        >
          <ArrowLeft className="w-5 h-5" />
          {t.backToAdmin}
        </button>
        <div className="flex items-center gap-3">
          {/* Language Selector */}
          <div className="flex items-center gap-1 bg-white rounded-lg border border-gray-200 px-2 py-1">
            <Globe className="w-4 h-4 text-gray-400" />
            <select
              value={lang}
              onChange={(e) => setLang(e.target.value as Language)}
              className="text-[14px] text-gray-700 bg-transparent outline-none cursor-pointer"
            >
              <option value="ja">日本語</option>
              <option value="en">English</option>
              <option value="zh">中文</option>
              <option value="vi">Tiếng Việt</option>
            </select>
          </div>
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="relative p-2 rounded-lg bg-white border border-gray-200"
          >
            <Bell className="w-5 h-5 text-gray-700" />
            <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center">
              3
            </div>
          </button>
        </div>
      </div>

      {/* NFC Status */}
      <div className="bg-blue-50 border-b border-blue-100 px-5 py-2 flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-emerald-500" />
        <User className="w-4 h-4 text-blue-600" />
        <span className="text-[14px] text-blue-800">田中 太郎</span>
        <span className="text-[12px] text-blue-500 ml-2">{t.nfcHint}</span>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Main Content */}
        <div className="flex-1 p-6 flex flex-col items-center justify-center">
          {/* Current Task */}
          <div className="w-full max-w-[480px]">
            {/* Task Info */}
            <div className="text-center mb-8">
              <p className="text-gray-500 text-[16px]">{t.currentTask}</p>
              <h1 className="text-gray-900 text-[32px] mt-2">B棟 検品ライン</h1>
              <div className="flex items-center justify-center gap-6 mt-4">
                <div className="text-center">
                  <div className="text-[14px] text-gray-400">{t.zone}</div>
                  <div className="text-[20px] text-gray-900">B-3</div>
                </div>
                <div className="w-px h-8 bg-gray-200" />
                <div className="text-center">
                  <div className="text-[14px] text-gray-400">{t.time}</div>
                  <div className="text-[20px] text-gray-900">
                    {taskStatus === "working" ? "02:15:30" : "--:--:--"}
                  </div>
                </div>
                <div className="w-px h-8 bg-gray-200" />
                <div className="text-center">
                  <div className="text-[14px] text-gray-400">{t.uph}</div>
                  <div className="text-[20px] text-blue-600">142</div>
                </div>
              </div>
            </div>

            {/* 3-Color Button UI - Signal Light Design */}
            <div className="space-y-4 mb-8">
              {taskStatus === "idle" && (
                <button
                  onClick={handleStart}
                  className="w-full py-6 rounded-2xl bg-emerald-500 text-white text-[24px] active:scale-[0.98] transition-transform shadow-lg shadow-emerald-500/30"
                >
                  ▶ {t.start}
                </button>
              )}

              {taskStatus === "working" && (
                <div className="space-y-3">
                  <button
                    onClick={handlePause}
                    className="w-full py-6 rounded-2xl bg-amber-500 text-white text-[24px] active:scale-[0.98] transition-transform shadow-lg shadow-amber-500/30"
                  >
                    ⏸ {t.pause}
                  </button>
                  <button
                    onClick={handleComplete}
                    className="w-full py-6 rounded-2xl bg-red-500 text-white text-[24px] active:scale-[0.98] transition-transform shadow-lg shadow-red-500/30"
                  >
                    ⏹ {t.complete}
                  </button>
                </div>
              )}

              {taskStatus === "paused" && (
                <div className="space-y-3">
                  <button
                    onClick={handleStart}
                    className="w-full py-6 rounded-2xl bg-emerald-500 text-white text-[24px] active:scale-[0.98] transition-transform shadow-lg shadow-emerald-500/30"
                  >
                    ▶ {t.start}
                  </button>
                  <button
                    onClick={handleComplete}
                    className="w-full py-6 rounded-2xl bg-red-500 text-white text-[24px] active:scale-[0.98] transition-transform shadow-lg shadow-red-500/30"
                  >
                    ⏹ {t.complete}
                  </button>
                </div>
              )}

              {taskStatus === "completed" && (
                <div className="w-full py-6 rounded-2xl bg-emerald-100 text-emerald-700 text-[24px] text-center flex items-center justify-center gap-3">
                  <CheckCircle2 className="w-8 h-8" />
                  ✓ {t.complete}
                </div>
              )}
            </div>

            {/* Quantity Selector */}
            {taskStatus === "working" && (
              <div className="bg-gray-50 rounded-2xl p-6 border border-gray-200">
                <p className="text-gray-500 text-[16px] text-center mb-4">
                  {t.quantity}
                </p>
                <div className="flex items-center justify-center gap-6">
                  <button
                    onClick={() => setQuantity(Math.max(0, quantity - 10))}
                    className="w-16 h-16 rounded-xl bg-white border-2 border-gray-300 text-gray-700 text-[24px] active:scale-95 transition-transform"
                  >
                    -10
                  </button>
                  <button
                    onClick={() => setQuantity(Math.max(0, quantity - 1))}
                    className="w-16 h-16 rounded-xl bg-white border-2 border-gray-300 text-gray-700 text-[24px] active:scale-95 transition-transform"
                  >
                    -1
                  </button>
                  <div className="w-24 text-center">
                    <span className="text-[40px] text-gray-900">{quantity}</span>
                  </div>
                  <button
                    onClick={() => setQuantity(quantity + 1)}
                    className="w-16 h-16 rounded-xl bg-white border-2 border-gray-300 text-gray-700 text-[24px] active:scale-95 transition-transform"
                  >
                    +1
                  </button>
                  <button
                    onClick={() => setQuantity(quantity + 10)}
                    className="w-16 h-16 rounded-xl bg-white border-2 border-gray-300 text-gray-700 text-[24px] active:scale-95 transition-transform"
                  >
                    +10
                  </button>
                </div>
              </div>
            )}

            {/* Today's Progress */}
            <div className="mt-6 bg-gray-50 rounded-2xl p-5 border border-gray-200">
              <p className="text-gray-500 text-[14px] mb-3">{t.todayProgress}</p>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <div className="text-[28px] text-gray-900">286</div>
                  <div className="text-[13px] text-gray-400">{t.items}</div>
                </div>
                <div>
                  <div className="text-[28px] text-blue-600">142</div>
                  <div className="text-[13px] text-gray-400">{t.uph}</div>
                </div>
                <div>
                  <div className="text-[28px] text-gray-900">5h 23m</div>
                  <div className="text-[13px] text-gray-400">{t.time}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Notification Panel */}
        {showNotifications && (
          <div className="w-[360px] bg-gray-50 border-l border-gray-200 p-5 overflow-y-auto">
            <h2 className="text-gray-900 text-[20px] mb-4">{t.notifications}</h2>
            <div className="space-y-3">
              {workerNotifications.map((notif, idx) => (
                <div
                  key={idx}
                  className="bg-white rounded-xl p-4 border border-gray-200"
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                        notif.type === "move"
                          ? "bg-blue-100"
                          : notif.type === "safety"
                          ? "bg-amber-100"
                          : "bg-violet-100"
                      }`}
                    >
                      {notif.type === "move" ? (
                        <ArrowLeft className="w-5 h-5 text-blue-600" />
                      ) : notif.type === "safety" ? (
                        <Shield className="w-5 h-5 text-amber-600" />
                      ) : (
                        <Megaphone className="w-5 h-5 text-violet-600" />
                      )}
                    </div>
                    <div>
                      <p className="text-gray-900 text-[16px]">{notif.message}</p>
                      <p className="text-gray-400 text-[13px] mt-1 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {notif.time}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
