import { DemoAccessGate } from "./DemoAccessGate";
import { Layout } from "./Layout";
import { Login } from "./Login";
import { WorkerBandView } from "./WorkerBandView";
import { WorkerView } from "./WorkerView";

export function ProtectedLogin() {
  return (
    <DemoAccessGate title="FluxView Access">
      <Login />
    </DemoAccessGate>
  );
}

export function ProtectedLayout() {
  return (
    <DemoAccessGate title="FluxView Access">
      <Layout />
    </DemoAccessGate>
  );
}

export function ProtectedWorkerView() {
  return (
    <DemoAccessGate title="作業者ビュー DEMO">
      <WorkerView />
    </DemoAccessGate>
  );
}

export function ProtectedWorkerBandView() {
  return (
    <DemoAccessGate title="作業者ビュー（バンド） DEMO">
      <WorkerBandView />
    </DemoAccessGate>
  );
}
