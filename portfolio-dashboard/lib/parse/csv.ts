import Papa from "papaparse";

/** Parse CSV text (delimiter `,` `;` or tab auto-detected) into string rows, skipping empty lines. */
export function parseCsvText(text: string): string[][] {
  const clean = text.replace(/^﻿/, "");
  const result = Papa.parse<string[]>(clean, {
    delimitersToGuess: [",", ";", "\t"],
    skipEmptyLines: "greedy",
  });
  return result.data.filter((r) => Array.isArray(r));
}
