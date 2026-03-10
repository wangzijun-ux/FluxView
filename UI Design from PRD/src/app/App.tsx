import { RouterProvider } from "react-router";
import { router } from "./routes";
import { SupabaseBootstrap } from "./components/SupabaseBootstrap";

export default function App() {
  return (
    <SupabaseBootstrap>
      <RouterProvider router={router} />
    </SupabaseBootstrap>
  );
}
