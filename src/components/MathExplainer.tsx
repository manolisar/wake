// "How the math works" panel — copy lifted verbatim from the design artifact.
export function MathExplainer() {
  return (
    <div className="rounded-xl border border-line bg-surface px-[1.1rem] py-4">
      <h2 className="mb-2.5 text-[0.6rem] font-bold uppercase tracking-[1.2px] text-muted">
        How the math works
      </h2>
      <div className="space-y-2 text-[0.72rem] leading-[1.55] text-muted">
        <p>
          Each port leg solves over its passage <b className="text-ink">Distance</b> against the
          time since the previous port’s <b className="text-ink">FAW</b> (Full Away). Timestamps
          convert to UTC via the <b className="text-indigo">UTC ±</b> offset, so timezone changes
          are exact.
        </p>
        <p>
          <b className="text-cyan-deep">SPD</b> mode: enter the times → <b className="text-ink">Speed</b>{' '}
          is computed. <b className="text-cyan-deep">TIME</b> mode: enter a target speed →{' '}
          <b className="text-ink">ETA</b> is computed.
        </p>
        <p>
          <b className="text-indigo">Open Loop</b> (HH:MM) is the scrubber open-loop running time
          per passage — it accrues only in <b className="text-ink">Sea Condition</b> (environmental
          operations allowed). <b className="text-ink">Port Condition</b> — near land, MPAs, ports or
          restricted passages — allows none. The <b className="text-indigo">Sea Condition</b> total
          sums it across the whole sail. <b className="text-ink">Daylight</b> = sunset − sunrise.
        </p>
      </div>
    </div>
  );
}
