import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";
import { printCojConsoleSignature } from "./lib/cojConsoleSignature";

printCojConsoleSignature();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
