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

export const COMMERCE_STATIC_TEMPLATE_V1 = {
  id: "commerce-static-v1",

  stackIds: [
    "commerce-static-v1",
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
      path: "src/commerce/provider.js",
      content: "/* TRUSTED COMMERCE FACADE. */\n\nfunction binding() {\n  const candidate =\n    globalThis.__ZOEBUILD_COMMERCE__;\n\n  if (\n    !candidate ||\n    candidate.version !== 1 ||\n    !candidate.products ||\n    !candidate.cart ||\n    !candidate.checkout\n  ) {\n    return null;\n  }\n\n  return candidate;\n}\n\nfunction requiredBinding() {\n  const value = binding();\n\n  if (!value) {\n    throw new Error(\n      \"Commerce is not connected to a trusted ZoeBuild resource.\",\n    );\n  }\n\n  return value;\n}\n\nexport const commerce = {\n  isConfigured() {\n    return Boolean(binding());\n  },\n\n  products: {\n    list(input = {}) {\n      return requiredBinding().products.list(input);\n    },\n    get(input) {\n      return requiredBinding().products.get(input);\n    },\n  },\n\n  cart: {\n    get(input) {\n      return requiredBinding().cart.get(input);\n    },\n    add(input) {\n      return requiredBinding().cart.add(input);\n    },\n    update(input) {\n      return requiredBinding().cart.update(input);\n    },\n    remove(input) {\n      return requiredBinding().cart.remove(input);\n    },\n  },\n\n  checkout: {\n    begin(input) {\n      return requiredBinding().checkout.begin(input);\n    },\n  },\n};\n",
    },
    {
      path: "src/app.js",
      content: "import {\n  storefrontContent,\n} from \"./design/content.js\";\n\nimport {\n  storefrontLayout,\n} from \"./design/layout.js\";\n\nimport {\n  commerce,\n} from \"./commerce/provider.js\";\n\nconst CART_STORAGE_KEY =\n  \"zoebuild-commerce-cart-id\";\n\nconst elements = {\n  brand: document.querySelector(\"#brand-name\"),\n  eyebrow: document.querySelector(\"#hero-eyebrow\"),\n  heroTitle: document.querySelector(\"#hero-title\"),\n  heroBody: document.querySelector(\"#hero-body\"),\n  heroCta: document.querySelector(\"#hero-cta\"),\n  featuredHeading: document.querySelector(\"#featured-heading\"),\n  storyHeading: document.querySelector(\"#story-heading\"),\n  storyBody: document.querySelector(\"#story-body\"),\n  productGrid: document.querySelector(\"#product-grid\"),\n  status: document.querySelector(\"#commerce-status\"),\n  cartButton: document.querySelector(\"#cart-button\"),\n  cartCount: document.querySelector(\"#cart-count\"),\n  cartPanel: document.querySelector(\"#cart-panel\"),\n  cartClose: document.querySelector(\"#cart-close\"),\n  cartSummary: document.querySelector(\"#cart-summary\"),\n  checkout: document.querySelector(\"#checkout-button\"),\n};\n\nlet cart = null;\n\nfunction applyDesign() {\n  document.body.dataset.heroAlignment =\n    storefrontLayout.heroAlignment;\n  document.body.dataset.productDensity =\n    storefrontLayout.productDensity;\n  document.body.dataset.cardTreatment =\n    storefrontLayout.cardTreatment;\n\n  elements.brand.textContent = storefrontContent.brandName;\n  elements.eyebrow.textContent = storefrontContent.eyebrow;\n  elements.heroTitle.textContent = storefrontContent.heroTitle;\n  elements.heroBody.textContent = storefrontContent.heroBody;\n  elements.heroCta.textContent = storefrontContent.heroCta;\n  elements.featuredHeading.textContent = storefrontContent.featuredHeading;\n  elements.storyHeading.textContent = storefrontContent.storyHeading;\n  elements.storyBody.textContent = storefrontContent.storyBody;\n  document.title = storefrontContent.brandName;\n}\n\nfunction previewProducts() {\n  return [\n    { id: \"preview-1\", title: \"Signature piece\", preview: true },\n    { id: \"preview-2\", title: \"Everyday essential\", preview: true },\n    { id: \"preview-3\", title: \"New arrival\", preview: true },\n    { id: \"preview-4\", title: \"Limited edit\", preview: true },\n  ];\n}\n\nfunction productCard(product) {\n  const article = document.createElement(\"article\");\n  article.className = \"product-card\";\n\n  const media = document.createElement(\"div\");\n  media.className = \"product-media\";\n\n  const placeholder = document.createElement(\"div\");\n  placeholder.className = \"product-media-placeholder\";\n  placeholder.textContent = product.title;\n  media.append(placeholder);\n\n  const meta = document.createElement(\"div\");\n  meta.className = \"product-meta\";\n\n  const title = document.createElement(\"h3\");\n  title.className = \"product-title\";\n  title.textContent = product.title;\n  meta.append(title);\n\n  const add = document.createElement(\"button\");\n  add.type = \"button\";\n  add.textContent = product.preview ? \"Commerce preview\" : \"Add to cart\";\n  add.disabled = Boolean(product.preview) || !product.defaultMerchandiseId;\n\n  if (product.defaultMerchandiseId && !product.preview) {\n    add.addEventListener(\"click\", () => {\n      void addToCart(product.defaultMerchandiseId);\n    });\n  }\n\n  article.append(media, meta, add);\n  return article;\n}\n\nfunction renderProducts(products) {\n  elements.productGrid.replaceChildren(\n    ...products.map(productCard),\n  );\n}\n\nfunction updateCartUi() {\n  const quantity = cart?.totalQuantity ?? 0;\n  elements.cartCount.textContent = String(quantity);\n  elements.cartSummary.textContent =\n    quantity > 0\n      ? `${quantity} item${quantity === 1 ? \"\" : \"s\"} ready for checkout.`\n      : \"Your cart is empty.\";\n  elements.checkout.disabled = !cart?.id;\n}\n\nasync function addToCart(merchandiseId) {\n  try {\n    cart = await commerce.cart.add({\n      cartId: localStorage.getItem(CART_STORAGE_KEY),\n      merchandiseId,\n      quantity: 1,\n    });\n\n    if (!cart?.id) {\n      throw new Error(\"The trusted commerce binding did not return a cart.\");\n    }\n\n    localStorage.setItem(CART_STORAGE_KEY, cart.id);\n    updateCartUi();\n    elements.cartPanel.hidden = false;\n  } catch (error) {\n    elements.status.textContent =\n      error instanceof Error\n        ? error.message\n        : \"Unable to update cart.\";\n  }\n}\n\nasync function restoreCart() {\n  const cartId = localStorage.getItem(CART_STORAGE_KEY);\n  if (!cartId) return;\n\n  try {\n    cart = await commerce.cart.get({ cartId });\n    if (!cart) localStorage.removeItem(CART_STORAGE_KEY);\n    updateCartUi();\n  } catch {\n    localStorage.removeItem(CART_STORAGE_KEY);\n  }\n}\n\nasync function beginCheckout() {\n  if (!cart?.id) return;\n\n  try {\n    const checkout = await commerce.checkout.begin({ cartId: cart.id });\n    if (!checkout?.url) {\n      throw new Error(\"The trusted commerce binding did not return a checkout URL.\");\n    }\n    window.location.assign(checkout.url);\n  } catch (error) {\n    elements.status.textContent =\n      error instanceof Error\n        ? error.message\n        : \"Unable to begin checkout.\";\n  }\n}\n\nasync function start() {\n  applyDesign();\n\n  elements.cartButton.addEventListener(\"click\", () => {\n    elements.cartPanel.hidden = false;\n  });\n  elements.cartClose.addEventListener(\"click\", () => {\n    elements.cartPanel.hidden = true;\n  });\n  elements.checkout.addEventListener(\"click\", () => {\n    void beginCheckout();\n  });\n\n  if (!commerce.isConfigured()) {\n    elements.status.textContent =\n      \"Commerce preview \u2014 connect a trusted store resource to load live products, cart, and checkout.\";\n    renderProducts(previewProducts());\n    return;\n  }\n\n  elements.status.textContent = \"Connected storefront\";\n\n  try {\n    const products = await commerce.products.list({ first: 12 });\n    renderProducts(products);\n    await restoreCart();\n  } catch (error) {\n    elements.status.textContent =\n      error instanceof Error\n        ? error.message\n        : \"Unable to load storefront.\";\n    renderProducts([]);\n  }\n}\n\nstart();\n",
    },
    {
      path: "COMMERCE.md",
      content: "# ZoeBuild commerce storefront\n\nGenerated presentation code depends on a trusted provider-neutral commerce binding.\n\nThe project commerce plan selects ZoeBuild Native or an external provider and selects the storefront runtime. Generated source does not select Shopify, Stripe, payment providers, tax engines, credentials, or secret keys.\n\nAt runtime ZoeBuild supplies an authorized __ZOEBUILD_COMMERCE__ binding. If it is absent, the storefront remains a design preview and live commerce actions fail closed.\n\nNever put API tokens, private credentials, secret keys, or raw card data in generated source.\n",
    },
  ],

  entryPath: "index.html",

  // Zero dependency installation keeps the standard
  // storefront extremely cheap to build and preview.
  dependencyLock: null,
} as const satisfies BuildTemplateDefinition;


