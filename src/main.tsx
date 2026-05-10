import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "./theme.tsx";
import App from "./App.tsx";
import "./index.css";

// Suppress Monaco editor cancelation unhandled rejections
window.addEventListener("unhandledrejection", function (event) {
  if (
    event.reason &&
    event.reason.type === "cancelation" &&
    event.reason.msg === "operation is manually canceled"
  ) {
    event.preventDefault();
  }
});

// Register Service Worker for PWA Offline Support
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        console.log("PyStudio: SW registered: ", registration);
      })
      .catch((registrationError) => {
        console.log("PyStudio: SW registration failed: ", registrationError);
      });
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>,
);
