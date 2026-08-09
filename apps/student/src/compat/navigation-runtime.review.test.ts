import { afterEach, describe, expect, it, vi } from "vitest";

import { publishNavigation } from "./navigation-runtime";

type HistoryEntry = {
  href: string;
  state: unknown;
};

function installNavigationWindow() {
  const target = new EventTarget();
  const entries: HistoryEntry[] = [
    { href: "/en/review/A", state: null },
  ];
  let index = 0;
  const location = {
    pathname: entries[0].href,
    search: "",
    hash: "",
  };
  const applyHref = (href: string) => {
    location.pathname = href;
  };
  const history = {
    get state() {
      return entries[index]?.state ?? null;
    },
    pushState(state: unknown, _title: string, href: string) {
      entries.splice(index + 1);
      entries.push({ href, state });
      index = entries.length - 1;
      applyHref(href);
    },
    replaceState(state: unknown, _title: string, href: string) {
      entries[index] = { href, state };
      applyHref(href);
    },
    back() {
      if (index === 0) return;
      index -= 1;
      applyHref(entries[index].href);
      target.dispatchEvent(new Event("popstate"));
    },
    forward() {
      if (index >= entries.length - 1) return;
      index += 1;
      applyHref(entries[index].href);
      target.dispatchEvent(new Event("popstate"));
    },
  };
  const windowLike = {
    location,
    history,
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: target.removeEventListener.bind(target),
    dispatchEvent: target.dispatchEvent.bind(target),
    scrollTo: vi.fn(),
  };

  vi.stubGlobal("window", windowLike);
  return { entries, history, location, target };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Student review navigation publication", () => {
  it("preserves Review history state and notifies Vite routing on push and replace", () => {
    const { history, target } = installNavigationWindow();
    const notifications: string[] = [];
    target.addEventListener("zoeskoul:vite-navigation", () => {
      notifications.push("navigation");
    });
    const pushedState = {
      __zoeReviewRoute: { targetKey: "exercise:B" },
    };

    publishNavigation("/en/review/B", {
      state: pushedState,
      scroll: false,
    });
    expect(history.state).toBe(pushedState);

    const replacedState = {
      __zoeReviewRoute: { targetKey: "exercise:B2" },
    };
    publishNavigation("/en/review/B2", {
      replace: true,
      state: replacedState,
      scroll: false,
    });

    expect(history.state).toBe(replacedState);
    expect(notifications).toEqual(["navigation", "navigation"]);
  });

  it("preserves exercise history targets across Back and Forward", () => {
    const { history, location } = installNavigationWindow();
    const stateB = {
      __zoeReviewRoute: { targetKey: "exercise:B" },
    };
    const stateC = {
      __zoeReviewRoute: { targetKey: "exercise:C" },
    };

    publishNavigation("/en/review/B", { state: stateB, scroll: false });
    publishNavigation("/en/review/C", { state: stateC, scroll: false });

    history.back();
    expect(location.pathname).toBe("/en/review/B");
    expect(history.state).toBe(stateB);

    history.forward();
    expect(location.pathname).toBe("/en/review/C");
    expect(history.state).toBe(stateC);
  });
});
