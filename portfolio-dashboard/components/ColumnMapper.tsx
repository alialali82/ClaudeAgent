"use client";

import { useMemo, useState } from "react";
import type { SheetRows } from "@/lib/parse/excel";
import { detectColumns, guessColumns, parseSheet, type ColumnMap } from "@/lib/parse/normalize";
import type { Holding } from "@/lib/types";

type Props = {
  sheets: SheetRows[];
  onConfirm: (holdings: Holding[], warnings: string[]) => void;
  onBack: () => void;
};

type Choice = { ticker: string; shares: string; cost: string; account: string; date: string; costKind: "total" | "perShare"; headerRow: number };

const cellText = (v: unknown): string =>
  v instanceof Date ? v.toISOString().slice(0, 10) : v === null || v === undefined ? "" : String(v);

function initial(rows: unknown[][]): Choice {
  const m: ColumnMap = detectColumns(rows) ?? { ...guessColumns((rows[0] ?? []) as string[]), headerRow: 0 };
  const s = (n?: number) => (n === undefined ? "" : String(n));
  return { ticker: s(m.ticker), shares: s(m.shares), cost: s(m.cost), account: s(m.account), date: s(m.date), costKind: m.costKind ?? "total", headerRow: m.headerRow };
}

export function ColumnMapper({ sheets, onConfirm, onBack }: Props) {
  const [sheetIdx, setSheetIdx] = useState(0);
  const [choices, setChoices] = useState<Choice[]>(() => sheets.map((s) => initial(s.rows)));
  const sheet = sheets[sheetIdx];
  const c = choices[sheetIdx];
  const set = (patch: Partial<Choice>) => setChoices((all) => all.map((x, i) => (i === sheetIdx ? { ...x, ...patch } : x)));

  const width = useMemo(() => sheet.rows.reduce((w, r) => Math.max(w, Array.isArray(r) ? r.length : 0), 0), [sheet]);
  const header = (sheet.rows[c.headerRow] ?? []) as unknown[];
  const label = (i: number) => cellText(header[i]).trim() || `Column ${i + 1}`;
  const preview = sheet.rows.slice(c.headerRow + 1, c.headerRow + 6);
  const ready = c.ticker !== "" && c.shares !== "";

  const colSelect = (id: string, text: string, key: "ticker" | "shares" | "cost" | "account" | "date") => (
    <div className="field">
      <label htmlFor={id}>{text}</label>
      <select id={id} value={c[key]} onChange={(e) => set({ [key]: e.target.value })}>
        <option value="">— none —</option>
        {Array.from({ length: width }, (_, i) => (
          <option key={i} value={String(i)}>
            {label(i)}
          </option>
        ))}
      </select>
    </div>
  );

  function submit() {
    const n = (v: string) => (v === "" ? undefined : Number(v));
    const map: ColumnMap = { headerRow: c.headerRow, ticker: n(c.ticker), shares: n(c.shares), cost: n(c.cost), costKind: c.costKind, account: n(c.account), date: n(c.date) };
    const r = parseSheet(sheet.rows, map);
    onConfirm(r.holdings, r.warnings);
  }

  return (
    <section className="stack" aria-labelledby="map-h">
      <h1 id="map-h" className="brand">Match your columns</h1>
      <p className="muted">We guessed which column is which. Check them, then continue.</p>
      {sheets.length > 1 && (
        <div className="field" style={{ maxWidth: 320 }}>
          <label htmlFor="sheet">Sheet</label>
          <select id="sheet" value={sheetIdx} onChange={(e) => setSheetIdx(Number(e.target.value))}>
            {sheets.map((s, i) => (
              <option key={i} value={i}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="panel" style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
        {colSelect("map-ticker", "Ticker", "ticker")}
        {colSelect("map-shares", "Shares", "shares")}
        {colSelect("map-cost", "Cost", "cost")}
        <div className="field">
          <label htmlFor="map-kind">Cost type</label>
          <select id="map-kind" value={c.costKind} onChange={(e) => set({ costKind: e.target.value as Choice["costKind"] })}>
            <option value="total">Total</option>
            <option value="perShare">Per share</option>
          </select>
        </div>
        {colSelect("map-account", "Account", "account")}
        {colSelect("map-date", "Open date", "date")}
      </div>
      <div className="table-scroll" tabIndex={0} role="region" aria-label="Preview of the first rows">
        <table>
          <thead>
            <tr>
              {Array.from({ length: width }, (_, i) => (
                <th key={i} scope="col">
                  {label(i)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {preview.map((r, ri) => (
              <tr key={ri}>
                {Array.from({ length: width }, (_, i) => (
                  <td key={i}>{cellText((r as unknown[])[i])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!ready && <p className="warn">Choose a Ticker column and a Shares column to continue.</p>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" className="btn btn-primary" disabled={!ready} onClick={submit}>
          Continue
        </button>
        <button type="button" className="btn" onClick={onBack}>
          Back
        </button>
      </div>
    </section>
  );
}
