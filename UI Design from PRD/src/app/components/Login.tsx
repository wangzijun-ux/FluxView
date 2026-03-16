import { useState } from "react";
import { useNavigate } from "react-router";
import { Mail, Lock, LogIn, ArrowRight, Languages } from "lucide-react";
import { useThemeColors, useTheme } from "./ThemeContext";

type Language = "en" | "ja" | "zh";

const translations = {
    en: {
        welcome: "Welcome back",
        signIn: "Sign in to your account",
        email: "Email address",
        password: "Password",
        forgotPassword: "Forgot password?",
        rememberMe: "Remember me",
        signInBtn: "Sign in",
        footer: "2026 Dialog Inc. All rights reserved.",
        error: "Invalid email or password",
        defaultCreds: "Default: admin@dialog.com / password123"
    },
    ja: {
        welcome: "おかえりなさい",
        signIn: "アカウントにサインイン",
        email: "メールアドレス",
        password: "パスワード",
        forgotPassword: "パスワードをお忘れですか？",
        rememberMe: "ログイン状態を保持",
        signInBtn: "サインイン",
        footer: "2026 Dialog Inc. All rights reserved.",
        error: "メールアドレスまたはパスワードが正しくありません",
        defaultCreds: "デフォルト: admin@dialog.com / password123"
    },
    zh: {
        welcome: "欢迎回来",
        signIn: "登录您的账户",
        email: "电子邮件地址",
        password: "密码",
        forgotPassword: "忘记密码？",
        rememberMe: "记住我",
        signInBtn: "登录",
        footer: "2026 Dialog Inc. All rights reserved.",
        error: "电子邮件或密码无效",
        defaultCreds: "默认: admin@dialog.com / password123"
    }
};

export function Login() {
    const [lang, setLang] = useState<Language>("ja");
    const [email, setEmail] = useState("admin@dialog.com");
    const [password, setPassword] = useState("password123");
    const [error, setError] = useState("");
    const navigate = useNavigate();
    const c = useThemeColors();
    const { isDark } = useTheme();

    const t = translations[lang];

    const handleLogin = (e: React.FormEvent) => {
        e.preventDefault();
        if (email === "admin@dialog.com" && password === "password123") {
            setError("");
            navigate("/");
        } else {
            setError(t.error);
        }
    };

    return (
        <div className={`min-h-screen w-full flex items-center justify-center ${c.bg} relative overflow-hidden py-8 px-4 sm:px-6 lg:px-8`}>

            {/* Language Switcher */}
            <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
                <Languages className={`w-4 h-4 ${c.textMuted}`} />
                <select
                    value={lang}
                    onChange={(e) => setLang(e.target.value as Language)}
                    className={`bg-transparent ${c.textSecondary} text-sm border-none focus:ring-0 cursor-pointer`}
                >
                    <option value="en">English</option>
                    <option value="ja">日本語</option>
                    <option value="zh">简体中文</option>
                </select>
            </div>

            {/* Background Orbs */}
            <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] rounded-full bg-cyan-500/10 blur-[100px] pointer-events-none" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] rounded-full bg-blue-600/10 blur-[120px] pointer-events-none" />

            {/* Login Card */}
            <div className={`w-full max-w-md ${isDark ? "bg-[#1e1e2e]/80" : "bg-white/90"} backdrop-blur-xl border ${c.borderCard} rounded-2xl shadow-2xl overflow-hidden relative z-10 p-8 sm:p-10 transition-all`}>

                {/* Logo Section */}
                <div className="flex flex-col items-center justify-center mb-8">
                    <img
                        src="/logo-light.png"
                        alt="FluxView Logo"
                        className="h-10 sm:h-12 object-contain mb-6"
                        style={{ filter: isDark ? "brightness(0) invert(1)" : "none" }}
                    />
                    <h2 className={`text-2xl font-semibold tracking-tight ${c.textPrimary}`}>
                        {t.welcome}
                    </h2>
                    <p className={`mt-2 text-sm ${c.textSecondary}`}>
                        {t.signIn}
                    </p>
                </div>

                {/* Form Section */}
                <form onSubmit={handleLogin} className="space-y-6">
                    <div className="space-y-4">
                        <div>
                            <label htmlFor="email" className={`block text-sm font-medium ${c.textSecondary} mb-1.5`}>
                                {t.email}
                            </label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <Mail className={`h-5 w-5 ${c.textMuted}`} />
                                </div>
                                <input
                                    id="email"
                                    name="email"
                                    type="email"
                                    autoComplete="email"
                                    required
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className={`block w-full pl-10 pr-3 py-2.5 border ${c.borderCard} rounded-xl ${c.bgSurface} ${c.textPrimary} placeholder-${isDark ? "gray-500" : "gray-400"} focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 transition-all text-sm sm:text-base`}
                                    placeholder="admin@dialog.com"
                                />
                            </div>
                        </div>

                        <div>
                            <div className="flex items-center justify-between mb-1.5">
                                <label htmlFor="password" className={`block text-sm font-medium ${c.textSecondary}`}>
                                    {t.password}
                                </label>
                                <a href="#" className="text-sm font-medium text-cyan-500 hover:text-cyan-400 transition-colors">
                                    {t.forgotPassword}
                                </a>
                            </div>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <Lock className={`h-5 w-5 ${c.textMuted}`} />
                                </div>
                                <input
                                    id="password"
                                    name="password"
                                    type="password"
                                    autoComplete="current-password"
                                    required
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className={`block w-full pl-10 pr-3 py-2.5 border ${c.borderCard} rounded-xl ${c.bgSurface} ${c.textPrimary} placeholder-${isDark ? "gray-500" : "gray-400"} focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 transition-all text-sm sm:text-base`}
                                    placeholder="••••••••"
                                />
                            </div>
                        </div>
                    </div>

                    {error && (
                        <p className="text-red-500 text-xs italic">{error}</p>
                    )}

                    <div className="flex items-center justify-between">
                        <div className="flex items-center">
                            <input
                                id="remember-me"
                                name="remember-me"
                                type="checkbox"
                                className={`h-4 w-4 rounded border-gray-300 ${isDark ? "bg-[#2a2a3e] border-[#3a3a4e]" : ""} text-cyan-600 focus:ring-cyan-500`}
                            />
                            <label htmlFor="remember-me" className={`ml-2 block text-sm ${c.textSecondary}`}>
                                {t.rememberMe}
                            </label>
                        </div>
                    </div>

                    <div>
                        <button
                            type="submit"
                            className="group relative w-full flex justify-center items-center gap-2 py-3 px-4 border border-transparent text-sm font-medium rounded-xl text-white bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-cyan-500 focus:ring-offset-[#111827] transition-all duration-200 transform hover:-translate-y-0.5 shadow-lg shadow-cyan-500/25"
                        >
                            <LogIn className="w-5 h-5 absolute left-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                            {t.signInBtn}
                            <ArrowRight className="w-4 h-4 ml-1 opacity-70 group-hover:translate-x-1 transition-transform" />
                        </button>
                    </div>

                    <div className="text-center">
                        <p className={`text-[10px] ${c.textMuted}`}>
                            {t.defaultCreds}
                        </p>
                    </div>
                </form>

                {/* Footer Area */}
                <div className="mt-8 text-center">
                    <p className={`text-xs ${c.textDimmed}`}>
                        &copy; 2026 {t.footer}
                    </p>
                </div>
            </div>
        </div>
    );
}
