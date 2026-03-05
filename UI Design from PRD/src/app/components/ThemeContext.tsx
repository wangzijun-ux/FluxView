import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

type Theme = "dark" | "light";

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  isDark: boolean;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: "dark",
  toggleTheme: () => {},
  isDark: true,
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    const stored = localStorage.getItem("fluxview-theme");
    return (stored === "light" || stored === "dark") ? stored : "dark";
  });

  useEffect(() => {
    localStorage.setItem("fluxview-theme", theme);
  }, [theme]);

  const toggleTheme = () => setTheme((prev) => (prev === "dark" ? "light" : "dark"));

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, isDark: theme === "dark" }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

// Semantic color tokens for reuse
export function useThemeColors() {
  const { isDark } = useTheme();
  return {
    // Backgrounds
    bg: isDark ? "bg-[#0d0d1a]" : "bg-gray-50",
    bgCard: isDark ? "bg-[#12121e]" : "bg-white",
    bgCardHover: isDark ? "hover:bg-[#1a1a2e]" : "hover:bg-gray-50",
    bgSurface: isDark ? "bg-[#1a1a2e]" : "bg-gray-100",
    bgInput: isDark ? "bg-[#1a1a2e]" : "bg-gray-50",
    bgSidebar: isDark ? "bg-[#0a0a14]" : "bg-white",

    // Borders
    border: isDark ? "border-[#1e1e2e]" : "border-gray-200",
    borderCard: isDark ? "border-[#2a2a3e]" : "border-gray-200",

    // Text
    text: isDark ? "text-gray-100" : "text-gray-900",
    textPrimary: isDark ? "text-white" : "text-gray-900",
    textSecondary: isDark ? "text-gray-400" : "text-gray-600",
    textMuted: isDark ? "text-gray-500" : "text-gray-400",
    textDimmed: isDark ? "text-gray-600" : "text-gray-300",

    // Nav
    navActive: isDark ? "bg-cyan-500/15 text-cyan-400" : "bg-blue-50 text-blue-600",
    navInactive: isDark
      ? "text-gray-400 hover:bg-[#1e1e2e] hover:text-gray-200"
      : "text-gray-500 hover:bg-gray-100 hover:text-gray-900",
    navCollapse: isDark
      ? "text-gray-500 hover:bg-[#1e1e2e] hover:text-gray-300"
      : "text-gray-400 hover:bg-gray-100 hover:text-gray-700",

    // Misc
    isDark,
  };
}
