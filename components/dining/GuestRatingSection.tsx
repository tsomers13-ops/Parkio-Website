"use client";

import { useEffect, useState } from "react";
import { StarRatingInput } from "@/components/dining/StarRatingInput";
import {
  fetchAggregate,
  fetchMyRating,
  ratingCountLabel,
  submitRating,
  type MyRatingView,
} from "@/lib/ratingsClient";
import { toDisplayAverage, type DiningRatingAggregate } from "@/lib/ratingsTypes";

/**
 * Guest Rating — Parkio's community rating for one permanent venue.
 *
 * Deliberately NOT the Parkio Score: that is Parkio's own editorial
 * assessment out of 10 and lives in its own block. The two are never merged,
 * never derived from each other, and are labelled explicitly.
 *
 * The venue page is statically generated, so ratings load client-side as
 * enhancement content. If they never arrive, the page is unaffected.
 */

type LoadState = "loading" | "ready" | "unavailable";
type SubmitState = "idle" | "submitting" | "success" | "error";

interface Props {
  venueKey: string;
  venueName: string;
}

function Average({ value }: { value: number | null }) {
  const display = toDisplayAverage(value);
  if (display === null) return null;
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="text-3xl font-semibold tabular-nums text-ink-900">{display.toFixed(1)}</span>
      <span aria-hidden="true" className="text-xl text-amber-500">★</span>
      <span className="sr-only">out of 5</span>
    </span>
  );
}

/** A dimension is shown only when somebody actually rated it. */
function Dimension({ label, average, count }: { label: string; average: number | null; count: number }) {
  const display = toDisplayAverage(average);
  if (count === 0 || display === null) return null;
  return (
    <div className="flex items-baseline justify-between gap-4 py-1">
      <dt className="text-sm text-ink-600">{label}</dt>
      <dd className="text-sm font-medium tabular-nums text-ink-900">
        {display.toFixed(1)}
        <span className="ml-1.5 text-xs font-normal text-ink-500">({ratingCountLabel(count)})</span>
      </dd>
    </div>
  );
}

