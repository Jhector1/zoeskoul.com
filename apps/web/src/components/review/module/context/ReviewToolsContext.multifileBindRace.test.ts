import { describe, expect, it } from "vitest";

import {
  codeInputRegistrationKey,
  shouldAutoRebindCodeInputRegistration,
  shouldRetryCodeInputBindAfterRegistryChange,
} from "./ReviewToolsContext";

function makeWorkspace(includeCompanion: boolean) {
  const nodes: any[] = [
    {
      id: "file:main.py",
      kind: "file",
      name: "main.py",
      parentId: null,
      content: "print('learner edit')\\n",
      createdAt: 0,
      updatedAt: 0,
    },
  ];

  if (includeCompanion) {
    nodes.push(
      {
        id: "folder:models",
        kind: "folder",
        name: "models",
        parentId: null,
        createdAt: 0,
        updatedAt: 0,
      },
      {
        id: "file:models/transaction.py",
        kind: "file",
        name: "transaction.py",
        parentId: "folder:models",
        content: "class Transaction:\\n    pass\\n",
        createdAt: 0,
        updatedAt: 0,
      },
    );
  }

  return {
    version: 2,
    language: "python",
    nodes,
    openTabs: ["file:main.py"],
    expanded: [],
    activeFileId: "file:main.py",
    entryFileId: "file:main.py",
    stdin: "",
  } as any;
}

function makeArgs(workspace: any) {
  return {
    lang: "python",
    code: "print('learner edit')\\n",
    workspace,
    exerciseKey: "practice:constructors-and-object-state",
    ownerCardId: "practice-card",
    onPatch: () => undefined,
    userEdited: true,
    workspaceOrigin: "saved",
  } as any;
}

describe("multi-file protected registration bind race", () => {
  it("rebinds a route-owned exercise even before the runtime bound key catches up", () => {
    expect(
      shouldAutoRebindCodeInputRegistration({
        currentBound: null,
        externalBoundId: "practice:constructors-and-object-state",
        targetKey: "practice:constructors-and-object-state",
        previousKey: "one-file",
        nextKey: "multi-file",
      }),
    ).toBe(true);
  });

  it("still rebinds when the runtime bound key already matches", () => {
    expect(
      shouldAutoRebindCodeInputRegistration({
        currentBound: "practice:constructors-and-object-state",
        externalBoundId: null,
        targetKey: "practice:constructors-and-object-state",
        previousKey: "one-file",
        nextKey: "multi-file",
      }),
    ).toBe(true);
  });

  it("does not rebind an unrelated unbound registration", () => {
    expect(
      shouldAutoRebindCodeInputRegistration({
        currentBound: null,
        externalBoundId: "practice:other",
        targetKey: "practice:constructors-and-object-state",
        previousKey: "one-file",
        nextKey: "multi-file",
      }),
    ).toBe(false);
  });

  it("detects an in-flight one-file bind becoming stale after multi-file reconciliation", () => {
    const captured = makeArgs(makeWorkspace(false));
    const latest = makeArgs(makeWorkspace(true));

    expect(codeInputRegistrationKey(captured)).not.toBe(
      codeInputRegistrationKey(latest),
    );
    expect(
      shouldRetryCodeInputBindAfterRegistryChange({
        captured,
        latest,
      }),
    ).toBe(true);
  });

  it("does not retry when the semantic registration is unchanged", () => {
    const captured = makeArgs(makeWorkspace(true));
    const latest = makeArgs(makeWorkspace(true));

    expect(
      shouldRetryCodeInputBindAfterRegistryChange({
        captured,
        latest,
      }),
    ).toBe(false);
  });
});
