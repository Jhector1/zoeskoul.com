import React from "react";
import {
  renderToStaticMarkup,
} from "react-dom/server";
import {
  describe,
  expect,
  it,
} from "vitest";

import SoundToggle from "@/lib/sfx/SoundToggle";
import {
  SfxProvider,
} from "@/lib/sfx/SfxProvider";

describe("exact old settings menu runtime", () => {
  it("mounts SoundToggle inside the required SfxProvider", () => {
    const markup = renderToStaticMarkup(
      <SfxProvider>
        <SoundToggle />
      </SfxProvider>,
    );

    expect(markup).toContain("Sound on");
    expect(markup).toContain("Sound volume");
  });
});