function commerceStaticFile(path: string): string {
  const file =
    COMMERCE_STATIC_TEMPLATE_V1.files.find(
      (candidate) => candidate.path === path,
    );

  if (!file) {
    throw new Error(
      `Commerce static template is missing ${path}.`,
    );
  }

  return file.content;
}

const COMMERCE_REACT_TSCONFIG =
  REACT_TSCONFIG.replace(
    '"allowJs": false',
    '"allowJs": true',
  );

const COMMERCE_REACT_APP = String.raw`import { useEffect, useState } from "react";
import { storefrontContent } from "./design/content.js";
import { commerce } from "./commerce/provider.js";

type Product = {
  id: string;
  title: string;
  preview?: boolean;
};

const previewProducts: Product[] = [
  { id: "preview-1", title: "Signature piece", preview: true },
  { id: "preview-2", title: "Everyday essential", preview: true },
  { id: "preview-3", title: "New arrival", preview: true },
];

export default function App() {
  const [products, setProducts] = useState<Product[]>(previewProducts);
  const [status, setStatus] = useState(
    commerce.isConfigured()
      ? "Connected storefront"
      : "Commerce preview — connect a trusted store resource.",
  );

  useEffect(() => {
    if (!commerce.isConfigured()) return;

    void commerce.products.list({ first: 24 })
      .then((items: Product[]) => setProducts(items))
      .catch((error: unknown) => {
        setStatus(
          error instanceof Error
            ? error.message
            : "Unable to load storefront.",
        );
      });
  }, []);

  return (
    <main className="commerce-app">
      <p className="commerce-status">{status}</p>
      <p className="eyebrow">{storefrontContent.eyebrow}</p>
      <h1>{storefrontContent.heroTitle}</h1>
      <p>{storefrontContent.heroBody}</p>
      <section className="product-grid">
        {products.map((product) => (
          <article key={product.id} className="product-card">
            <div className="product-media" />
            <h2>{product.title}</h2>
            <button type="button" disabled={Boolean(product.preview)}>
              {product.preview ? "Commerce preview" : "Add to cart"}
            </button>
          </article>
        ))}
      </section>
    </main>
  );
}
`;

