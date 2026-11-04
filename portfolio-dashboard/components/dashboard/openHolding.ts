/**
 * Scrolls to a holding card (`#t-TICKER`) and tells the Holdings section to open it.
 * Holdings listens for the `dash:open` CustomEvent (detail = ticker) on the document.
 */
export function openHolding(ticker: string): void {
  if (typeof document === "undefined") return;
  document.getElementById(`t-${ticker}`)?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  document.dispatchEvent(new CustomEvent<string>("dash:open", { detail: ticker, bubbles: true }));
}
