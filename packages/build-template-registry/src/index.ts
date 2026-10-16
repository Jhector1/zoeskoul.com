import type { WorkspaceStateV2 } from "@zoeskoul/workspace-contracts";

/**
 * Provider-neutral source templates for ZoeBuild.
 *
 * Templates are deliberately boring, deterministic starting points. Zoe/AI
 * edits happen after materialization and revision creation; the model does not
 * get to invent an unsupported project structure from scratch.
 */

export type BuildTemplateTextFile = Readonly<{
  path: string;
  content: string;
}>;

export type BuildDependencyLockPolicy = Readonly<{
  manager: "pnpm";
  policy: "generate-once";
  lockfilePath: "pnpm-lock.yaml";
}>;

export type BuildTemplateDefinition = Readonly<{
  id: string;
  stackIds: readonly string[];
  workspaceLanguage: WorkspaceStateV2["language"];
  files: readonly BuildTemplateTextFile[];
  entryPath: string;
  activePath?: string;
  openPaths?: readonly string[];
  leftPct?: number;
  dependencyLock: BuildDependencyLockPolicy | null;
}>;

const STATIC_HTML = String.raw`<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Zoé Build</title>
    <link rel="stylesheet" href="./styles.css" />
  </head>
  <body>
    <main class="page-shell">
      <p class="eyebrow">Built with Zoé</p>
      <h1>Your site is ready to customize.</h1>
      <p>Edit the files or ask Zoé to turn this starter into your website.</p>
      <button id="hello-button" type="button">Try it</button>
    </main>
    <script type="module" src="./script.js"></script>
  </body>
</html>
`;

const STATIC_CSS = String.raw`:root {
  font-family: Inter, ui-sans-serif, system-ui, sans-serif;
  color: #111827;
  background: #f8fafc;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  min-height: 100vh;
}

.page-shell {
  width: min(720px, calc(100% - 32px));
  margin: 0 auto;
  padding: 96px 0;
}

.eyebrow {
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

h1 {
  font-size: clamp(2.5rem, 8vw, 5rem);
  line-height: 0.98;
  margin: 16px 0 24px;
}

button {
  border: 0;
  border-radius: 999px;
  padding: 12px 18px;
  font: inherit;
  cursor: pointer;
}
`;

const STATIC_JS = String.raw`const button = document.querySelector("#hello-button");

button?.addEventListener("click", () => {
  button.textContent = "It works";
});
`;

const REACT_PACKAGE_JSON = `{
  "name": "zoe-build-app",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "packageManager": "pnpm@10.33.0",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "19.2.3",
    "react-dom": "19.2.3"
  },
  "devDependencies": {
    "@types/react": "19.2.14",
    "@types/react-dom": "19.2.3",
    "@vitejs/plugin-react": "6.0.4",
    "typescript": "6.0.3",
    "vite": "8.1.5"
  }
}
`;

const REACT_INDEX_HTML = String.raw`<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Zoé Build</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`;

const REACT_MAIN = String.raw`import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Missing #root element");
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
`;

const REACT_APP = String.raw`export default function App() {
  return (
    <main className="page-shell">
      <p className="eyebrow">Built with Zoé</p>
      <h1>Your app is ready to customize.</h1>
      <p>
        This is the controlled React + Vite starter. Ask Zoé to build on top
        of it or edit the frontend directly.
      </p>
    </main>
  );
}
`;

const REACT_CSS = String.raw`:root {
  font-family: Inter, ui-sans-serif, system-ui, sans-serif;
  color: #111827;
  background: #f8fafc;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  min-width: 320px;
  min-height: 100vh;
}

.page-shell {
  width: min(760px, calc(100% - 32px));
  margin: 0 auto;
  padding: 96px 0;
}

.eyebrow {
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

h1 {
  font-size: clamp(2.5rem, 8vw, 5rem);
  line-height: 0.98;
  margin: 16px 0 24px;
}
`;

const REACT_TSCONFIG = `{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "allowJs": false,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx"
  },
  "include": ["src", "vite.config.ts"]
}
`;

const REACT_VITE_CONFIG = String.raw`import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
});
`;

export const STATIC_HTML_TEMPLATE_V1 = {
  id: "static-html-v1",
  stackIds: ["static-html-v1"],
  workspaceLanguage: "web",
  files: [
    { path: "index.html", content: STATIC_HTML },
    { path: "styles.css", content: STATIC_CSS },
    { path: "script.js", content: STATIC_JS },
  ],
  entryPath: "index.html",
  activePath: "index.html",
  openPaths: ["index.html", "styles.css", "script.js"],
  leftPct: 26,
  dependencyLock: null,
} as const satisfies BuildTemplateDefinition;

