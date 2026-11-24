"use client";

import {
  ProjectPublishIcon,
} from "./ProjectTopbarIcons";

import {
  useState,
  useEffect,
  useRef,
} from "react";

export type PublishedDeploymentView =
  Readonly<{
    deploymentId: string;
    sourceVersion: number;
    artifactHash: string;
    deployedAt: string;
    publicUrl: string;
    privatePilot?: true;
  }>;

type PublishPayload =
  | {
      ok: true;

      deployment:
        PublishedDeploymentView &
        Readonly<{
          reused: boolean;
        }>;
    }
  | {
      ok: false;
      code?: string;
      message?: string;
    };

function privatePublishMessage(code?: string): string {
  switch (code) {
    case "BUILD_PILOT_NOT_ENTITLED_OR_NOT_SELECTED": return "Private publishing is not authorized for this project revision.";
    case "BUILD_PILOT_SOURCE_OR_STACK_INVALID":
    case "BUILD_PILOT_SOURCE_CHANGED": return "The saved revision changed during publishing. Save your project and retry.";
    case "BUILD_RATE_LIMITED": return "Too many publish attempts. Try again later.";
    case "BUILD_PILOT_STORAGE_CONFIG_FAILED":
    case "BUILD_PILOT_STAGE_ARTIFACT_FAILED":
    case "BUILD_PILOT_READBACK_FAILED": return "Publishing storage verification failed. The previous deployment is unchanged.";
    case "BUILD_PILOT_COMPILE_FAILED": return "The production build failed. The previous deployment is unchanged.";
    case "BUILD_PILOT_DEPLOYMENT_STATUS_FAILED": return "The private publishing host is unavailable. Check the deployment connection.";
    case "BUILD_PILOT_ACTIVATE_FAILED": return "The new website did not confirm activation. Check the current private deployment before retrying.";
    default: return "Project could not be published.";
  }
}

export function PublishProjectButton(
  props: {
    buildProjectId:
      string;

    initialDeployment?:
      PublishedDeploymentView | null;
  },
) {
  const [
    publishing,
    setPublishing,
  ] =
    useState(false);

  const [
    deployment,
    setDeployment,
  ] =
    useState<
      PublishedDeploymentView | null
    >(
      props.initialDeployment ??
        null,
    );

  const [
    message,
    setMessage,
  ] =
    useState<
      string | null
    >(
      props.initialDeployment
        ? `Published v${props.initialDeployment.sourceVersion}`
        : null,
    );

  const publishAttempt = useRef(0);

  useEffect(() => {
    const attempt = publishAttempt.current;
    if (process.env.NODE_ENV !== "development" || window.location.origin !== "http://localhost:3004") return;
    const controller = new AbortController();
    let active = true;
    fetch(`/api/build/projects/${encodeURIComponent(props.buildProjectId)}/publish`, {
      credentials: "same-origin", cache: "no-store", signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok) return;
      const payload = await response.json();
      if (active && attempt === publishAttempt.current && payload.ok && payload.deployment?.privatePilot === true && payload.deployment.publicUrl === "http://127.0.0.1:33105/") {
        setDeployment(payload.deployment);
        setMessage(`Private deployment v${payload.deployment.sourceVersion}`);
      }
    }).catch(() => {});
    return () => { active = false; controller.abort(); };
  }, [props.buildProjectId]);

  async function publish() {
    if (publishing) {
      return;
    }

    publishAttempt.current++;
    setPublishing(true);
    setMessage(null);

    try {
      const response =
        await fetch(
          `/api/build/projects/${encodeURIComponent(
            props.buildProjectId,
          )}/publish`,
          {
            method:
              "POST",

            credentials:
              "same-origin",
          },
        );

      const payload =
        await response
          .json()
          .catch(
            () => null,
          ) as
          | PublishPayload
          | null;

      if (
        !response.ok ||
        !payload ||
        !payload.ok
      ) {
        throw new Error(
          payload &&
          !payload.ok &&
          payload.message
            ? payload.message
            : privatePublishMessage(payload && !payload.ok ? payload.code : undefined),
        );
      }

      setDeployment(
        payload.deployment,
      );

      setMessage(
        payload.deployment.privatePilot
          ? `Private deployment v${payload.deployment.sourceVersion}`
          : `Published v${payload.deployment.sourceVersion}`,
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Project could not be published.",
      );
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div
      className="zb-project-modebar-actions"
      aria-live="polite"
    >
      {message ? (
        <span
          className="zb-project-publish-status"
          title={message}
        >
          {message}
        </span>
      ) : null}

      {deployment ? (
        <a
          className="zb-project-published-link"
          href={deployment.publicUrl}
          target="_blank"
          rel="noreferrer"
        >
          {deployment.privatePilot ? "View private site" : "View site"}
        </a>
      ) : null}

      <button
        type="button"
        className="zb-project-publish-button"
        disabled={publishing}
        onClick={publish}
      >
          <ProjectPublishIcon className="zb-project-publish-icon" />
        {publishing
          ? "Publishing…"
          : "Publish"}
      </button>
    </div>
  );
}
