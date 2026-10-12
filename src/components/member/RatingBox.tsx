"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Star } from "lucide-react";
import { rateWorkAction } from "@/lib/member/actions";

/**
 * The stars: what readers of this site think of a work, and (when signed in) a way to give your own rating. Tapping the star
 * you already gave takes the rating back. The average is in the page text, so it reads without the script too.
 */
export function RatingBox({ work, sum, count, mine, signedIn, next }: { work: number; sum: number; count: number; mine: number; signedIn: boolean; next: string }) {
  const [state, setState] = useState({ sum, count, mine });
  const [hover, setHover] = useState(0);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const avg = state.count > 0 ? state.sum / state.count : 0;
  const shown = hover || (signedIn && state.mine ? state.mine : Math.round(avg));

  const rate = (v: number) => {
    setError("");
    const value = v === state.mine ? 0 : v; // the same star again takes it back
    const before = state;
    // show the change at once; the server's answer replaces it
    setState({ sum: state.sum - state.mine + value, count: state.count + (value && !state.mine ? 1 : !value && state.mine ? -1 : 0), mine: value });
    start(async () => {
      const r = await rateWorkAction({ work, value });
      if (!r.ok) {
        setState(before);
        setError(r.message);
        return;
      }
      setState({ sum: r.sum, count: r.count, mine: r.mine });
    });
  };

  return (
    <section aria-label="Reader rating" className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <div className="flex items-center" role={signedIn ? "radiogroup" : "img"} aria-label={signedIn ? "Your rating" : state.count ? `Rated ${avg.toFixed(1)} out of 5 by ${state.count} readers` : "Not rated yet"} onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => {
          const filled = n <= shown;
          const star = <Star className={`h-6 w-6 transition ${filled ? "fill-warn text-warn" : "text-muted/50"}`} aria-hidden="true" />;
          return signedIn ? (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={state.mine === n}
              aria-label={`${n} star${n === 1 ? "" : "s"}`}
              disabled={pending}
              onClick={() => rate(n)}
              onMouseEnter={() => setHover(n)}
              onFocus={() => setHover(n)}
              onBlur={() => setHover(0)}
              className="grid h-10 w-9 place-items-center rounded-lg hover:scale-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            >
              {star}
            </button>
          ) : (
            <span key={n} className="grid h-8 w-7 place-items-center">
              {star}
            </span>
          );
        })}
      </div>
      <p className="text-sm text-muted">
        {state.count > 0 ? (
          <>
            <b className="text-text">{avg.toFixed(1)}</b> out of 5 · {state.count.toLocaleString("en-US")} {state.count === 1 ? "rating" : "ratings"} from LustPages readers
          </>
        ) : (
          "No ratings from LustPages readers yet."
        )}
        {signedIn && state.mine > 0 && <span className="ml-2">Your rating: {state.mine}</span>}
        {!signedIn && (
          <>
            {" "}
            <Link href={`/login?next=${encodeURIComponent(next)}`} className="text-accent underline underline-offset-2">Sign in to rate</Link>
          </>
        )}
      </p>
      {error && (
        <p role="alert" className="basis-full text-sm text-bad">
          {error}
        </p>
      )}
    </section>
  );
}
