// src/lib/practice/catalog/slugs.ts
import { GENERATED_CATALOG } from "@/lib/practice/catalog/generatedCatalog";

export type CatalogSubject = keyof typeof GENERATED_CATALOG;

export type ModulesBySlug<S extends CatalogSubject> =
    (typeof GENERATED_CATALOG)[S]["modulesBySlug"];

export type CatalogModule<S extends CatalogSubject> =
    keyof ModulesBySlug<S>;

export type CatalogModuleDef<
    S extends CatalogSubject,
    M extends CatalogModule<S>,
> = ModulesBySlug<S>[M];

export function getModuleSlugs<
    const S extends CatalogSubject,
    const M extends CatalogModule<S>,
>(subject: S, module: M) {
  const mod = GENERATED_CATALOG[subject].modulesBySlug[module];

  return {
    subject,
    module,
    section: mod.sectionSlug,
    title: mod.sectionTitle,
    order: mod.sectionOrder,
    genKey: mod.genKey,
    prefix: mod.prefix,
    topics: mod.topics,
    topicIds: mod.topicIds,
  } as const;
}


//
//
//
// src/lib/practice/catalog/slugs.ts
// import { GENERATED_CATALOG } from "@/lib/practice/catalog/generatedCatalog";
//
// export type CatalogSubject = keyof typeof GENERATED_CATALOG;
//
// export type ModulesBySlug<S extends CatalogSubject> =
//     (typeof GENERATED_CATALOG)[S]["modulesBySlug"];
//
// export type CatalogModule<S extends CatalogSubject> = keyof ModulesBySlug<S>;
//
// export type CatalogModuleDef<
//     S extends CatalogSubject,
//     M extends CatalogModule<S>,
// > = ModulesBySlug<S>[M];
//
// function readSectionSlug(mod: unknown): string {
//   if (mod && typeof mod === "object") {
//     const m = mod as any;
//     const v =
//         (typeof m.sectionSlug === "string" && m.sectionSlug) ||
//         (typeof m.section === "string" && m.section) ||
//         "";
//     return v;
//   }
//   return "";
// }
//
// function readSectionTitle(mod: unknown): string {
//   if (mod && typeof mod === "object") {
//     const m = mod as any;
//     const v =
//         (typeof m.sectionTitle === "string" && m.sectionTitle) ||
//         (typeof m.title === "string" && m.title) ||
//         "";
//     return v;
//   }
//   return "";
// }
//
// function readSectionOrder(mod: unknown): number {
//   if (mod && typeof mod === "object") {
//     const m = mod as any;
//     const v =
//         (typeof m.sectionOrder === "number" && m.sectionOrder) ||
//         (typeof m.order === "number" && m.order) ||
//         0;
//     return Number.isFinite(v) ? v : 0;
//   }
//   return 0;
// }
//
// export function getModuleSlugs<
//     const S extends CatalogSubject,
//     const M extends CatalogModule<S>,
// >(subject: S, module: M) {
//   // ✅ boundary cast so generic indexing works
//   const modules = GENERATED_CATALOG[subject].modulesBySlug as ModulesBySlug<S>;
//   const mod = modules[module] as CatalogModuleDef<S, M>;
//
//   // ✅ DO NOT assume these keys exist in the inferred type
//   const section = readSectionSlug(mod);
//   const title = readSectionTitle(mod);
//   const order = readSectionOrder(mod);
//
//   return {
//     subject,
//     module,
//     section,
//     genKey: (mod as any).genKey,
//     prefix: (mod as any).prefix,
//
//     // ✅ keep topics typed from the generated constant (fixes AI_TOPIC unknown)
//     topics: (mod as any).topics,
//     topicIds: (mod as any).topicIds,
//
//     title,
//     order,
//   } as const;
// }