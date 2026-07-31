import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  refreshClientData,
  VITE_REFRESH_EVENT,
} from "./navigation-runtime";

describe("Vite router refresh compatibility", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("dispatches a client refresh signal without reloading the document", () => {
    const dispatchEvent = vi.fn();
    const reload = vi.fn();

    vi.stubGlobal("window", {
      dispatchEvent,
      location: {
        reload,
      },
    });

    refreshClientData();

    expect(dispatchEvent).toHaveBeenCalledTimes(1);

    const event = dispatchEvent.mock.calls[0]?.[0];

    expect(event).toBeInstanceOf(Event);
    expect(event.type).toBe(VITE_REFRESH_EVENT);
    expect(reload).not.toHaveBeenCalled();
  });
});
