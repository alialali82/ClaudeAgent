"use client";

type Props = { done: number; of: number; onCancel: () => void };

export function AnalyzeProgress({ done, of, onCancel }: Props) {
  const known = of > 0;
  return (
    <section className="stack" aria-labelledby="progress-h">
      <h1 id="progress-h" className="brand">Analyzing your portfolio</h1>
      <div
        role="progressbar"
        aria-label="Analysis progress"
        aria-valuemin={0}
        aria-valuemax={known ? of : undefined}
        aria-valuenow={known ? done : undefined}
        className="bar"
      >
        <div style={{ width: known ? `${Math.min(100, (done / of) * 100)}%` : "8%" }} />
      </div>
      <p className="mono" aria-live="polite">
        {known ? `${done} of ${of} tickers` : "Starting…"}
      </p>
      <button type="button" className="btn" onClick={onCancel}>
        Cancel
      </button>
    </section>
  );
}
