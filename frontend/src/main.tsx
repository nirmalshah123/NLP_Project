import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import "./index.css";
import Layout from "./components/Layout";
import LiveCall from "./pages/LiveCall";
import Report from "./pages/Report";
import ScenarioConfig from "./pages/ScenarioConfig";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<ScenarioConfig />} />
          <Route path="/call/:callId" element={<LiveCall />} />
          <Route path="/report/:callId" element={<Report />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);
