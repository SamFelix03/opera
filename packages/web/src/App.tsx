import { Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { HomePage } from "./pages/Home";
import { DemoPage } from "./pages/Demo";
import { OwnerPage } from "./pages/Owner";
import { OperatorPage } from "./pages/Operator";
import { MarketPage } from "./pages/Market";
import { PlaygroundPage } from "./pages/Playground";
import { AuditPage } from "./pages/Audit";

export function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/demo" element={<DemoPage />} />
        <Route path="/owner" element={<OwnerPage />} />
        <Route path="/operator" element={<OperatorPage />} />
        <Route path="/market" element={<MarketPage />} />
        <Route path="/playground" element={<PlaygroundPage />} />
        <Route path="/audit" element={<AuditPage />} />
      </Routes>
    </Layout>
  );
}
