"use client";

import { useRef, useState } from "react";
import { ApiError, analyzeStream, errorText } from "@/lib/api/client";
import type { Dashboard } from "@/lib/dashboard/build";
import type { SheetRows } from "@/lib/parse/excel";
import { holdingToRow, newRow, type Row } from "@/lib/rows";
import type { Holding } from "@/lib/types";
import { AnalyzeProgress } from "./AnalyzeProgress";
import { ColumnMapper } from "./ColumnMapper";
import { ConfirmTable } from "./ConfirmTable";
import { DashboardView } from "./dashboard/DashboardView";
import { Turnstile, type TurnstileHandle } from "./Turnstile";
import { UploadStep } from "./UploadStep";

type Step = "upload" | "mapping" | "confirm" | "analyzing" | "dashboard";

export function PortfolioApp() {
  const [step, setStep] = useState<Step>("upload");
  const [sheets, setSheets] = useState<SheetRows[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState({ done: 0, of: 0 });
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const turnstile = useRef<TurnstileHandle>(null);
  const abort = useRef<AbortController | null>(null);

  const getToken = () => (turnstile.current ? turnstile.current.getToken() : Promise.resolve(""));

  function toConfirm(holdings: Holding[], warns: string[], source?: "ai") {
    setRows(holdings.length ? holdings.map((h) => holdingToRow(h, source)) : [newRow()]);
    setWarnings(holdings.length ? warns : [...warns, "No holdings were found — add them below."]);
    setError(null);
    setStep("confirm");
  }

  function startOver() {
    abort.current?.abort();
    abort.current = null;
    setSheets([]);
    setRows([]);
    setWarnings([]);
    setError(null);
    setDashboard(null);
    setProgress({ done: 0, of: 0 });
    setStep("upload");
  }

  async function analyze(holdings: Holding[]) {
    const ctrl = new AbortController();
    abort.current = ctrl;
    setError(null);
    setProgress({ done: 0, of: 0 });
    setStep("analyzing");
    try {
      const token = await getToken();
      if (ctrl.signal.aborted) return;
      const result = await analyzeStream(holdings, token, {
        signal: ctrl.signal,
        onProgress: (done, of) => setProgress({ done, of }),
      });
      if (ctrl.signal.aborted) return;
      setDashboard(result);
      setStep("dashboard");
    } catch (e) {
      if (ctrl.signal.aborted || (e instanceof Error && (e.name === "AbortError" || e.name === "TurnstileSuperseded"))) return;
      const code = e instanceof ApiError ? e.code : e instanceof Error && "code" in e && typeof e.code === "string" ? e.code : "";
      setError(errorText(code));
      setStep("confirm");
    } finally {
      if (abort.current === ctrl) abort.current = null;
    }
  }

  function cancel() {
    abort.current?.abort();
    abort.current = null;
    setStep("confirm");
  }

  return (
    <div className="wrap">
      <header className="topbar">
        <span className="brand">Portfolio Dashboard</span>
        {step !== "upload" && (
          <button type="button" className="btn" onClick={startOver}>
            Start over
          </button>
        )}
      </header>
      <Turnstile ref={turnstile} />

      {step === "upload" && (
        <UploadStep
          getToken={getToken}
          onManual={() => toConfirm([], [])}
          onSheets={(s) => {
            setSheets(s);
            setStep("mapping");
          }}
          onHoldings={(h, w, source) => toConfirm(h, w, source === "ai" ? "ai" : undefined)}
        />
      )}
      {step === "mapping" && (
        <ColumnMapper sheets={sheets} onBack={() => setStep("upload")} onConfirm={(h, w) => toConfirm(h, w)} />
      )}
      {step === "confirm" && (
        <div className="stack">
          {error && (
            <p className="alert" role="alert">
              {error}
            </p>
          )}
          <ConfirmTable rows={rows} onChange={setRows} onAnalyze={analyze} warnings={warnings} />
        </div>
      )}
      {step === "analyzing" && <AnalyzeProgress done={progress.done} of={progress.of} onCancel={cancel} />}
      {step === "dashboard" && dashboard && <DashboardView dashboard={dashboard} />}
    </div>
  );
}
