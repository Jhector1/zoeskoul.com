import {
  existsSync,
  readFileSync,
} from "node:fs";
import {
  resolve,
} from "node:path";
import {
  describe,
  expect,
  it,
} from "vitest";

const read=(p:string)=>readFileSync(resolve(__dirname, "../../..",p),"utf8");

describe("ZoeBuild authenticated preview shell",()=>{
 const root=read("src/app/layout.tsx");
 const boundary=read("src/components/builder/ZoeBuildAuthenticatedPreviewShell.tsx");

 it("owns preview persistence above Home, Projects, and Builder",()=>{
  expect(root).toContain("ZoeBuildAuthenticatedPreviewShell");
  expect(root).toContain("apiOrigin={zoebuildOrigin}");
  expect(root).toContain("{children}");
  expect(
    existsSync(
      resolve(
        __dirname, "../../..",
        "src/app/[locale]/projects/layout.tsx",
      ),
    ),
  ).toBe(false);
 });

 it("uses the canonical Web session instead of creating ZoeBuild authentication",()=>{
  expect(boundary).toContain("useAppSession");
  expect(boundary).toContain("sessionState.status ===");
  expect(boundary).toContain('"authenticated"');
  expect(boundary).not.toContain("next-auth");
  expect(boundary).not.toContain("SessionProvider");
 });

 it("keeps authenticated Home eligible while excluding isolated routes",()=>{
  expect(boundary).toContain('usePathname() || "/"');
  expect(boundary).toContain('pathname === "/authenticate"');
  expect(boundary).toContain('"/sites/"');
  expect(boundary).toContain('"/api/"');
  expect(boundary).toContain('pathname === "/health"');
 });

 it("drives the one persistent host through an explicit enabled contract",()=>{
  expect(boundary).toContain("PersistentReactPreviewProvider");
  expect(boundary).toContain("enabled={previewEnabled}");
 });
});