const COMMERCE_REACT_CSS = String.raw`@import "./design/theme.css";

* { box-sizing: border-box; }
body { margin: 0; font-family: Inter, ui-sans-serif, system-ui, sans-serif; background: var(--surface); color: var(--text); }
.commerce-app { width: min(1180px, calc(100% - 40px)); margin: 0 auto; padding: 48px 0 96px; }
.commerce-status { color: var(--muted); }
.eyebrow { color: var(--accent); font-weight: 800; text-transform: uppercase; letter-spacing: .12em; }
h1 { max-width: 900px; font-size: clamp(3rem, 8vw, 7rem); line-height: .94; letter-spacing: -.06em; }
.product-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: var(--grid-gap); margin-top: 56px; }
.product-card { min-width: 0; }
.product-media { aspect-ratio: 4 / 5; border-radius: var(--radius-card); background: linear-gradient(145deg, var(--art-start), var(--art-end)); }
.product-card button { width: 100%; min-height: 42px; border: 1px solid var(--border); border-radius: var(--radius-button); background: transparent; color: inherit; }
`;

export const COMMERCE_REACT_VITE_TEMPLATE_V1 = {
  id: "commerce-react-vite-v1",
  stackIds: ["commerce-react-vite-v1"],
  workspaceLanguage: "web",
  files: [
    { path: "package.json", content: REACT_PACKAGE_JSON },
    { path: "index.html", content: REACT_INDEX_HTML },
    { path: "src/main.tsx", content: REACT_MAIN },
    { path: "src/App.tsx", content: COMMERCE_REACT_APP },
    { path: "src/styles.css", content: COMMERCE_REACT_CSS },
    { path: "src/design/theme.css", content: commerceStaticFile("src/design/theme.css") },
    { path: "src/design/content.js", content: commerceStaticFile("src/design/content.js") },
    { path: "src/design/layout.js", content: commerceStaticFile("src/design/layout.js") },
    { path: "src/commerce/provider.js", content: commerceStaticFile("src/commerce/provider.js") },
    { path: "COMMERCE.md", content: commerceStaticFile("COMMERCE.md") },
    { path: "tsconfig.json", content: COMMERCE_REACT_TSCONFIG },
    { path: "vite.config.ts", content: REACT_VITE_CONFIG },
  ],
  entryPath: "src/main.tsx",
  activePath: "src/App.tsx",
  openPaths: ["src/App.tsx", "src/styles.css", "src/design/theme.css"],
  leftPct: 26,
  dependencyLock: {
    manager: "pnpm",
    policy: "generate-once",
    lockfilePath: "pnpm-lock.yaml",
  },
} as const satisfies BuildTemplateDefinition;

export const BUILD_TEMPLATES_V1 = [
  COMMERCE_STATIC_TEMPLATE_V1,
  COMMERCE_REACT_VITE_TEMPLATE_V1,
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
