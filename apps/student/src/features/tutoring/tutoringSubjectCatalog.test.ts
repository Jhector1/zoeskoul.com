import {
  describe,
  expect,
  it,
} from "vitest";

import {
  OTHER_TUTORING_SUBJECT_VALUE,
  TUTORING_SUBJECT_GROUPS,
  isTutoringSubjectSelectionValid,
  matchesTutoringSubject,
  tutoringSubjectDisplayName,
} from "./tutoringSubjectCatalog";

describe("tutoring subject catalog", () => {
  const options =
    TUTORING_SUBJECT_GROUPS.flatMap(
      (group) => group.options,
    );
  const labels =
    options.map(
      (option) => option.label,
    );

  it("covers major tutoring subjects beyond the published course catalog", () => {
    expect(labels).toContain(
      "Data Structures & Algorithms",
    );
    expect(labels).toContain(
      "JavaScript",
    );
    expect(labels).toContain(
      "Web Development",
    );
    expect(labels).toContain(
      "Microsoft Excel",
    );
    expect(labels).toContain(
      "Microsoft Word",
    );
    expect(labels).toContain(
      "Microsoft PowerPoint",
    );
    expect(labels).toContain(
      "Adobe Photoshop",
    );
    expect(labels).toContain(
      "Cybersecurity",
    );
    expect(labels).toContain("AWS");
  });

  it("supports aliases and arbitrary custom technology subjects", () => {
    const dsa = options.find(
      (option) =>
        option.label ===
        "Data Structures & Algorithms",
    );

    expect(dsa).toBeTruthy();
    expect(
      matchesTutoringSubject(
        dsa!,
        "DSA",
      ),
    ).toBe(true);

    expect(
      isTutoringSubjectSelectionValid(
        OTHER_TUTORING_SUBJECT_VALUE,
        "Salesforce",
      ),
    ).toBe(true);

    expect(
      tutoringSubjectDisplayName(
        OTHER_TUTORING_SUBJECT_VALUE,
        "AutoCAD",
        [],
      ),
    ).toBe("AutoCAD");
  });

  it("preserves enrolled course display names", () => {
    expect(
      tutoringSubjectDisplayName(
        "python-v2",
        "",
        [
          {
            slug: "python-v2",
            title: "Python",
          },
        ],
      ),
    ).toBe("Python");
  });
});
