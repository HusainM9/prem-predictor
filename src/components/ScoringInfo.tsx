"use client";

/**
 * Shared scoring rules for the app. 
 */
export function ScoringInfo({ className }: { className?: string }) {
  return (
    <section
      className={`w-full max-w-md rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground ${className ?? ""}`}
    >
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-foreground">
        How scoring works
      </h2>
      <ol className="list-decimal list-inside space-y-2">
        <li>
          <strong className="text-foreground">Correct result</strong> (right outcome): You get{" "}
          <em>10 × locked odds</em> (e.g. odds 2.5 → 25 pts).
        </li>
        <li>
          <strong className="text-foreground">Exact score</strong> (result and score correct): You get the result
          points <em>plus</em> a bonus of 1.5× those points (e.g. 15 + 23 = 38 pts).
        </li>
        <li>
          <strong className="text-foreground">Wrong result</strong>: You lose your stake (−10 pts).
        </li>
        <li>
          <strong className="text-foreground">Game of the week</strong>: Vote for one match before the gameweek
          starts. Correct predictions on the most-voted match get an extra <strong className="text-foreground">+15 pts</strong>.
        </li>
        <li>
          <strong className="text-foreground">7+ correct results</strong> in a gameweek: <strong className="text-foreground">+10 pts</strong>.
        </li>
        <li>
          <strong className="text-foreground">All results correct</strong> in a gameweek: <strong className="text-foreground">+50 pts</strong>.
        </li>
        <li>
          <strong className="text-foreground">4+ exact scores</strong> in a gameweek: <strong className="text-foreground">+10 pts</strong>.
        </li>
      </ol>
      <p className="mt-2 text-xs text-muted-foreground">
        Odds are locked when the match kicks off. Stake is 10 pts per prediction.
      </p>
    </section>
  );
}
