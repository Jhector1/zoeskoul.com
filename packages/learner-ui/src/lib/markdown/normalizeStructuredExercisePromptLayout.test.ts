import { describe, expect, it } from "vitest";

import {
  normalizeStructuredExercisePromptLayout,
} from "./normalizeMath";

describe("normalizeStructuredExercisePromptLayout", () => {
  it("promotes later inline Task and Expected result labels to standalone blocks", () => {
    const source =
      "**Problem**\n" +
      "A campus map asks a venue service for the available locations. " +
      "**Task** Create a request object and a response object. " +
      "**Expected result** The source models them separately.";

    expect(normalizeStructuredExercisePromptLayout(source)).toBe(
      "**Problem**\n\n" +
      "A campus map asks a venue service for the available locations.\n\n" +
      "**Task**\n\n" +
      "Create a request object and a response object.\n\n" +
      "**Expected result**\n\n" +
      "The source models them separately.",
    );
  });

  it("is idempotent for already block-structured prompts", () => {
    const source = [
      "**Problem**",
      "",
      "A campus map needs venue data.",
      "",
      "**Task**",
      "",
      "Create request and response objects.",
      "",
      "**Expected result**",
      "",
      "The request and response are modeled separately.",
    ].join("\n");

    const once = normalizeStructuredExercisePromptLayout(source);
    const twice = normalizeStructuredExercisePromptLayout(once);

    expect(once).toBe(source);
    expect(twice).toBe(source);
  });

  it("supports a structured prompt beginning with Task", () => {
    const source =
      "**Task** Build the request. " +
      "**Expected result** It logs the response.";

    expect(normalizeStructuredExercisePromptLayout(source)).toBe(
      "**Task**\n\nBuild the request.\n\n" +
      "**Expected result**\n\nIt logs the response.",
    );
  });

  it("collapses excessive authored spacing only at structured label boundaries", () => {
    const source =
      "**Problem**\n\n\nA campus map needs venue data.\n\n\n" +
      "**Task**\n\n\nCreate the request.";

    expect(normalizeStructuredExercisePromptLayout(source)).toBe(
      "**Problem**\n\nA campus map needs venue data.\n\n" +
      "**Task**\n\nCreate the request.",
    );
  });

  it("does not reinterpret ordinary inline bold prose as a structured prompt", () => {
    const source =
      "Read the **Problem** carefully, then discuss the **Task**.";
    expect(normalizeStructuredExercisePromptLayout(source)).toBe(source);
  });
});
