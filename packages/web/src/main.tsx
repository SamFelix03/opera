import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AppKitProvider } from "./config/appkit";
import { SiweProvider } from "./hooks/useSiweSession";
import { App } from "./App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppKitProvider>
      <SiweProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </SiweProvider>
    </AppKitProvider>
  </StrictMode>,
);
