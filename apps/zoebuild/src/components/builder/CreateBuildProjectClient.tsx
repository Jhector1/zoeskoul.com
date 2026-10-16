"use client";

import type {
  FormEvent,
} from "react";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  useRouter,
} from "next/navigation";

import {
  createStarterProjectSpecification,
  type ZoeBuildStarterKind,
} from "@/lib/build/starterProjectSpecifications";

type Props = {
  locale: string;
};

type CreatePayload = {
  ok?: boolean;

  project?: {
    buildProjectId?: string;
  };

  message?: string;
} | null;

type StarterOption = {
  id: ZoeBuildStarterKind;
  title: string;
  description: string;
  detail: string;
};

const STARTERS:
  readonly StarterOption[] = [
    {
      id:
        "website",

      title:
        "Website",

      description:
        "Business, landing page, portfolio, blog, or content site.",

      detail:
        "Fast website foundation",
    },

    {
      id:
        "web-app",

      title:
        "Web app",

      description:
        "Interactive frontend experience with a React foundation.",

      detail:
        "React + Vite",
    },

    {
      id:
        "storefront",

      title:
        "Storefront",

      description:
        "Commerce-ready experience with trusted cart and checkout boundaries.",

      detail:
        "Managed commerce",
    },
  ];

function errorMessage(
  payload: CreatePayload,
) {
  if (
    typeof payload?.message ===
      "string" &&
    payload.message.trim()
  ) {
    return payload.message;
  }

  return (
    "Project could not be created."
  );
}

export default function CreateBuildProjectClient({
  locale,
}: Props) {
  const router =
    useRouter();

  const [
    open,
    setOpen,
  ] =
    useState(false);

  const [
    name,
    setName,
  ] =
    useState("");

  const [
    starter,
    setStarter,
  ] =
    useState<ZoeBuildStarterKind>(
      "website",
    );

  const [
    submitting,
    setSubmitting,
  ] =
    useState(false);

  const [
    error,
    setError,
  ] =
    useState<string | null>(
      null,
    );

  const validName =
    name.trim().length > 0;

  const selectedTitle =
    useMemo(
      () =>
        STARTERS.find(
          (item) =>
            item.id === starter,
        )?.title ??
        "Website",
      [
        starter,
      ],
    );

  useEffect(
    () => {
      if (!open) {
        return;
      }

      const listener = (
        event: KeyboardEvent,
      ) => {
        if (
          event.key ===
            "Escape" &&
          !submitting
        ) {
          setOpen(false);
          setError(null);
        }
      };

      window.addEventListener(
        "keydown",
        listener,
      );

      return () =>
        window.removeEventListener(
          "keydown",
          listener,
        );
    },
    [
      open,
      submitting,
    ],
  );

  function close() {
    if (submitting) {
      return;
    }

    setOpen(false);
    setError(null);
  }

  async function submit(
    event:
      FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (
      submitting ||
      !validName
    ) {
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const specification =
        createStarterProjectSpecification(
          starter,
          name,
        );

      const response =
        await fetch(
          "/api/build/projects",
          {
            method:
              "POST",

            credentials:
              "same-origin",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                specification,
              }),
          },
        );

      const payload =
        await response
          .json()
          .catch(
            () => null,
          ) as CreatePayload;

      const buildProjectId =
        payload
          ?.project
          ?.buildProjectId;

      if (
        !response.ok ||
        payload?.ok !== true ||
        typeof buildProjectId !==
          "string" ||
        !buildProjectId.trim()
      ) {
        throw new Error(
          errorMessage(
            payload,
          ),
        );
      }

      router.push(
        `/${encodeURIComponent(
          locale,
        )}/projects/${encodeURIComponent(
          buildProjectId,
        )}`,
      );

      router.refresh();
    } catch (
      caught
    ) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Project could not be created.",
      );

      setSubmitting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="zb-create-project-trigger"
        onClick={() => {
          setOpen(true);
          setError(null);
        }}
      >
        <span
          aria-hidden="true"
          className="zb-create-project-plus"
        >
          +
        </span>

        New project
      </button>

      {open ? (
        <div
          className="zb-create-project-backdrop"
          role="presentation"
          onMouseDown={(
            event,
          ) => {
            if (
              event.target ===
                event.currentTarget
            ) {
              close();
            }
          }}
        >
          <section
            className="zb-create-project-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="zb-create-project-title"
            aria-describedby="zb-create-project-description"
          >
            <div className="zb-create-project-heading">
              <div>
                <div className="ui-section-kicker">
                  Zoé Build
                </div>

                <h2
                  id="zb-create-project-title"
                  className="zb-create-project-title"
                >
                  Create a project
                </h2>

                <p
                  id="zb-create-project-description"
                  className="zb-create-project-description"
                >
                  Choose a starting foundation.
                  Once it opens, tell Zoé what
                  you want to build.
                </p>
              </div>

              <button
                type="button"
                className="zb-create-project-close"
                aria-label="Close create project"
                onClick={close}
                disabled={submitting}
              >
                ×
              </button>
            </div>

            <form
              className="zb-create-project-form"
              onSubmit={submit}
            >
              <label className="zb-create-project-label">
                Project name

                <input
                  autoFocus
                  required
                  maxLength={80}
                  value={name}
                  onChange={(
                    event,
                  ) => {
                    setName(
                      event.target.value,
                    );

                    setError(null);
                  }}
                  placeholder="My new website"
                  className="zb-create-project-input"
                />
              </label>

              <fieldset className="zb-create-project-starters">
                <legend>
                  Starting point
                </legend>

                <div className="zb-create-project-starter-grid">
                  {STARTERS.map(
                    (
                      option,
                    ) => {
                      const active =
                        starter ===
                        option.id;

                      return (
                        <label
                          key={
                            option.id
                          }
                          className={
                            active
                              ? "zb-create-project-starter is-active"
                              : "zb-create-project-starter"
                          }
                        >
                          <input
                            type="radio"
                            name="starter"
                            value={
                              option.id
                            }
                            checked={
                              active
                            }
                            onChange={() => {
                              setStarter(
                                option.id,
                              );

                              setError(
                                null,
                              );
                            }}
                          />

                          <span className="zb-create-project-starter-title">
                            {
                              option.title
                            }
                          </span>

                          <span className="zb-create-project-starter-description">
                            {
                              option.description
                            }
                          </span>

                          <span className="zb-create-project-starter-detail">
                            {
                              option.detail
                            }
                          </span>
                        </label>
                      );
                    },
                  )}
                </div>
              </fieldset>

              <div className="zb-create-project-selection">
                <span>
                  Starting with
                </span>

                <strong>
                  {selectedTitle}
                </strong>
              </div>

              {error ? (
                <div
                  className="zb-create-project-error"
                  role="alert"
                >
                  {error}
                </div>
              ) : null}

              <div className="zb-create-project-actions">
                <button
                  type="button"
                  className="zb-create-project-secondary"
                  onClick={close}
                  disabled={submitting}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="zb-create-project-primary"
                  disabled={
                    submitting ||
                    !validName
                  }
                >
                  {submitting
                    ? "Creating…"
                    : "Create project"}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </>
  );
}
