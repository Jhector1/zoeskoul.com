import { describe, expect, it, vi } from "vitest";
import { generateCoursePlan } from "./generateCoursePlan.js";

describe("generateCoursePlan", () => {
  it("normalizes shorthand generated module and section slugs", async () => {
    const provider = {
      generateJson: vi.fn().mockResolvedValue({
        subjectSlug: "linux",
        profileId: "bash",
        modules: [
          {
            moduleSlug: "linux-1-terminal-navigation",
            prefix: "linux_module_1",
            order: 1,
            title: "Terminal Navigation",
            sections: [
              {
                sectionSlug: "linux-1-orientation",
                order: 1,
                title: "Orientation",
                topics: [],
              },
            ],
          },
        ],
      }),
    };

    const plan = await generateCoursePlan(provider as any, {
      subjectSlug: "linux",
      profileId: "bash",
      title: "Linux Terminal Fundamentals",
      description: "Learn Linux.",
    } as any);

    expect(plan.modules[0]?.moduleSlug).toBe("linux-module-1-terminal-navigation");
    expect(plan.modules[0]?.sections[0]?.sectionSlug).toBe("linux-module-1-orientation");
  });

  it("leaves already normalized slugs unchanged", async () => {
    const provider = {
      generateJson: vi.fn().mockResolvedValue({
        subjectSlug: "linux",
        profileId: "bash",
        modules: [
          {
            moduleSlug: "linux-module-2-files-and-folders",
            prefix: "linux_module_2",
            order: 2,
            title: "Files and Folders",
            sections: [
              {
                sectionSlug: "linux-module-2-file-workflow",
                order: 1,
                title: "Workflow",
                topics: [],
              },
            ],
          },
        ],
      }),
    };

    const plan = await generateCoursePlan(provider as any, {
      subjectSlug: "linux",
      profileId: "bash",
      title: "Linux Terminal Fundamentals",
      description: "Learn Linux.",
    } as any);

    expect(plan.modules[0]?.moduleSlug).toBe("linux-module-2-files-and-folders");
    expect(plan.modules[0]?.sections[0]?.sectionSlug).toBe("linux-module-2-file-workflow");
  });
});
