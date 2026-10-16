"use client";

import {
  ProjectPublishIcon,
} from "./ProjectTopbarIcons";

import {
  useState,
} from "react";

export type PublishedDeploymentView =
  Readonly<{
    deploymentId: string;
    sourceVersion: number;
    artifactHash: string;
    deployedAt: string;
    publicUrl: string;
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

  async function publish() {
    if (publishing) {
      return;
    }

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
            : "Project could not be published.",
        );
      }

      setDeployment(
        payload.deployment,
      );

      setMessage(
        `Published v${payload.deployment.sourceVersion}`,
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
          View site
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
