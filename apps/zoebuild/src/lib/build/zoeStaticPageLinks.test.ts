import { describe, expect, it } from "vitest";
import type { WorkspaceStateV2 } from "@zoeskoul/learner-workspace/ide/types";
import { pathOf } from "@zoeskoul/learner-workspace/ide/fsTree";
import { buildPublishedStaticFileMap, resolvePublishedStaticFile } from "./staticPublishedArtifact";
import { linkZoeStaticPageInHome } from "./zoeStaticPageLinks";
import { applyZoeEditsToWorkspace, sha256, validateZoeEdits, ZoeEditInputError } from "./zoeTargetedSourceEdit";

const home = `<!doctype html><html><head><title>Store</title></head><body>
<header><nav aria-label="Primary"><a href="#shop">Shop</a><a href="#about">About</a><a href="#privacy">Privacy</a></nav></header>
<main><section id="shop"><h1>Shop</h1></section><section id="about">Old introduction preserved</section></main>
<footer><a href="#about">About</a></footer></body></html>`;
const about = `<!doctype html><html><head><title>About the Store</title></head><body><header><h1>Our story</h1></header><main><p>About us.</p></main><footer><a href="index.html">Home</a></footer></body></html>`;
const longHome = home.replace("<main>", `<main><!--${"Existing storefront content.".repeat(1100)}-->`);
function source(indexContent = home): WorkspaceStateV2 {
  return {version: 2, language: "web", leftPct: 30, stdin: "", expanded: [],
    activeFileId: "home", entryFileId: "home", openTabs: ["home"], nodes: [
      {id: "home", kind: "file", name: "index.html", parentId: null,
       content: indexContent, createdAt: 1, updatedAt: 1},
      {id: "css", kind: "file", name: "styles.css", parentId: null,
       content: ":root { --brand: green; }", createdAt: 1, updatedAt: 1},
    ]};
}
const create = {path: "about.html", content: about, create: true as const, beforeSha256: sha256("")};

describe("Zoé true static page, deterministic navigation, and publish", () => {
  it("rewrites existing #about links into real document navigation without touching shop", () => {
    const linked = linkZoeStaticPageInHome(home, "about.html");
    expect(linked).toContain('href="about.html">About</a>');
    expect(linked).toContain('href="#shop">Shop</a>');
    expect(linked).toContain('id="about">Old introduction preserved');
    expect(linked).not.toContain('href="#about"');
    expect(linkZoeStaticPageInHome(linked, "about.html")).toBe(linked);
  });

  it("adds a real nav link and footer when the homepage has neither", () => {
    const bare = '<!doctype html><html><head></head><body><main>Existing page</main></body></html>';
    const linked = linkZoeStaticPageInHome(bare, "privacy.html");
    expect(linked).toContain('<nav aria-label="Pages"><a href="privacy.html">Privacy Policy</a></nav>');
    expect(linked).toContain('<footer data-zoebuild-pages="true"><a href="privacy.html">Privacy Policy</a></footer>');
    expect(linkZoeStaticPageInHome(linked, "privacy.html")).toBe(linked);
  });

  it("allows a large static homepage only for the exact trusted link rewrite", () => {
    expect(longHome.length).toBeGreaterThan(16_000);
    const linked = linkZoeStaticPageInHome(longHome, "about.html");
    const edits = [
      {path: "index.html", content: linked, beforeSha256: sha256(longHome)},
      create,
    ];
    const valid = validateZoeEdits(source(longHome), edits);
    expect(valid).toHaveLength(2);
    expect(() => validateZoeEdits(source(longHome), [
      {...edits[0]!, content: linked.replace("Existing storefront content.", "SILENT SOURCE REWRITE")}, create,
    ])).toThrow(ZoeEditInputError);
    const applied = applyZoeEditsToWorkspace(source(longHome), edits);
    expect(applied.nodes).toHaveLength(3);
    expect(applied.nodes.find(node => node.id === "css")).toEqual(source(longHome).nodes[1]);
    expect((applied.nodes[0] as {content: string}).content).toContain("Existing storefront content.");
  });

  it("persists about.html as a separate file and resolves /about to that document", () => {
    const linked = linkZoeStaticPageInHome(home, "about.html");
    const applied = applyZoeEditsToWorkspace(source(), [
      {path: "index.html", content: linked, beforeSha256: sha256(home)}, create,
    ]);
    expect(applied.nodes.some(node => node.kind === "file" &&
      pathOf(applied.nodes, node.id) === "about.html")).toBe(true);
    const deployed = buildPublishedStaticFileMap(applied);
    expect(resolvePublishedStaticFile(deployed, "about", true)?.path).toBe("about.html");
    expect(resolvePublishedStaticFile(deployed, "about.html", true)?.body).toBe(about);
    expect(resolvePublishedStaticFile(deployed, "", true)?.path).toBe("index.html");
  });

  it("accepts a new page when a homepage already links to it, without unchanged edits", () => {
    const alreadyLinked = linkZoeStaticPageInHome(home, "about.html");
    const valid = validateZoeEdits(source(alreadyLinked), [create]);
    expect(valid).toHaveLength(1);
    expect(applyZoeEditsToWorkspace(source(alreadyLinked), [create]).nodes).toHaveLength(3);
  });

  it("refuses new page overwrites and mismatched or stale homepage changes", () => {
    const linked = linkZoeStaticPageInHome(home, "about.html");
    const workspace = applyZoeEditsToWorkspace(source(), [
      {path: "index.html", content: linked, beforeSha256: sha256(home)}, create,
    ]);
    expect(() => validateZoeEdits(workspace, [create])).toThrow();
    expect(() => validateZoeEdits(source(), [
      {path: "index.html", content: linked, beforeSha256: sha256("outdated")}, create,
    ])).toThrow();
  });
});
