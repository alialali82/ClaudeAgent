"use client";

import { useRef, useState } from "react";
import { ApiError, errorText, extractFile } from "@/lib/api/client";
import { classifyFile, parseSavedHoldings, sizeProblem } from "@/lib/files";
import { MAX_UPLOAD_MB } from "@/lib/limits";
import { readFileRows, type SheetRows } from "@/lib/parse/excel";
import type { Holding } from "@/lib/types";

type Props = {
  onSheets: (sheets: SheetRows[]) => void;
  onHoldings: (holdings: Holding[], warnings: string[], source: "ai" | "file") => void;
  onManual: () => void;
  getToken: () => Promise<string>;
};

export function UploadStep({ onSheets, onHoldings, onManual, getToken }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [focused, setFocused] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const working = useRef(false);

  async function handle(file: File) {
    if (working.current) return;
    working.current = true;
    try {
      await run(file);
    } finally {
      working.current = false;
    }
  }

  async function run(file: File) {
    setError(null);
    const kind = classifyFile(file);
    const tooBig = sizeProblem(file, kind);
    if (tooBig) return setError(tooBig);
    try {
      if (file.name.toLowerCase().endsWith(".xls")) throw new Error("Save as .xlsx");
      if (!kind) return setError("That file type isn't supported. Use .xlsx, .csv, .json, a PNG/JPEG/WebP image or a PDF.");
      setBusy(true);
      if (kind === "sheet") {
        const { sheets } = await readFileRows(file);
        onSheets(sheets);
      } else if (kind === "json") {
        const holdings = parseSavedHoldings(await file.text());
        if (!holdings) return setError("That doesn't look like a saved holdings file (max 100 holdings, shares above 0).");
        onHoldings(holdings, [], "file");
      } else {
        const token = await getToken();
        const r = await extractFile(file, token);
        onHoldings(r.holdings, r.warnings, "ai");
      }
    } catch (e) {
      if (e instanceof Error && e.name === "TurnstileSuperseded") return;
      if (e instanceof ApiError) setError(errorText(e.code));
      else if (e instanceof Error && "code" in e && typeof e.code === "string") setError(errorText(e.code));
      else setError(e instanceof Error ? e.message : errorText(""));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <section className="stack" aria-labelledby="upload-h">
      <h1 id="upload-h" className="brand">Your portfolio</h1>
      <div
        className="drop"
        data-over={over}
        data-focused={focused ? "true" : undefined}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const f = e.dataTransfer.files?.[0];
          if (working.current) return;
          setNote((e.dataTransfer.files?.length ?? 0) > 1 ? "Only the first file was used" : null);
          if (f) void handle(f);
        }}
      >
        <p>Drop a holdings file here</p>
        <p className="muted">.xlsx, .csv, saved .json, screenshot (PNG/JPEG/WebP) or PDF, up to {MAX_UPLOAD_MB} MB</p>
        <p style={{ marginTop: 12 }}>
          <label className="btn btn-primary" data-focused={focused ? "true" : undefined} style={{ display: "inline-flex", alignItems: "center", cursor: "pointer" }}>
            Choose a file
            <input
              ref={input}
              type="file"
              className="sr-only"
              accept=".xlsx,.csv,.json,image/png,image/jpeg,image/webp,application/pdf"
              disabled={busy}
              onFocus={(e) => setFocused(e.target.matches(":focus-visible"))}
              onBlur={() => setFocused(false)}
              onChange={(e) => {
                const f = e.target.files?.[0];
                setNote(null);
                if (f) void handle(f);
              }}
            />
          </label>
        </p>
      </div>
      <div role="status" aria-live="polite">
        {busy && <p>Reading your file…</p>}
      </div>
      {note && <p className="notice">{note}</p>}
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
      <p>
        <button type="button" className="btn" onClick={onManual}>
          Type holdings manually
        </button>
      </p>
      <p className="muted">
        Spreadsheets are read in your browser. Images and PDFs are sent to be read by AI and discarded. Nothing is stored.
      </p>
    </section>
  );
}
