import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { BugReportWidget, createScreenshotAttachment } from "../src";
import { createModernScreenshotCapture } from "../src/capture/modern-screenshot";
import "../src/style.css";
import "./style.css";

const params = new URLSearchParams(window.location.search);
const theme = params.get("theme") === "dark" ? "dark" : "light";
const useRealCapture = params.get("capture") === "real";

const capture = useRealCapture
  ? createModernScreenshotCapture({ target: () => document.documentElement })
  : {
      isSupported: () => true,
      capture: async () =>
        createScreenshotAttachment(
          new Blob(["demo-image"], { type: "image/png" }),
          { filename: "captured-page.png", source: "capture" },
        ),
    };

function Demo() {
  return (
    <main className="demo-shell" data-theme={theme}>
      <nav className="demo-nav">
        <span className="demo-mark" aria-hidden="true">
          N
        </span>
        <span>Northstar</span>
        <span className="demo-nav__tag">Workspace</span>
      </nav>
      <section className="demo-hero">
        <p className="demo-eyebrow">PROJECT OVERVIEW</p>
        <h1>A calm place to test the unexpected.</h1>
        <p className="demo-intro">
          The report control stays within reach while the application content
          scrolls and changes beneath it.
        </p>
        <div className="demo-grid">
          <article>
            <span className="demo-number">24</span>
            <span>Active views</span>
          </article>
          <article>
            <span className="demo-number">8</span>
            <span>Collaborators</span>
          </article>
          <article>
            <span className="demo-number">99.9%</span>
            <span>Healthy sessions</span>
          </article>
        </div>
        <section
          className="demo-canvas"
          aria-label="Example application visualization"
        >
          <div className="demo-orbit demo-orbit--one" />
          <div className="demo-orbit demo-orbit--two" />
          <span className="demo-node demo-node--a" />
          <span className="demo-node demo-node--b" />
          <span className="demo-node demo-node--c" />
          <span className="demo-node demo-node--d" />
        </section>
      </section>
      <BugReportWidget
        capture={capture}
        defaultExpanded
        onSubmit={async () => {
          await new Promise((resolve) => setTimeout(resolve, 120));
          return { id: "demo-report", provider: "demo" };
        }}
        reporter={{ email: "ada@example.com", name: "Ada Lovelace" }}
        theme={theme}
      />
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Demo />
  </StrictMode>,
);