export const REACT_VITE_TEMPLATE_V1 = {
  id: "react-vite-v1",
  stackIds: ["react-vite-v1"],
  workspaceLanguage: "web",
  files: [
    { path: "package.json", content: REACT_PACKAGE_JSON },
    { path: "index.html", content: REACT_INDEX_HTML },
    { path: "src/main.tsx", content: REACT_MAIN },
    { path: "src/App.tsx", content: REACT_APP },
    { path: "src/styles.css", content: REACT_CSS },
    { path: "tsconfig.json", content: REACT_TSCONFIG },
    { path: "vite.config.ts", content: REACT_VITE_CONFIG },
  ],
  entryPath: "src/main.tsx",
  activePath: "src/App.tsx",
  openPaths: ["src/App.tsx", "src/styles.css", "src/main.tsx"],
  leftPct: 26,
  dependencyLock: {
    manager: "pnpm",
    policy: "generate-once",
    lockfilePath: "pnpm-lock.yaml",
  },
} as const satisfies BuildTemplateDefinition;

export const COMMERCE_STOREFRONT_TEMPLATE_V1 = {
  id: "commerce-storefront-v1",

  stackIds: [
    "commerce-storefront-v1",
  ],

  workspaceLanguage: "web",

  files: [
    {
      path: "index.html",
      content: "<!doctype html>\n<html lang=\"en\">\n  <head>\n    <meta charset=\"UTF-8\" />\n    <meta\n      name=\"viewport\"\n      content=\"width=device-width, initial-scale=1.0\"\n    />\n    <meta\n      name=\"description\"\n      content=\"A ZoeBuild managed-commerce storefront.\"\n    />\n    <title>ZoeBuild Storefront</title>\n\n    <link\n      rel=\"stylesheet\"\n      href=\"./styles/base.css\"\n    />\n    <link\n      rel=\"stylesheet\"\n      href=\"./src/design/theme.css\"\n    />\n  </head>\n\n  <body>\n    <div\n      id=\"commerce-status\"\n      class=\"commerce-status\"\n      role=\"status\"\n    ></div>\n\n    <header class=\"site-header\">\n      <a\n        href=\"/\"\n        id=\"brand-name\"\n        class=\"brand\"\n      >\n        Store\n      </a>\n\n      <nav\n        class=\"site-nav\"\n        aria-label=\"Store\"\n      >\n        <a href=\"#featured\">Shop</a>\n        <a href=\"#about\">About</a>\n\n        <button\n          id=\"cart-button\"\n          class=\"cart-button\"\n          type=\"button\"\n        >\n          Cart\n          <span id=\"cart-count\">0</span>\n        </button>\n      </nav>\n    </header>\n\n    <main>\n      <!--\n        DESIGN REGION.\n        Zoe may change presentation/content here,\n        but must not replace commerce mechanics.\n      -->\n      <section\n        class=\"hero\"\n        data-zoe-design-region=\"hero\"\n      >\n        <div class=\"hero-copy\">\n          <p\n            id=\"hero-eyebrow\"\n            class=\"eyebrow\"\n          ></p>\n\n          <h1 id=\"hero-title\"></h1>\n\n          <p\n            id=\"hero-body\"\n            class=\"hero-body\"\n          ></p>\n\n          <a\n            id=\"hero-cta\"\n            class=\"primary-button\"\n            href=\"#featured\"\n          >\n            Shop\n          </a>\n        </div>\n\n        <div\n          class=\"hero-art\"\n          aria-hidden=\"true\"\n        >\n          <div class=\"hero-art-card\"></div>\n        </div>\n      </section>\n\n      <section\n        id=\"featured\"\n        class=\"product-section\"\n        data-zoe-design-region=\"product-presentation\"\n      >\n        <div class=\"section-heading\">\n          <div>\n            <p class=\"eyebrow\">\n              Curated for you\n            </p>\n\n            <h2 id=\"featured-heading\">\n              Featured products\n            </h2>\n          </div>\n        </div>\n\n        <div\n          id=\"product-grid\"\n          class=\"product-grid\"\n          aria-live=\"polite\"\n        ></div>\n      </section>\n\n      <section\n        id=\"about\"\n        class=\"story-section\"\n        data-zoe-design-region=\"story\"\n      >\n        <p class=\"eyebrow\">\n          Our story\n        </p>\n\n        <h2 id=\"story-heading\">\n          Designed with intention.\n        </h2>\n\n        <p id=\"story-body\"></p>\n      </section>\n    </main>\n\n    <aside\n      id=\"cart-panel\"\n      class=\"cart-panel\"\n      aria-labelledby=\"cart-title\"\n      hidden\n    >\n      <div class=\"cart-panel-header\">\n        <h2 id=\"cart-title\">\n          Your cart\n        </h2>\n\n        <button\n          id=\"cart-close\"\n          type=\"button\"\n          aria-label=\"Close cart\"\n        >\n          ×\n        </button>\n      </div>\n\n      <p id=\"cart-summary\">\n        Your cart is empty.\n      </p>\n\n      <button\n        id=\"checkout-button\"\n        class=\"primary-button\"\n        type=\"button\"\n        disabled\n      >\n        Checkout\n      </button>\n    </aside>\n\n    <script\n      type=\"module\"\n      src=\"./src/app.js\"\n    ></script>\n  </body>\n</html>\n",
    },
    {
      path: "styles/base.css",
      content: "* {\n  box-sizing: border-box;\n}\n\nhtml {\n  scroll-behavior: smooth;\n}\n\nbody {\n  margin: 0;\n  min-height: 100vh;\n  font-family:\n    Inter,\n    ui-sans-serif,\n    system-ui,\n    -apple-system,\n    BlinkMacSystemFont,\n    \"Segoe UI\",\n    sans-serif;\n  background: var(--surface);\n  color: var(--text);\n}\n\nbutton,\na {\n  font: inherit;\n}\n\nbutton {\n  cursor: pointer;\n}\n\nimg {\n  display: block;\n  max-width: 100%;\n}\n\n.site-header {\n  min-height: 72px;\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 24px;\n  padding: 0 5vw;\n  border-bottom: 1px solid var(--border);\n  background: color-mix(\n    in srgb,\n    var(--surface) 94%,\n    transparent\n  );\n  backdrop-filter: blur(14px);\n  position: sticky;\n  top: 0;\n  z-index: 20;\n}\n\n.brand {\n  color: inherit;\n  font-weight: 800;\n  text-decoration: none;\n  letter-spacing: -0.03em;\n}\n\n.site-nav {\n  display: flex;\n  align-items: center;\n  gap: 20px;\n}\n\n.site-nav a {\n  color: var(--muted);\n  text-decoration: none;\n}\n\n.cart-button {\n  border: 1px solid var(--border);\n  background: transparent;\n  color: inherit;\n  border-radius: 999px;\n  padding: 9px 14px;\n}\n\n.hero {\n  min-height: 68vh;\n  display: grid;\n  grid-template-columns:\n    minmax(0, 1fr)\n    minmax(280px, 0.8fr);\n  align-items: center;\n  gap: clamp(32px, 7vw, 100px);\n  padding:\n    clamp(70px, 9vw, 130px)\n    7vw;\n}\n\n.hero-copy {\n  max-width: 720px;\n}\n\n.hero h1 {\n  margin: 12px 0 20px;\n  font-size:\n    clamp(3rem, 8vw, 7.5rem);\n  line-height: 0.94;\n  letter-spacing: -0.065em;\n}\n\n.hero-body {\n  max-width: 620px;\n  color: var(--muted);\n  font-size: 1.1rem;\n  line-height: 1.7;\n}\n\n.eyebrow {\n  margin: 0;\n  color: var(--accent);\n  font-size: 0.78rem;\n  font-weight: 800;\n  letter-spacing: 0.14em;\n  text-transform: uppercase;\n}\n\n.primary-button {\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  min-height: 48px;\n  margin-top: 22px;\n  padding: 0 20px;\n  border: 0;\n  border-radius: var(--radius-button);\n  background: var(--accent);\n  color: var(--accent-contrast);\n  text-decoration: none;\n  font-weight: 750;\n}\n\n.primary-button:disabled {\n  cursor: not-allowed;\n  opacity: 0.45;\n}\n\n.hero-art {\n  min-height: 430px;\n  display: grid;\n  place-items: center;\n}\n\n.hero-art-card {\n  width: min(100%, 430px);\n  aspect-ratio: 4 / 5;\n  border-radius: var(--radius-card);\n  background:\n    linear-gradient(\n      145deg,\n      var(--art-start),\n      var(--art-end)\n    );\n  box-shadow:\n    0 40px 90px\n    color-mix(\n      in srgb,\n      var(--text) 12%,\n      transparent\n    );\n}\n\n.product-section,\n.story-section {\n  padding:\n    clamp(64px, 8vw, 110px)\n    7vw;\n}\n\n.section-heading {\n  display: flex;\n  justify-content: space-between;\n  gap: 24px;\n  margin-bottom: 34px;\n}\n\n.section-heading h2,\n.story-section h2 {\n  margin: 8px 0 0;\n  font-size:\n    clamp(2rem, 4vw, 4rem);\n  letter-spacing: -0.05em;\n}\n\n.product-grid {\n  display: grid;\n  grid-template-columns:\n    repeat(\n      auto-fit,\n      minmax(210px, 1fr)\n    );\n  gap: var(--grid-gap);\n}\n\n.product-card {\n  min-width: 0;\n}\n\n.product-media {\n  aspect-ratio: 4 / 5;\n  overflow: hidden;\n  border-radius: var(--radius-card);\n  background: var(--surface-soft);\n}\n\n.product-media img {\n  width: 100%;\n  height: 100%;\n  object-fit: cover;\n}\n\n.product-media-placeholder {\n  width: 100%;\n  height: 100%;\n  display: grid;\n  place-items: center;\n  color: var(--muted);\n}\n\n.product-meta {\n  padding: 14px 2px;\n}\n\n.product-title {\n  margin: 0;\n  font-size: 1rem;\n}\n\n.product-price {\n  margin: 6px 0 0;\n  color: var(--muted);\n}\n\n.product-card button {\n  width: 100%;\n  min-height: 42px;\n  border: 1px solid var(--border);\n  border-radius: var(--radius-button);\n  background: transparent;\n  color: inherit;\n}\n\n.product-card button:hover:not(:disabled) {\n  border-color: var(--accent);\n}\n\n.story-section {\n  max-width: 960px;\n}\n\n.story-section p:last-child {\n  color: var(--muted);\n  font-size: 1.08rem;\n  line-height: 1.8;\n}\n\n.commerce-status {\n  padding:\n    9px\n    5vw;\n  background: var(--surface-soft);\n  color: var(--muted);\n  font-size: 0.85rem;\n  text-align: center;\n}\n\n.cart-panel {\n  position: fixed;\n  z-index: 50;\n  top: 0;\n  right: 0;\n  width:\n    min(420px, 100vw);\n  height: 100vh;\n  padding: 28px;\n  border-left:\n    1px solid\n    var(--border);\n  background: var(--surface);\n  box-shadow:\n    -30px 0 70px\n    color-mix(\n      in srgb,\n      var(--text) 10%,\n      transparent\n    );\n}\n\n.cart-panel-header {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n}\n\n.cart-panel-header button {\n  border: 0;\n  background: transparent;\n  color: inherit;\n  font-size: 1.6rem;\n}\n\n@media (max-width: 760px) {\n  .site-nav > a {\n    display: none;\n  }\n\n  .hero {\n    grid-template-columns: 1fr;\n  }\n\n  .hero-art {\n    min-height: 320px;\n  }\n}\n",
    },
    {
      path: "src/design/theme.css",
      content: ":root {\n  /*\n   * DESIGN-AWARE REGION.\n   *\n   * Zoe may personalize these presentation tokens.\n   * Commerce mechanics must never be moved into this file.\n   */\n  --surface: #f8f6f1;\n  --surface-soft: #eeeae1;\n  --text: #191816;\n  --muted: #6e6960;\n  --border: #d9d3c8;\n\n  --accent: #2f4739;\n  --accent-contrast: #ffffff;\n\n  --art-start: #d7cab6;\n  --art-end: #8a7960;\n\n  --radius-card: 22px;\n  --radius-button: 999px;\n  --grid-gap: 24px;\n}\n",
    },
    {
      path: "src/design/content.js",
      content: "/*\n * DESIGN-AWARE REGION.\n *\n * Zoe may customize this content to match the user's\n * business, product category, tone, and visual direction.\n */\nexport const storefrontContent = {\n  brandName: \"Atelier\",\n  eyebrow: \"New season\",\n  heroTitle: \"Made for everyday rituals.\",\n  heroBody:\n    \"A considered collection with a calm, modern point of view.\",\n  heroCta: \"Shop the collection\",\n\n  featuredHeading: \"Featured pieces\",\n\n  storyHeading:\n    \"Things worth keeping.\",\n  storyBody:\n    \"Thoughtful products, selected for quality, utility, and lasting character.\",\n};\n",
    },
    {
      path: "src/design/layout.js",
      content: "/*\n * DESIGN-AWARE REGION.\n *\n * Zoe may alter these presentation choices.\n * Application and commerce behavior must stay outside\n * this module.\n */\nexport const storefrontLayout = {\n  heroAlignment: \"split\",\n  productDensity: \"comfortable\",\n  cardTreatment: \"soft\",\n};\n",
    },
    {
      path: "src/commerce/config.js",
      content: "/*\n * MERCHANT-MANAGED CONFIGURATION.\n *\n * This file is NOT an AI design surface.\n *\n * Enter the permanent *.myshopify.com hostname for the\n * connected store. Do not put Admin API tokens, private\n * access tokens, card credentials, or OAuth secrets here.\n */\nexport const commerceConfig = {\n  adapter: \"shopify-storefront\",\n  shopDomain: \"\",\n  apiVersion: \"2026-10\",\n};\n",
    },
    {
      path: "src/commerce/shopifyStorefront.js",
      content: "/*\n * TRUSTED COMMERCE ADAPTER.\n *\n * Zoe must not rewrite this module when changing design.\n *\n * This adapter intentionally uses the Storefront API's\n * tokenless product/cart surface. Checkout is completed by\n * the managed commerce provider through checkoutUrl.\n */\n\nfunction normalizeShopDomain(\n  value,\n) {\n  const candidate =\n    String(value ?? \"\")\n      .trim()\n      .toLowerCase()\n      .replace(/^https?:\\/\\//, \"\")\n      .replace(/\\/.*$/, \"\");\n\n  if (\n    !candidate ||\n    !candidate.endsWith(\n      \".myshopify.com\",\n    )\n  ) {\n    return null;\n  }\n\n  return candidate;\n}\n\nfunction endpoint(\n  config,\n) {\n  const shopDomain =\n    normalizeShopDomain(\n      config.shopDomain,\n    );\n\n  if (!shopDomain) {\n    throw new Error(\n      \"Commerce is not connected. Configure a permanent .myshopify.com domain.\",\n    );\n  }\n\n  return (\n    `https://${shopDomain}` +\n    `/api/${config.apiVersion}` +\n    \"/graphql.json\"\n  );\n}\n\nasync function graphql(\n  config,\n  query,\n  variables = {},\n) {\n  const response =\n    await fetch(\n      endpoint(config),\n      {\n        method: \"POST\",\n\n        headers: {\n          \"Content-Type\":\n            \"application/json\",\n        },\n\n        body:\n          JSON.stringify({\n            query,\n            variables,\n          }),\n      },\n    );\n\n  const payload =\n    await response.json();\n\n  if (\n    !response.ok ||\n    payload.errors\n  ) {\n    const detail =\n      Array.isArray(\n        payload.errors,\n      )\n        ? payload.errors\n            .map(\n              (item) =>\n                item?.message,\n            )\n            .filter(Boolean)\n            .join(\" \")\n        : \"\";\n\n    throw new Error(\n      detail ||\n      \"The commerce provider rejected the storefront request.\",\n    );\n  }\n\n  return payload.data;\n}\n\nconst PRODUCT_FIELDS = `\n  id\n  title\n  handle\n  availableForSale\n\n  featuredImage {\n    url\n    altText\n  }\n\n  variants(first: 1) {\n    nodes {\n      id\n      title\n      availableForSale\n\n      price {\n        amount\n        currencyCode\n      }\n    }\n  }\n`;\n\nexport function createShopifyStorefrontAdapter(\n  config,\n) {\n  return {\n    id:\n      \"shopify-storefront\",\n\n    isConfigured() {\n      return Boolean(\n        normalizeShopDomain(\n          config.shopDomain,\n        ),\n      );\n    },\n\n    async listProducts(\n      first = 12,\n    ) {\n      const data =\n        await graphql(\n          config,\n          `\n            query ZoeBuildProducts(\n              $first: Int!\n            ) {\n              products(\n                first: $first\n              ) {\n                nodes {\n                  ${PRODUCT_FIELDS}\n                }\n              }\n            }\n          `,\n          {\n            first,\n          },\n        );\n\n      return (\n        data?.products?.nodes ??\n        []\n      );\n    },\n\n    async createCart(\n      merchandiseId,\n      quantity = 1,\n    ) {\n      const data =\n        await graphql(\n          config,\n          `\n            mutation ZoeBuildCartCreate(\n              $input: CartInput\n            ) {\n              cartCreate(\n                input: $input\n              ) {\n                cart {\n                  id\n                  totalQuantity\n                  checkoutUrl\n                }\n\n                userErrors {\n                  field\n                  message\n                }\n              }\n            }\n          `,\n          {\n            input: {\n              lines: [\n                {\n                  merchandiseId,\n                  quantity,\n                },\n              ],\n            },\n          },\n        );\n\n      const result =\n        data?.cartCreate;\n\n      if (\n        result?.userErrors\n          ?.length\n      ) {\n        throw new Error(\n          result.userErrors\n            .map(\n              (item) =>\n                item.message,\n            )\n            .join(\" \"),\n        );\n      }\n\n      return result?.cart;\n    },\n\n    async addCartLine(\n      cartId,\n      merchandiseId,\n      quantity = 1,\n    ) {\n      const data =\n        await graphql(\n          config,\n          `\n            mutation ZoeBuildCartLinesAdd(\n              $cartId: ID!\n              $lines: [CartLineInput!]!\n            ) {\n              cartLinesAdd(\n                cartId: $cartId\n                lines: $lines\n              ) {\n                cart {\n                  id\n                  totalQuantity\n                  checkoutUrl\n                }\n\n                userErrors {\n                  field\n                  message\n                }\n              }\n            }\n          `,\n          {\n            cartId,\n\n            lines: [\n              {\n                merchandiseId,\n                quantity,\n              },\n            ],\n          },\n        );\n\n      const result =\n        data?.cartLinesAdd;\n\n      if (\n        result?.userErrors\n          ?.length\n      ) {\n        throw new Error(\n          result.userErrors\n            .map(\n              (item) =>\n                item.message,\n            )\n            .join(\" \"),\n        );\n      }\n\n      return result?.cart;\n    },\n\n    async getCart(\n      cartId,\n    ) {\n      const data =\n        await graphql(\n          config,\n          `\n            query ZoeBuildCart(\n              $id: ID!\n            ) {\n              cart(id: $id) {\n                id\n                totalQuantity\n                checkoutUrl\n\n                cost {\n                  subtotalAmount {\n                    amount\n                    currencyCode\n                  }\n\n                  totalAmount {\n                    amount\n                    currencyCode\n                  }\n                }\n              }\n            }\n          `,\n          {\n            id:\n              cartId,\n          },\n        );\n\n      return (\n        data?.cart ??\n        null\n      );\n    },\n  };\n}\n",
    },
    {
      path: "src/commerce/provider.js",
      content: "/*\n * TRUSTED PROVIDER BOUNDARY.\n *\n * Application code depends on this provider-neutral facade.\n * A future commerce provider can replace the adapter without\n * changing Zoe's design surfaces.\n */\nimport {\n  commerceConfig,\n} from \"./config.js\";\n\nimport {\n  createShopifyStorefrontAdapter,\n} from \"./shopifyStorefront.js\";\n\nexport const commerce =\n  createShopifyStorefrontAdapter(\n    commerceConfig,\n  );\n",
    },
    {
      path: "src/app.js",
      content: "/*\n * TRUSTED STOREFRONT APPLICATION SHELL.\n *\n * Zoe changes design/content modules, not cart or checkout\n * mechanics in this file.\n */\nimport {\n  storefrontContent,\n} from \"./design/content.js\";\n\nimport {\n  storefrontLayout,\n} from \"./design/layout.js\";\n\nimport {\n  commerce,\n} from \"./commerce/provider.js\";\n\nconst CART_STORAGE_KEY =\n  \"zoebuild-commerce-cart-id\";\n\nconst elements = {\n  brand:\n    document.querySelector(\n      \"#brand-name\",\n    ),\n\n  eyebrow:\n    document.querySelector(\n      \"#hero-eyebrow\",\n    ),\n\n  heroTitle:\n    document.querySelector(\n      \"#hero-title\",\n    ),\n\n  heroBody:\n    document.querySelector(\n      \"#hero-body\",\n    ),\n\n  heroCta:\n    document.querySelector(\n      \"#hero-cta\",\n    ),\n\n  featuredHeading:\n    document.querySelector(\n      \"#featured-heading\",\n    ),\n\n  storyHeading:\n    document.querySelector(\n      \"#story-heading\",\n    ),\n\n  storyBody:\n    document.querySelector(\n      \"#story-body\",\n    ),\n\n  productGrid:\n    document.querySelector(\n      \"#product-grid\",\n    ),\n\n  status:\n    document.querySelector(\n      \"#commerce-status\",\n    ),\n\n  cartButton:\n    document.querySelector(\n      \"#cart-button\",\n    ),\n\n  cartCount:\n    document.querySelector(\n      \"#cart-count\",\n    ),\n\n  cartPanel:\n    document.querySelector(\n      \"#cart-panel\",\n    ),\n\n  cartClose:\n    document.querySelector(\n      \"#cart-close\",\n    ),\n\n  cartSummary:\n    document.querySelector(\n      \"#cart-summary\",\n    ),\n\n  checkout:\n    document.querySelector(\n      \"#checkout-button\",\n    ),\n};\n\nlet cart = null;\n\nfunction applyDesign() {\n  document.body.dataset\n    .heroAlignment =\n      storefrontLayout\n        .heroAlignment;\n\n  document.body.dataset\n    .productDensity =\n      storefrontLayout\n        .productDensity;\n\n  document.body.dataset\n    .cardTreatment =\n      storefrontLayout\n        .cardTreatment;\n\n  elements.brand.textContent =\n    storefrontContent\n      .brandName;\n\n  elements.eyebrow.textContent =\n    storefrontContent\n      .eyebrow;\n\n  elements.heroTitle.textContent =\n    storefrontContent\n      .heroTitle;\n\n  elements.heroBody.textContent =\n    storefrontContent\n      .heroBody;\n\n  elements.heroCta.textContent =\n    storefrontContent\n      .heroCta;\n\n  elements.featuredHeading\n    .textContent =\n      storefrontContent\n        .featuredHeading;\n\n  elements.storyHeading\n    .textContent =\n      storefrontContent\n        .storyHeading;\n\n  elements.storyBody.textContent =\n    storefrontContent\n      .storyBody;\n\n  document.title =\n    storefrontContent\n      .brandName;\n}\n\nfunction money(\n  price,\n) {\n  if (!price) {\n    return \"\";\n  }\n\n  try {\n    return new Intl\n      .NumberFormat(\n        undefined,\n        {\n          style: \"currency\",\n          currency:\n            price.currencyCode,\n        },\n      )\n      .format(\n        Number(\n          price.amount,\n        ),\n      );\n  } catch {\n    return (\n      `${price.amount} ` +\n      `${price.currencyCode}`\n    );\n  }\n}\n\nfunction demoProducts() {\n  return [\n    {\n      id: \"preview-1\",\n      title:\n        \"Signature piece\",\n      preview: true,\n    },\n\n    {\n      id: \"preview-2\",\n      title:\n        \"Everyday essential\",\n      preview: true,\n    },\n\n    {\n      id: \"preview-3\",\n      title:\n        \"New arrival\",\n      preview: true,\n    },\n\n    {\n      id: \"preview-4\",\n      title:\n        \"Limited edit\",\n      preview: true,\n    },\n  ];\n}\n\nfunction productCard(\n  product,\n) {\n  const variant =\n    product\n      .variants\n      ?.nodes?.[0];\n\n  const article =\n    document.createElement(\n      \"article\",\n    );\n\n  article.className =\n    \"product-card\";\n\n  const media =\n    document.createElement(\n      \"div\",\n    );\n\n  media.className =\n    \"product-media\";\n\n  if (\n    product.featuredImage\n      ?.url\n  ) {\n    const image =\n      document.createElement(\n        \"img\",\n      );\n\n    image.src =\n      product\n        .featuredImage\n        .url;\n\n    image.alt =\n      product\n        .featuredImage\n        .altText ||\n      product.title;\n\n    media.append(\n      image,\n    );\n  } else {\n    const placeholder =\n      document.createElement(\n        \"div\",\n      );\n\n    placeholder.className =\n      \"product-media-placeholder\";\n\n    placeholder.textContent =\n      product.preview\n        ? \"Preview product\"\n        : product.title;\n\n    media.append(\n      placeholder,\n    );\n  }\n\n  const meta =\n    document.createElement(\n      \"div\",\n    );\n\n  meta.className =\n    \"product-meta\";\n\n  const title =\n    document.createElement(\n      \"h3\",\n    );\n\n  title.className =\n    \"product-title\";\n\n  title.textContent =\n    product.title;\n\n  meta.append(title);\n\n  if (variant?.price) {\n    const price =\n      document.createElement(\n        \"p\",\n      );\n\n    price.className =\n      \"product-price\";\n\n    price.textContent =\n      money(\n        variant.price,\n      );\n\n    meta.append(\n      price,\n    );\n  }\n\n  const add =\n    document.createElement(\n      \"button\",\n    );\n\n  add.type =\n    \"button\";\n\n  add.textContent =\n    product.preview\n      ? \"Connect store\"\n      : \"Add to cart\";\n\n  add.disabled =\n    Boolean(\n      product.preview,\n    ) ||\n    !variant\n      ?.availableForSale;\n\n  if (\n    variant?.id &&\n    !product.preview\n  ) {\n    add.addEventListener(\n      \"click\",\n      () =>\n        addToCart(\n          variant.id,\n        ),\n    );\n  }\n\n  article.append(\n    media,\n    meta,\n    add,\n  );\n\n  return article;\n}\n\nfunction renderProducts(\n  products,\n) {\n  elements.productGrid\n    .replaceChildren(\n      ...products.map(\n        productCard,\n      ),\n    );\n}\n\nfunction updateCartUi() {\n  const quantity =\n    cart\n      ?.totalQuantity ??\n    0;\n\n  elements.cartCount\n    .textContent =\n      String(quantity);\n\n  elements.cartSummary\n    .textContent =\n      quantity > 0\n        ? `${quantity} item${\n            quantity === 1\n              ? \"\"\n              : \"s\"\n          } ready for checkout.`\n        : \"Your cart is empty.\";\n\n  elements.checkout.disabled =\n    !cart?.checkoutUrl;\n}\n\nasync function addToCart(\n  merchandiseId,\n) {\n  const storedCartId =\n    localStorage.getItem(\n      CART_STORAGE_KEY,\n    );\n\n  try {\n    if (storedCartId) {\n      cart =\n        await commerce\n          .addCartLine(\n            storedCartId,\n            merchandiseId,\n          );\n    } else {\n      cart =\n        await commerce\n          .createCart(\n            merchandiseId,\n          );\n    }\n\n    if (!cart?.id) {\n      throw new Error(\n        \"The commerce provider did not return a cart.\",\n      );\n    }\n\n    localStorage.setItem(\n      CART_STORAGE_KEY,\n      cart.id,\n    );\n\n    updateCartUi();\n\n    elements.cartPanel.hidden =\n      false;\n  } catch (error) {\n    elements.status\n      .textContent =\n        error instanceof Error\n          ? error.message\n          : \"Unable to update cart.\";\n  }\n}\n\nasync function restoreCart() {\n  const storedCartId =\n    localStorage.getItem(\n      CART_STORAGE_KEY,\n    );\n\n  if (!storedCartId) {\n    return;\n  }\n\n  try {\n    cart =\n      await commerce\n        .getCart(\n          storedCartId,\n        );\n\n    if (!cart) {\n      localStorage.removeItem(\n        CART_STORAGE_KEY,\n      );\n    }\n\n    updateCartUi();\n  } catch {\n    localStorage.removeItem(\n      CART_STORAGE_KEY,\n    );\n  }\n}\n\nasync function start() {\n  applyDesign();\n\n  elements.cartButton\n    .addEventListener(\n      \"click\",\n      () => {\n        elements.cartPanel.hidden =\n          false;\n      },\n    );\n\n  elements.cartClose\n    .addEventListener(\n      \"click\",\n      () => {\n        elements.cartPanel.hidden =\n          true;\n      },\n    );\n\n  elements.checkout\n    .addEventListener(\n      \"click\",\n      () => {\n        if (\n          cart?.checkoutUrl\n        ) {\n          window.location.assign(\n            cart.checkoutUrl,\n          );\n        }\n      },\n    );\n\n  if (\n    !commerce.isConfigured()\n  ) {\n    elements.status\n      .textContent =\n        \"Design preview — connect a Shopify store to load live products, cart, and checkout.\";\n\n    renderProducts(\n      demoProducts(),\n    );\n\n    return;\n  }\n\n  elements.status\n    .textContent =\n      \"Connected storefront\";\n\n  try {\n    const products =\n      await commerce\n        .listProducts();\n\n    renderProducts(\n      products,\n    );\n\n    await restoreCart();\n  } catch (error) {\n    elements.status\n      .textContent =\n        error instanceof Error\n          ? error.message\n          : \"Unable to load storefront.\";\n\n    renderProducts(\n      [],\n    );\n  }\n}\n\nstart();\n",
    },
    {
      path: "COMMERCE.md",
      content: "# ZoeBuild commerce storefront\n\nThis template separates **design** from **commerce mechanics**.\n\n## Zoe may change\n\n- `src/design/theme.css`\n- `src/design/content.js`\n- `src/design/layout.js`\n- presentation-oriented regions in `index.html`\n\n## Zoe must not replace\n\n- Storefront API request mechanics\n- cart creation / cart mutations\n- checkout handoff\n- payment handling\n- credentials\n- merchant product/order data\n\nThose responsibilities belong to the trusted commerce foundation and the connected commerce provider.\n\n## Connect a store\n\nSet the permanent `*.myshopify.com` domain in:\n\n`src/commerce/config.js`\n\nDo not put Admin API tokens, private access tokens, card data, or OAuth secrets in generated source.\n\nThe baseline storefront uses the tokenless Storefront API surface for products and cart. Checkout is completed through the checkout URL returned by the commerce provider.\n\nCustomer Account API support is intentionally separate and is not enabled by this baseline template.\n",
    },
  ],

  entryPath: "index.html",

  // Zero dependency installation keeps the standard
  // storefront extremely cheap to build and preview.
  dependencyLock: null,
} as const satisfies BuildTemplateDefinition;


