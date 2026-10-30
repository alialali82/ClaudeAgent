// The "universal" entry reads from a Blob/ArrayBuffer and works in both the
// browser bundle and Node (tests), unlike /browser (needs Web Workers) or /node.
import readXlsxFile from "read-excel-file/universal";
import { parseCsvText } from "./csv";

export const MAX_FILE_BYTES = 5 * 1024 * 1024;

export type SheetRows = { name: string; rows: unknown[][] };

export async function readFileRows(file: File): Promise<{ sheets: SheetRows[] }> {
  const name = file.name.toLowerCase();
  const isCsv = name.endsWith(".csv") || (!/\.[a-z0-9]+$/.test(name) && file.type === "text/csv");
  const isXlsx = name.endsWith(".xlsx");
  if (name.endsWith(".xls")) throw new Error("Save as .xlsx");
  if (!isCsv && !isXlsx) throw new Error("Unsupported file type");
  if (file.size > MAX_FILE_BYTES) throw new Error("File too large (max 5 MB)");

  if (isCsv) return { sheets: [{ name: "CSV", rows: parseCsvText(await file.text()) }] };

  try {
    const sheets = await readXlsxFile(file);
    return { sheets: sheets.map((s) => ({ name: s.sheet, rows: s.data as unknown[][] })) };
  } catch {
    throw new Error("Could not read this spreadsheet; is it a valid .xlsx file?");
  }
}
