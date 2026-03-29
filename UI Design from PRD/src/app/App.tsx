import { RouterProvider } from "react-router";
import { router } from "./routes";
import { SupabaseBootstrap } from "./components/SupabaseBootstrap";
import { ThemeProvider } from "./components/ThemeContext";
import { MasterDataProvider } from "./components/MasterDataContext";
import { AssignmentProvider } from "./components/AssignmentContext";

export default function App() {
  return (
    <SupabaseBootstrap>
      <ThemeProvider>
        <MasterDataProvider>
          <AssignmentProvider>
            <RouterProvider router={router} />
          </AssignmentProvider>
        </MasterDataProvider>
      </ThemeProvider>
    </SupabaseBootstrap>
  );
}