export const BUILD_TEMPLATES_V1 = [
  COMMERCE_STOREFRONT_TEMPLATE_V1,
  STATIC_HTML_TEMPLATE_V1,
  REACT_VITE_TEMPLATE_V1,
] as const satisfies readonly BuildTemplateDefinition[];

function assertTemplateRegistry(
  templates: readonly BuildTemplateDefinition[],
): void {
  const seen = new Set<string>();

  for (const template of templates) {
    if (seen.has(template.id)) {
      throw new Error(`Duplicate ZoeBuild template id: ${template.id}`);
    }
    seen.add(template.id);

    if (!template.files.length) {
      throw new Error(`ZoeBuild template has no files: ${template.id}`);
    }
  }
}

assertTemplateRegistry(BUILD_TEMPLATES_V1);

export function listBuildTemplates(): readonly BuildTemplateDefinition[] {
  return BUILD_TEMPLATES_V1;
}

export function getBuildTemplate(
  templateId: string,
): BuildTemplateDefinition | undefined {
  return BUILD_TEMPLATES_V1.find((template) => template.id === templateId);
}

export function requireBuildTemplate(
  templateId: string,
): BuildTemplateDefinition {
  const template = getBuildTemplate(templateId);
  if (!template) {
    throw new Error(`Unsupported ZoeBuild template: ${templateId}`);
  }
  return template;
}
