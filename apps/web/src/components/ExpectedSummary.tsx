
export default function ExpectedSummary({ result }: { result: any }) {
  const exp = result?.expected;
  if (!exp) return null;

  const card = "mt-2 rounded-xl border border-white/10 bg-black/20 p-3 text-xs";
  const row = "flex items-center justify-between gap-2";
  const label = "text-white/60 font-extrabold";
  const mono = "font-mono text-white/85";

  if (exp.kind === "numeric") {
    return (
      <div className={card}>
        <div className={row}>
          <div className={label}>Expected</div>
          <div className={mono}>
            {exp.value}
            {exp.tolerance ? ` ± ${exp.tolerance}` : ""}
          </div>
        </div>

        <div className={row + " mt-1"}>
          <div className={label}>You</div>
          <div className={mono}>
            {exp.debug?.receivedValue ?? "—"}
          </div>
        </div>

        <div className={row + " mt-1"}>
          <div className={label}>Δ</div>
          <div className={mono}>
            {typeof exp.debug?.delta === "number" ? exp.debug.delta.toFixed(4) : "—"}
          </div>
        </div>

        <DetailsBlock value={exp} />
      </div>
    );
  }

  if (exp.kind === "single_choice") {
    return (
      <div className={card}>
        <div className={row}>
          <div className={label}>Chosen</div>
          <div className={mono}>{exp.debug?.chosen ?? "—"}</div>
        </div>
        <div className={row + " mt-1"}>
          <div className={label}>Correct</div>
          <div className={mono}>{exp.optionId ?? "—"}</div>
        </div>
        <DetailsBlock value={exp} />
      </div>
    );
  }

  if (exp.kind === "multi_choice") {
    return (
      <div className={card}>
        <div className={row}>
          <div className={label}>Chosen</div>
          <div className={mono}>{(exp.debug?.chosen ?? []).join(", ") || "—"}</div>
        </div>
        <div className={row + " mt-1"}>
          <div className={label}>Correct</div>
          <div className={mono}>{(exp.optionIds ?? []).join(", ") || "—"}</div>
        </div>
        {(exp.debug?.missing?.length || exp.debug?.extra?.length) ? (
          <div className="mt-2 text-white/70">
            {exp.debug?.missing?.length ? (
              <div><span className="font-extrabold">Missing:</span> {exp.debug.missing.join(", ")}</div>
            ) : null}
            {exp.debug?.extra?.length ? (
              <div><span className="font-extrabold">Extra:</span> {exp.debug.extra.join(", ")}</div>
            ) : null}
          </div>
        ) : null}
        <DetailsBlock value={exp} />
      </div>
    );
  }

  if (exp.kind === "vector_drag_target") {
    return (
      <div className={card}>
        <div className={row}>
          <div className={label}>Target a*</div>
          <div className={mono}>
            ({exp.targetA?.x ?? "—"}, {exp.targetA?.y ?? "—"})
          </div>
        </div>
        <div className={row + " mt-1"}>
          <div className={label}>You</div>
          <div className={mono}>
            {exp.debug?.receivedA
              ? `(${exp.debug.receivedA.x}, ${exp.debug.receivedA.y})`
              : "—"}
          </div>
        </div>
        <div className={row + " mt-1"}>
          <div className={label}>Tolerance</div>
          <div className={mono}>± {exp.tolerance}</div>
        </div>
        <DetailsBlock value={exp} />
      </div>
    );
  }

  if (exp.kind === "vector_drag_dot") {
    return (
      <div className={card}>
        <div className={row}>
          <div className={label}>Target a·b</div>
          <div className={mono}>
            {exp.targetDot} ± {exp.tolerance}
          </div>
        </div>
        <div className={row + " mt-1"}>
          <div className={label}>Your a·b</div>
          <div className={mono}>
            {typeof exp.debug?.dot === "number" ? exp.debug.dot.toFixed(4) : "—"}
          </div>
        </div>
        <div className={row + " mt-1"}>
          <div className={label}>|a|</div>
          <div className={mono}>
            {typeof exp.debug?.aMag === "number" ? exp.debug.aMag.toFixed(4) : "—"} (min {exp.minMag})
          </div>
        </div>
        <DetailsBlock value={exp} />
      </div>
    );
  }

  // fallback
  return (
    <div className={card}>
      <div className="text-white/70">Expected data available.</div>
        <DetailsBlock value={exp} />
    </div>
  );
}
function DetailsBlock({ value }: { value: any }) {
  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-white/60 hover:text-white/80">
        Details
      </summary>
      <pre className="mt-2 whitespace-pre-wrap break-words text-[11px] text-white/75">
        {JSON.stringify(value, null, 2)}
      </pre>
    </details>
  );
}