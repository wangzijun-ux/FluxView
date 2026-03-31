import { DemoAccessGate } from "./DemoAccessGate";
import { Layout } from "./Layout";
import { Login } from "./Login";
import { MasterDataProvider } from "./MasterDataContext";
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
    <MasterDataProvider>
      <DemoAccessGate title="作業者ビュー DEMO">
        <WorkerView />
      </DemoAccessGate>
    </MasterDataProvider>
  );
}

export function ProtectedWorkerBandView() {
  return (
    <MasterDataProvider>
      <DemoAccessGate title="作業者ビュー バンド表示 DEMO">
        <WorkerBandView />
      </DemoAccessGate>
    </MasterDataProvider>
  );
}
