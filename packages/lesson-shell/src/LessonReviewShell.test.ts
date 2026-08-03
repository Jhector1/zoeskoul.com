import {
  createElement,
} from "react";
import {
  renderToStaticMarkup,
} from "react-dom/server";
import {
  describe,
  expect,
  it,
} from "vitest";

import {
  LessonActivityProgress,
  LessonFloatingNavigation,
  LessonReviewShell,
  LessonTopicStage,
} from "./LessonReviewShell";

describe("lesson review shell", () => {
  it("renders the old ZoeSkoul lesson zones without runtime coupling", () => {
    const stage = createElement(
      LessonTopicStage,
      {
        title: "List basics",
        progress: createElement(
          LessonActivityProgress,
          {
            activeIndex: 0,
            statuses: [
              "active",
              "upcoming",
            ],
          },
        ),
        children: createElement(
          "div",
          null,
          "Lesson content",
        ),
      },
    );

    const html = renderToStaticMarkup(
      createElement(
        LessonReviewShell,
        {
          homeHref: "/learning",
          moduleHref: "/modules/example",
          moduleTitle: "Lists and Dictionaries",
          sections: [
            {
              id: "section-1",
              label: "Lists",
              topics: [
                {
                  id: "topic-1",
                  label: "List basics",
                  active: true,
                },
              ],
            },
          ],
          activeTopicId: "topic-1",
          onSelectTopic: () => {},
          navigation: createElement(
            LessonFloatingNavigation,
            {
              previousDisabled: true,
              nextDisabled: true,
              message:
                "Complete this activity to continue.",
              onPrevious: () => {},
              onNext: () => {},
              nextTestId:
                "lesson-next-button",
            },
          ),
          children: stage,
        },
      ),
    );

    expect(html).toContain(
      'data-testid="student-review-shell"',
    );
    expect(html).toContain(
      'data-testid="lesson-review-sidebar"',
    );
    expect(html).toContain(
      'data-testid="review-learning-progress"',
    );
    expect(html).toContain(
      'data-testid="lesson-next-button"',
    );
    expect(html).toContain(
      "Complete this activity to continue.",
    );
    expect(html).not.toContain(
      "Vite lesson host",
    );
  });
});
