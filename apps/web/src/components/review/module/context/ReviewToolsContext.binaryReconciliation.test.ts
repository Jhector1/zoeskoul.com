import { describe, expect, it } from "vitest";

import {
  codeInputRegistrationKey,
  reconcileProtectedCodeInputWorkspace,
} from "./ReviewToolsContext";

const binary = {
  encoding: "base64" as const,
  data: "AAECAwQ=",
  mimeType: "image/png",
  sizeBytes: 5,
};

function workspace(args: {
  index: string;
  profile: "binary" | "blank" | "html";
  active?: "index" | "profile";
}) {
  const active = args.active ?? "index";

  return {
    version: 2,
    language: "web",
    nodes: [
      {
        id: "index",
        kind: "file",
        name: "index.html",
        parentId: null,
        content: args.index,
      },
      {
        id: "images",
        kind: "folder",
        name: "images",
        parentId: null,
      },
      {
        id: "profile",
        kind: "file",
        name: "profile.png",
        parentId: "images",
        content:
          args.profile === "html"
            ? "<!doctype html><h1>Student Profile</h1>"
            : "",
        ...(args.profile === "binary" ? { binary } : {}),
      },
    ],
    openTabs: active === "profile" ? ["index", "profile"] : ["index"],
    activeFileId: active,
    entryFileId: "index",
    stdin: "",
    expanded: ["images"],
    leftPct: active === "profile" ? 40 : 26,
  } as any;
}

function registrationArgs(workspaceValue: any) {
  return {
    exerciseKey: "html-images",
    lang: "web",
    code: "<h1>Profile</h1>",
    workspace: workspaceValue,
    onPatch: () => undefined,
  } as any;
}

describe("ReviewTools canonical binary reconciliation", () => {
  it("keeps view-only workspace state out of registration identity", () => {
    expect(
      codeInputRegistrationKey(
        registrationArgs(
          workspace({
            index: "<h1>Profile</h1>",
            profile: "binary",
            active: "index",
          }),
        ),
      ),
    ).toBe(
      codeInputRegistrationKey(
        registrationArgs(
          workspace({
            index: "<h1>Profile</h1>",
            profile: "binary",
            active: "profile",
          }),
        ),
      ),
    );
  });

  it("distinguishes binary bytes from a text placeholder", () => {
    expect(
      codeInputRegistrationKey(
        registrationArgs(
          workspace({
            index: "<h1>Profile</h1>",
            profile: "binary",
          }),
        ),
      ),
    ).not.toBe(
      codeInputRegistrationKey(
        registrationArgs(
          workspace({
            index: "<h1>Profile</h1>",
            profile: "blank",
          }),
        ),
      ),
    );
  });

  it("preserves learner HTML but canonical binary wins its exact path", () => {
    const previous = workspace({
      index: "<h1>My learner edit</h1>",
      profile: "html",
      active: "profile",
    });
    const incoming = workspace({
      index: "<h1>Canonical starter</h1>",
      profile: "binary",
      active: "index",
    });

    const reconciled = reconcileProtectedCodeInputWorkspace({
      previous,
      incoming,
    });

    const index = reconciled?.nodes.find(
      (node: any) => node.kind === "file" && node.name === "index.html",
    );
    const profile = reconciled?.nodes.find(
      (node: any) => node.kind === "file" && node.name === "profile.png",
    );

    expect(index?.kind).toBe("file");
    expect(profile?.kind).toBe("file");

    if (!index || index.kind !== "file") {
      throw new Error("index.html file node missing");
    }
    if (!profile || profile.kind !== "file") {
      throw new Error("profile.png file node missing");
    }

    expect(index.content).toBe("<h1>My learner edit</h1>");
    expect(profile.content).toBe("");
    expect(profile.binary).toEqual(binary);
  });
});
