import type { ReactNode } from "react";

export function PageHeader(props: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        {props.eyebrow ? (
          <p className="eyebrow">{props.eyebrow}</p>
        ) : null}
        <h1>{props.title}</h1>
        {props.description ? (
          <p className="page-description">{props.description}</p>
        ) : null}
      </div>
      {props.actions ? (
        <div className="page-actions">{props.actions}</div>
      ) : null}
    </header>
  );
}

export function Panel(props: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${props.className ?? ""}`.trim()}>
      {props.title || props.description || props.actions ? (
        <div className="panel-header">
          <div>
            {props.title ? <h2>{props.title}</h2> : null}
            {props.description ? <p>{props.description}</p> : null}
          </div>
          {props.actions ? (
            <div className="panel-actions">{props.actions}</div>
          ) : null}
        </div>
      ) : null}
      {props.children}
    </section>
  );
}

export function StatCard(props: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <article className="stat-card">
      <span className="stat-label">{props.label}</span>
      <strong className="stat-value">{props.value}</strong>
      {props.detail ? (
        <span className="stat-detail">{props.detail}</span>
      ) : null}
    </article>
  );
}

export function PageState(props: {
  kind: "loading" | "error" | "empty";
  title: string;
  message?: string;
  action?: ReactNode;
}) {
  return (
    <section className="page-state" aria-busy={props.kind === "loading"}>
      {props.kind === "loading" ? (
        <span className="loading-dot" aria-hidden="true" />
      ) : null}
      <p className="eyebrow">
        {props.kind === "error" ? "Something went wrong" : "ZoeSkoul Admin"}
      </p>
      <h1>{props.title}</h1>
      {props.message ? <p>{props.message}</p> : null}
      {props.action}
    </section>
  );
}

export function EmptyState(props: {
  children: ReactNode;
}) {
  return <div className="empty-state">{props.children}</div>;
}

export function Badge(props: {
  children: ReactNode;
  tone?: "neutral" | "good" | "warn" | "danger";
}) {
  return (
    <span className={`badge badge-${props.tone ?? "neutral"}`}>
      {props.children}
    </span>
  );
}
