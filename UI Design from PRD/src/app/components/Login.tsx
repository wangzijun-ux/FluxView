import { useState } from "react";
import { useNavigate } from "react-router";
import { Mail, Lock, LogIn, ArrowRight } from "lucide-react";
import { useThemeColors, useTheme } from "./ThemeContext";

export function Login() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const navigate = useNavigate();
    const c = useThemeColors();
    const { isDark } = useTheme();

    const handleLogin = (e: React.FormEvent) => {
        e.preventDefault();
        // Simulate login and redirect to dashboard
        navigate("/");
    };

    return (
        <div className={`min-h-screen w-full flex items-center justify-center ${c.bg} relative overflow-hidden py-8 px-4 sm:px-6 lg:px-8`}>

            {/* Background Orbs */}
            <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] rounded-full bg-cyan-500/10 blur-[100px] pointer-events-none" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] rounded-full bg-blue-600/10 blur-[120px] pointer-events-none" />

            {/* Login Card */}
            <div className={`w-full max-w-md ${isDark ? "bg-[#1e1e2e]/80" : "bg-white/90"} backdrop-blur-xl border ${c.borderCard} rounded-2xl shadow-2xl overflow-hidden relative z-10 p-8 sm:p-10 transition-all`}>

                {/* Logo Section */}
                <div className="flex flex-col items-center justify-center mb-8">
                    <img
                        src={isDark ? "/logo-dark.png" : "/logo-light.png"}
                        alt="FluxView Logo"
                        className="h-10 sm:h-12 object-contain mb-6"
                    />
                    <h2 className={`text-2xl font-semibold tracking-tight ${c.textPrimary}`}>
                        Welcome back
                    </h2>
                    <p className={`mt-2 text-sm ${c.textSecondary}`}>
                        Sign in to your account
                    </p>
                </div>

                {/* Form Section */}
                <form onSubmit={handleLogin} className="space-y-6">
                    <div className="space-y-4">
                        <div>
                            <label htmlFor="email" className={`block text-sm font-medium ${c.textSecondary} mb-1.5`}>
                                Email address
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
                                    placeholder="admin@fluxview.jp"
                                />
                            </div>
                        </div>

                        <div>
                            <div className="flex items-center justify-between mb-1.5">
                                <label htmlFor="password" className={`block text-sm font-medium ${c.textSecondary}`}>
                                    Password
                                </label>
                                <a href="#" className="text-sm font-medium text-cyan-500 hover:text-cyan-400 transition-colors">
                                    Forgot password?
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

                    <div className="flex items-center justify-between">
                        <div className="flex items-center">
                            <input
                                id="remember-me"
                                name="remember-me"
                                type="checkbox"
                                className={`h-4 w-4 rounded border-gray-300 ${isDark ? "bg-[#2a2a3e] border-[#3a3a4e]" : ""} text-cyan-600 focus:ring-cyan-500`}
                            />
                            <label htmlFor="remember-me" className={`ml-2 block text-sm ${c.textSecondary}`}>
                                Remember me
                            </label>
                        </div>
                    </div>

                    <div>
                        <button
                            type="submit"
                            className="group relative w-full flex justify-center items-center gap-2 py-3 px-4 border border-transparent text-sm font-medium rounded-xl text-white bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-cyan-500 focus:ring-offset-[#111827] transition-all duration-200 transform hover:-translate-y-0.5 shadow-lg shadow-cyan-500/25"
                        >
                            <LogIn className="w-5 h-5 absolute left-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                            Sign in
                            <ArrowRight className="w-4 h-4 ml-1 opacity-70 group-hover:translate-x-1 transition-transform" />
                        </button>
                    </div>
                </form>

                {/* Footer Area */}
                <div className="mt-8 text-center">
                    <p className={`text-xs ${c.textDimmed}`}>
                        &copy; 2026 FluxView Inc. All rights reserved.
                    </p>
                </div>
            </div>
        </div>
    );
}
