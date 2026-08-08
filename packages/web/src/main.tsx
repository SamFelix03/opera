import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AppKitProvider } from "./config/appkit";
import { SiweProvider } from "./hooks/useSiweSession";
import { CastProvider } from "./hooks/useCast";
import { App } from "./App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppKitProvider>
      <SiweProvider>
        <BrowserRouter>
          <CastProvider>
            <App />
          </CastProvider>
        </BrowserRouter>
      </SiweProvider>
    </AppKitProvider>
  </StrictMode>,
);