export function GuestRatingSection({ venueKey, venueName }: Props) {
  const [load, setLoad] = useState<LoadState>("loading");
  const [aggregate, setAggregate] = useState<DiningRatingAggregate | null>(null);
  const [mine, setMine] = useState<MyRatingView | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [submit, setSubmit] = useState<SubmitState>("idle");
  // Captured before `mine` is replaced, so a first rating is never confirmed
  // with "updated" copy.
  const [lastAction, setLastAction] = useState<"created" | "updated" | null>(null);
  const [overall, setOverall] = useState<number | null>(null);
  const [taste, setTaste] = useState<number | null>(null);
  const [value, setValue] = useState<number | null>(null);
  const [quality, setQuality] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    // Both reads are safe: neither creates an identity cookie.
    void (async () => {
      const [agg, own] = await Promise.all([fetchAggregate(venueKey), fetchMyRating(venueKey)]);
      if (!active) return;
      if (agg.status === "unavailable") {
        setLoad("unavailable");
      } else {
        setAggregate(agg.aggregate);
        setLoad("ready");
      }
      if (own) {
        setMine(own);
        setOverall(own.overall);
        setTaste(own.taste);
        setValue(own.value);
        setQuality(own.quality);
      }
    })();
    return () => {
      active = false;
    };
  }, [venueKey]);

  // Ratings are an enhancement. If the service is down the block simply is
  // not there — showing "no guest ratings yet" would be a lie about the data.
  if (load === "unavailable") return null;

  const hasRatings = aggregate !== null && aggregate.ratingCount > 0;

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (overall === null || submit === "submitting") return;
    const wasUpdate = mine !== null;
    setSubmit("submitting");
    const result = await submitRating(venueKey, {
      overall,
      ...(taste !== null ? { taste } : {}),
      ...(value !== null ? { value } : {}),
      ...(quality !== null ? { quality } : {}),
    });
    if (result.status === "error") {
      // Selections are deliberately preserved so a retry is one tap.
      setSubmit("error");
      return;
    }
    setMine(result.rating);
    setLastAction(wasUpdate ? "updated" : "created");
    // The server response is authoritative — an update must not add a vote,
    // and only the server knows whether this was an insert or an update.
    if (result.aggregate) setAggregate(result.aggregate);
    setSubmit("success");
    setFormOpen(false);
  }

  return (
    <section
      aria-labelledby="guest-rating"
      className="mt-8 rounded-2xl border border-ink-100 bg-white px-5 py-5 shadow-soft"
    >
      <h2 id="guest-rating" className="text-sm font-semibold uppercase tracking-widest text-ink-500">
        Guest Rating
      </h2>

      {load === "loading" ? (
        // Reserves height so the page does not jump when ratings arrive.
        <div className="mt-3 h-9 w-40 animate-pulse rounded-lg bg-ink-100" aria-hidden="true" />
      ) : hasRatings && aggregate ? (
        <>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <Average value={aggregate.overallAverage} />
            <span className="text-sm text-ink-600">
              {ratingCountLabel(aggregate.ratingCount)} from Parkio guests
            </span>
          </div>
          <dl className="mt-3 divide-y divide-ink-50">
            <Dimension label="Taste" average={aggregate.tasteAverage} count={aggregate.tasteCount} />
            <Dimension label="Value" average={aggregate.valueAverage} count={aggregate.valueCount} />
            <Dimension label="Quality" average={aggregate.qualityAverage} count={aggregate.qualityCount} />
          </dl>
        </>
      ) : (
        <div className="mt-2">
          <p className="text-base font-medium text-ink-900">No guest ratings yet</p>
          <p className="mt-0.5 text-sm text-ink-600">Be the first to rate {venueName}.</p>
        </div>
      )}

      {mine && !formOpen && (
        <div className="mt-4 rounded-xl bg-ink-50 px-4 py-3">
          <p className="text-sm font-medium text-ink-900">Your rating</p>
          <p className="mt-0.5 text-sm text-ink-600">
            Overall {mine.overall}/5
            {mine.taste !== null && ` · Taste ${mine.taste}`}
            {mine.value !== null && ` · Value ${mine.value}`}
            {mine.quality !== null && ` · Quality ${mine.quality}`}
          </p>
        </div>
      )}

      {submit === "success" && !formOpen && (
        <p role="status" className="mt-3 text-sm font-medium text-accent-700">
          {lastAction === "updated"
            ? "Your rating has been updated."
            : "Thanks — your rating helps other park guests."}
        </p>
      )}

      {!formOpen && (
        <button
          type="button"
          onClick={() => {
            setFormOpen(true);
            setSubmit("idle");
          }}
          className="mt-4 min-h-[44px] rounded-full border border-ink-200 bg-white px-4 py-2 text-sm font-medium text-ink-800 shadow-soft transition hover:border-ink-300 hover:bg-ink-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-600"
        >
          {mine ? "Update your rating" : "Rate this restaurant"}
        </button>
      )}

      {formOpen && (
        <form onSubmit={onSubmit} className="mt-4 space-y-4 border-t border-ink-100 pt-4">
          <StarRatingInput name="overall" label="Overall" value={overall} onChange={setOverall} />
          <StarRatingInput name="taste" label="Taste" value={taste} onChange={setTaste} optional />
          <StarRatingInput name="value" label="Value" value={value} onChange={setValue} optional />
          <StarRatingInput name="quality" label="Quality" value={quality} onChange={setQuality} optional />

          {submit === "error" && (
            <p role="alert" className="text-sm font-medium text-red-700">
              We couldn&rsquo;t save your rating. Please try again.
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={overall === null || submit === "submitting"}
              className="min-h-[44px] rounded-full bg-accent-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-accent-700 disabled:cursor-not-allowed disabled:bg-ink-200 disabled:text-ink-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-600"
            >
              {submit === "submitting" ? "Saving…" : mine ? "Update rating" : "Submit rating"}
            </button>
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="min-h-[44px] px-2 text-sm font-medium text-ink-600 hover:text-ink-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-600"
            >
              Cancel
            </button>
            {overall === null && (
              <span className="text-xs text-ink-500">Overall is required</span>
            )}
          </div>
        </form>
      )}
    </section>
  );
}
