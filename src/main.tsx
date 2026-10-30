import React from "react";
import { createRoot } from "react-dom/client";
import { validateContent } from "./game/data";
import App from "./ui/App";
import "./styles/theme.css";
try {
    validateContent();
    createRoot(document.getElementById("root")!).render(<React.StrictMode>
      <App />
    </React.StrictMode>);
}
catch (e) {
    createRoot(document.getElementById("root")!).render(<main role="alert">
      <h1>데이터를 불러올 수 없습니다</h1>
      <pre>{String(e)}</pre>
    </main>);
    console.error(e);
}
