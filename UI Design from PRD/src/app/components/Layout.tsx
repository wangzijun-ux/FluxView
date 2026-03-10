import { Box, Typography } from "@mui/material";
import { Outlet, useLocation } from "react-router";
import { Sidebar } from "./Sidebar";
import { ThemeProvider } from "./ThemeContext";
import { AssignmentProvider } from "./AssignmentContext";
import { MasterDataProvider } from "./MasterDataContext";
import { TopBar } from "./TopBar";

function LayoutInner() {
  const location = useLocation();
  const isWorkerView = location.pathname.startsWith("/worker");

  if (isWorkerView) {
    return <Outlet />;
  }

  return (
    <Box sx={{ display: "flex", height: "100vh", overflow: "hidden", bgcolor: "background.default", color: "text.primary" }}>
      <Sidebar />
      <Box sx={{ display: "flex", minWidth: 0, flex: 1, flexDirection: "column" }}>
        <TopBar />
        <Box component="main" sx={{ flex: 1, overflowY: "auto" }}>
          <Outlet />
        </Box>
        <Box
          component="footer"
          sx={{
            flexShrink: 0,
            borderTop: 1,
            borderColor: "divider",
            bgcolor: "background.paper",
            px: 2.5,
            py: 1.25,
            textAlign: "center",
          }}
        >
          <Typography variant="caption" sx={{ color: "text.secondary", letterSpacing: "0.02em" }}>
            powered by Dialog.Inc. Ⓒ 2026 All Rights Reserved.
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}

export function Layout() {
  return (
    <ThemeProvider>
      <MasterDataProvider>
        <AssignmentProvider>
          <LayoutInner />
        </AssignmentProvider>
      </MasterDataProvider>
    </ThemeProvider>
  );
}
