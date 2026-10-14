import { NextResponse } from "next/server";

export const READ_ONLY_DERIVED_ARTIFACT = "READ_ONLY_DERIVED_ARTIFACT";

export function readOnlyDerivedArtifactResponse() {
  return NextResponse.json(
    {
      error: READ_ONLY_DERIVED_ARTIFACT,
      message:
        ".curriculum-build artifacts are generated and read-only. Edit canonical .curriculum-drafts source instead.",
    },
    { status: 405 },
  );
}
