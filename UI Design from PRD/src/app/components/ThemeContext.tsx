import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { CssBaseline, GlobalStyles, ThemeProvider as MuiThemeProvider, createTheme, alpha } from "@mui/material";

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

  const muiTheme = useMemo(
    () =>
      createTheme({
        palette: {
          mode: theme,
          primary: { main: "#155DFC" },
          secondary: { main: "#06b6d4" },
          background: {
            default: theme === "dark" ? "#0d0f16" : "#f3f6fb",
            paper: theme === "dark" ? "#121621" : "#ffffff",
          },
          text: {
            primary: theme === "dark" ? "#f8fafc" : "#0f172a",
            secondary: theme === "dark" ? "#94a3b8" : "#475569",
          },
          divider: theme === "dark" ? "rgba(148, 163, 184, 0.12)" : "rgba(15, 23, 42, 0.08)",
        },
        shape: { borderRadius: 18 },
        typography: {
          fontFamily: '"Noto Sans JP", "Segoe UI", sans-serif',
          h6: { fontWeight: 700, letterSpacing: "-0.02em" },
          subtitle1: { fontWeight: 600 },
          button: { fontWeight: 700, textTransform: "none" },
        },
        components: {
          MuiCssBaseline: {
            styleOverrides: {
              body: {
                backgroundImage:
                  theme === "dark"
                    ? "radial-gradient(circle at top left, rgba(21,93,252,0.12), transparent 28%), radial-gradient(circle at top right, rgba(6,182,212,0.08), transparent 24%)"
                    : "radial-gradient(circle at top left, rgba(21,93,252,0.08), transparent 24%), radial-gradient(circle at top right, rgba(6,182,212,0.06), transparent 22%)",
              },
            },
          },
          MuiPaper: {
            styleOverrides: {
              root: {
                backgroundImage: "none",
                border: `1px solid ${theme === "dark" ? "rgba(148, 163, 184, 0.12)" : "rgba(15, 23, 42, 0.08)"}`,
                boxShadow:
                  theme === "dark"
                    ? "0 18px 40px rgba(2, 6, 23, 0.32)"
                    : "0 18px 40px rgba(15, 23, 42, 0.08)",
              },
            },
          },
          MuiButton: {
            styleOverrides: {
              root: {
                borderRadius: 14,
                paddingInline: 14,
              },
            },
          },
          MuiIconButton: {
            styleOverrides: {
              root: {
                borderRadius: 14,
              },
            },
          },
          MuiOutlinedInput: {
            styleOverrides: {
              root: {
                borderRadius: 14,
                backgroundColor: theme === "dark" ? alpha("#0f172a", 0.28) : alpha("#ffffff", 0.85),
              },
            },
          },
          MuiListItemButton: {
            styleOverrides: {
              root: {
                borderRadius: 14,
              },
            },
          },
        },
      }),
    [theme],
  );

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, isDark: theme === "dark" }}>
      <MuiThemeProvider theme={muiTheme}>
        <CssBaseline />
        <GlobalStyles
          styles={{
            "*": { boxSizing: "border-box" },
            "::-webkit-scrollbar": { width: 10, height: 10 },
            "::-webkit-scrollbar-thumb": {
              background: theme === "dark" ? "rgba(148,163,184,0.22)" : "rgba(148,163,184,0.45)",
              borderRadius: 999,
            },
            "::-webkit-scrollbar-track": {
              background: theme === "dark" ? "rgba(15,23,42,0.24)" : "rgba(226,232,240,0.5)",
            },
          }}
        />
        {children}
      </MuiThemeProvider>
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
    navActive: isDark ? "bg-[#155DFC]/15 text-[#7FB0FF]" : "bg-[#EEF4FF] text-[#155DFC]",
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
