import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import TutoringWorkspaceBar from "./TutoringWorkspaceBar";

const learner = {
  id: "learner-1",
  name: "Ari Learner",
  email: "ari@example.com",
  role: "learner" as const,
};

function renderBar(
  overrides: Partial<React.ComponentProps<typeof TutoringWorkspaceBar>> = {},
) {
  return renderToStaticMarkup(
    <TutoringWorkspaceBar
      session={{ canManage: false, canEditOwnProgress: true }}
      sessionStatus="live"
      view="master"
      learnerId={null}
      selectedLearner={null}
      participants={[learner]}
      publishedVersion={0}
      followTutor
      canEdit={false}
      busy={false}
      notice={null}
      onSwitchWorkspace={vi.fn()}
      onToggleFollowTutor={vi.fn()}
      onApplyTutorUpdate={vi.fn()}
      onPublishTutorWorkspace={vi.fn()}
      {...overrides}
    />,
  );
}

describe("TutoringWorkspaceBar", () => {
  it("keeps workspace actions distinct from compact status badges", () => {
    const html = renderBar();

    expect(html).toContain('data-testid="tutoring-workspace-bar"');
    expect(html).toContain(">Tutor</button>");
    expect(html).toContain(">Mine</button>");
    expect(html).toContain("Following tutor");
    expect(html).toContain(">Live</span>");
    expect(html).toContain(">Read only</span>");
    expect(html).not.toContain("Tutor live workspace</span>");
    expect(html).not.toContain(">My workspace</button>");
    expect(html).not.toContain("pointer-events-none fixed");
  });

  it("shows a frozen reference as Session plus version and read-only status", () => {
    const html = renderBar({
      sessionStatus: "shared",
      view: "reference",
      publishedVersion: 3,
      followTutor: false,
    });

    expect(html).toContain(">Session</button>");
    expect(html).toContain(">Mine</button>");
    expect(html).toContain(">Version 3</span>");
    expect(html).toContain(">Read only</span>");
    expect(html).not.toContain("Following tutor");
  });

  it("renders tutor publishing and learner inspection controls without duplicate workspace labels", () => {
    const html = renderBar({
      session: { canManage: true, canEditOwnProgress: true },
      sessionStatus: "shared",
      view: "master",
      publishedVersion: 2,
      canEdit: true,
    });

    expect(html).toContain(">Tutor draft</button>");
    expect(html).toContain(">Reference</button>");
    expect(html).toContain("View learner…");
    expect(html).toContain("Publish update");
    expect(html).toContain(">Draft</span>");
    expect(html).not.toContain("Tutor draft workspace</span>");
    expect(html).not.toContain("Read only");
  });
});
