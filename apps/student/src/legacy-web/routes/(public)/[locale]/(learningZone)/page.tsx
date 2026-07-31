// export const runtime = "nodejs";
// export const dynamic = "force-dynamic";
// import HomePageAvatarOnboarding from "@/app/(public)/[locale]/(learningZone)/HomeClient";
//
// export default async function HomePage() {
//
//     return (
//        <HomePageAvatarOnboarding/>
//     );
// }


import HomePageAvatarOnboardingServer from "@/components/home/onboarding/HomePageAvatarOnboardingServer";

export default async function HomePage({
                                           params,
                                       }: {
    params: Promise<{ locale: string }>;
}) {
    const { locale } = await params;

    return <HomePageAvatarOnboardingServer locale={locale} />;
}



//
//
//
// // src/app/[locale]/page.tsx
// import React from "react";
// import type { Metadata } from "next";
// import Image from "next/image";
// import { Link } from "@/i18n/navigation";
// import { getTranslations } from "next-intl/server";
// import { cn } from "@/lib/cn";
// import { ROUTES } from "@/utils";
// import {AppLocale} from "@/lib/seo/types";
// import {getRouteSeo, getSharedSeo} from "@/lib/seo/getSeo";
// import {buildMetadata} from "@/lib/seo/buildMetadata";
//
// function CheckIcon(props: React.SVGProps<SVGSVGElement>) {
//   return (
//       <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" {...props}>
//         <path
//             fillRule="evenodd"
//             d="M16.704 5.29a1 1 0 010 1.414l-7.25 7.25a1 1 0 01-1.414 0l-3.25-3.25A1 1 0 016.204 9.29l2.543 2.543 6.543-6.543a1 1 0 011.414 0z"
//             clipRule="evenodd"
//         />
//       </svg>
//   );
// }
//
// function Container({ children }: { children: React.ReactNode }) {
//   return <div className="ui-container">{children}</div>;
// }
//
// function Pill({ children }: { children: React.ReactNode }) {
//   return <span className="ui-home-pill">{children}</span>;
// }
//
// function SectionKicker({ children }: { children: React.ReactNode }) {
//   return <div className="ui-section-kicker">{children}</div>;
// }
//
// function SectionTitle({ children }: { children: React.ReactNode }) {
//   return <h2 className="ui-section-title">{children}</h2>;
// }
//
// function SectionSubtitle({ children }: { children: React.ReactNode }) {
//   return <p className="ui-section-subtitle">{children}</p>;
// }
//
// function ButtonLink({
//                       href,
//                       children,
//                       variant = "primary",
//                     }: {
//   href: string;
//   children: React.ReactNode;
//   variant?: "primary" | "secondary" | "ghost";
// }) {
//   const styles =
//       variant === "primary"
//           ? "ui-btn-primary"
//           : variant === "secondary"
//               ? "ui-btn-secondary"
//               : "ui-btn-ghost";
//
//   return (
//       <Link href={href} className={cn("ui-btn", styles)}>
//         {children}
//       </Link>
//   );
// }
//
// /* ---------------------------- hero preview (generic) ---------------------------- */
//
// type HeroPanel = {
//   label: string;
//   text: string;
//   demo?: "tokens" | "quiz" | "progress";
// };
//
// type DemoProgressRow = { k: string; v: number };
//
// function DemoTokens({ tokens }: { tokens: string[] }) {
//   if (!tokens?.length) return null;
//   return (
//       <div className="mt-3 flex flex-wrap gap-2">
//         {tokens.map((t) => (
//             <span
//                 key={t}
//                 className="rounded-xl border border-neutral-200 bg-white px-2.5 py-1 text-xs font-semibold text-neutral-800 shadow-sm dark:border-white/10 dark:bg-white/5 dark:text-white/85 dark:shadow-none"
//             >
//           {t}
//         </span>
//         ))}
//       </div>
//   );
// }
//
// function DemoQuiz({
//                     options,
//                     selectedIndex = 0,
//                   }: {
//   options: string[];
//   selectedIndex?: number;
// }) {
//   if (!options?.length) return null;
//   return (
//       <div className="mt-3 space-y-2">
//         {options.map((o, idx) => {
//           const selected = idx === selectedIndex;
//           return (
//               <div
//                   key={o}
//                   className={cn(
//                       "flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-xs",
//                       selected
//                           ? "border-emerald-300/40 bg-emerald-300/10"
//                           : "border-neutral-200 bg-white dark:border-white/10 dark:bg-white/5",
//                   )}
//               >
//             <span className="font-semibold text-neutral-800 dark:text-white/85">
//               {o}
//             </span>
//                 <span
//                     className={cn(
//                         "inline-flex h-5 w-5 items-center justify-center rounded-full",
//                         selected
//                             ? "bg-emerald-400/20 text-emerald-700 dark:text-emerald-200"
//                             : "bg-neutral-200 text-neutral-600 dark:bg-white/10 dark:text-white/60",
//                     )}
//                     aria-hidden
//                 >
//               {selected ? <CheckIcon className="h-3.5 w-3.5" /> : "•"}
//             </span>
//               </div>
//           );
//         })}
//       </div>
//   );
// }
//
// function DemoProgress({
//                         rows,
//                         suffix,
//                       }: {
//   rows: DemoProgressRow[];
//   suffix: string;
// }) {
//   if (!rows?.length) return null;
//   return (
//       <div className="mt-3 space-y-2">
//         {rows.map((r) => (
//             <div key={r.k} className="flex items-center gap-3">
//               <div className="w-16 text-[11px] font-semibold text-neutral-600 dark:text-white/70">
//                 {r.k}
//               </div>
//               <div className="h-2 flex-1 overflow-hidden rounded-full bg-neutral-200 dark:bg-white/10">
//                 <div
//                     className="h-full rounded-full bg-emerald-400/70"
//                     style={{ width: `${r.v}%` }}
//                     aria-hidden
//                 />
//               </div>
//               <div className="w-10 text-right text-[11px] font-semibold text-neutral-600 dark:text-white/70">
//                 {r.v}
//                 {suffix}
//               </div>
//             </div>
//         ))}
//       </div>
//   );
// }
//
// function HeroPanelCard({
//                          label,
//                          text,
//                          demo,
//                          assetNote,
//                          demoTokens,
//                          demoQuizOptions,
//                          demoQuizSelectedIndex,
//                          demoProgressRows,
//                          demoProgressSuffix,
//                        }: {
//   label: string;
//   text: string;
//   demo?: HeroPanel["demo"];
//   assetNote: string;
//
//   demoTokens: string[];
//   demoQuizOptions: string[];
//   demoQuizSelectedIndex: number;
//   demoProgressRows: DemoProgressRow[];
//   demoProgressSuffix: string;
// }) {
//   return (
//       <div className={cn("ui-soft", "p-3")}>
//         <div className="text-xs font-semibold text-neutral-600 dark:text-white/70">
//           {label}
//         </div>
//         <div className="mt-1 text-sm text-neutral-900 dark:text-white/90">
//           {text}
//         </div>
//
//         {demo === "tokens" ? <DemoTokens tokens={demoTokens} /> : null}
//         {demo === "quiz" ? (
//             <DemoQuiz
//                 options={demoQuizOptions}
//                 selectedIndex={demoQuizSelectedIndex}
//             />
//         ) : null}
//         {demo === "progress" ? (
//             <DemoProgress rows={demoProgressRows} suffix={demoProgressSuffix} />
//         ) : null}
//
//         {/*<div className="mt-2 text-xs text-neutral-500 dark:text-white/60">*/}
//         {/*  {assetNote}*/}
//         {/*</div>*/}
//       </div>
//   );
// }
//
// /* -------------------------------- images (presentable) -------------------------------- */
//
// function PhotoCard({
//                      src,
//                      alt,
//                      priority,
//                      className,
//                      sizes,
//                    }: {
//   src: string;
//   alt: string;
//   priority?: boolean;
//   className?: string;
//   sizes: string;
// }) {
//   return (
//       <div
//           className={cn(
//               "relative overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm dark:border-white/10 dark:bg-white/[0.03] dark:shadow-none",
//               className,
//           )}
//       >
//         <Image
//             src={src}
//             alt={alt}
//             fill
//             priority={priority}
//             className="object-cover"
//             sizes={sizes}
//         />
//         {/* subtle overlay for readability on both themes */}
//         <div
//             aria-hidden
//             className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/25 via-black/0 to-transparent dark:from-black/35"
//         />
//       </div>
//   );
// }
//
// function HeroPhotoMosaic({
//                              alt1,
//                              alt2,
//                              alt3,
//                              badge1,
//                              badge2,
//                          }: {
//     alt1: string;
//     alt2: string;
//     alt3: string;
//     badge1?: string;
//     badge2?: string;
// }) {
//     return (
//         <div className={cn("ui-card", "p-4")}>
//             <div className="mt-1 grid gap-3">
//                 <div className="grid grid-cols-2 gap-3">
//                     <PhotoCard
//                         src="/images/home/student-smile.png"
//                         alt={alt1}
//                         priority
//                         className="aspect-[4/3]"
//                         sizes="(min-width: 1024px) 220px, 50vw"
//                     />
//                     <PhotoCard
//                         src="/images/home/study-group.png"
//                         alt={alt2}
//                         className="aspect-[4/3]"
//                         sizes="(min-width: 1024px) 220px, 50vw"
//                     />
//                 </div>
//
//                 <PhotoCard
//                     src="/images/home/laptop-notes.png"
//                     alt={alt3}
//                     className="aspect-[16/9]"
//                     sizes="(min-width: 1024px) 460px, 100vw"
//                 />
//             </div>
//
//             {(badge1 || badge2) && (
//                 <div className="mt-3 flex flex-wrap gap-2">
//                     {badge1 ? (
//                         <span className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-3 py-1 text-xs font-semibold text-neutral-700 shadow-sm dark:border-white/10 dark:bg-white/5 dark:text-white/80 dark:shadow-none">
//               <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
//                             {badge1}
//             </span>
//                     ) : null}
//
//                     {badge2 ? (
//                         <span className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-3 py-1 text-xs font-semibold text-neutral-700 shadow-sm dark:border-white/10 dark:bg-white/5 dark:text-white/80 dark:shadow-none">
//               <span className="h-1.5 w-1.5 rounded-full bg-indigo-400" />
//                             {badge2}
//             </span>
//                     ) : null}
//                 </div>
//             )}
//         </div>
//     );
// }
//
// /* ---------------------------------- metadata ---------------------------------- */
//
// // export async function generateMetadata({
// //                                          params,
// //                                        }: {
// //   params: Promise<{ locale: string }>;
// // }): Promise<Metadata> {
// //   const { locale } = await params;
// //   const t = await getTranslations({ locale, namespace: "Home" });
// //   const appName = process.env.APP_NAME ?? "Learnoir";
// //
// //   const title = t("meta.title", { appName });
// //   const description = t("meta.description");
// //
// //   return {
// //     title,
// //     description,
// //     applicationName: process.env.APP_NAME,
// //     openGraph: { title, description, type: "website" },
// //     twitter: { card: "summary_large_image", title, description },
// //   };
// // }
//
// export async function generateMetadata(
//     { params }: { params: Promise<{ locale: string }> }
// ): Promise<Metadata> {
//     const { locale } = await params;
//     const l = locale as AppLocale;
//
//     const seo = await getRouteSeo(l, "home");
//     const shared = await getSharedSeo(l);
//
//     return buildMetadata({
//         locale: l,
//         path: "/",
//         title: seo.title,
//         description: seo.description,
//         keywords: shared.keywords,
//         ogTitle: seo.ogTitle,
//         ogDescription: seo.ogDescription,
//         twitterTitle: seo.twitterTitle,
//         twitterDescription: seo.twitterDescription,
//         imageAlt: shared.defaultOgAlt
//     });
// }
//
// export default async function HomePage({
//                                          params,
//                                        }: {
//   params: Promise<{ locale: string }>;
// }) {
//   const { locale } = await params;
//   const t = await getTranslations({ locale, namespace: "Home" });
//
//   const heroPills = t.raw("hero.pills") as string[];
//   const trustItems = t.raw("trust.items") as Array<{ k: string; v: string }>;
//   const featureItems = t.raw("features.items") as Array<{
//     title: string;
//     desc: string;
//   }>;
//   const appName = process.env.APP_NAME ?? "Learnoir";
//
//   const subjectCards = t.raw("subjects.cards") as Array<{
//     title: string;
//     desc: string;
//     bullets: string[];
//     cta: string;
//     slug?: string;
//     href?: string;
//   }>;
//   const howSteps = t.raw("how.steps") as Array<{ title: string; desc: string }>;
//   const educatorBullets = t.raw("educators.bullets") as string[];
//   const testimonials = t.raw("testimonials.items") as Array<{
//     quote: string;
//     who: string;
//   }>;
//   const pricingTiers = t.raw("pricing.tiers") as Array<{
//     name: string;
//     price: string;
//     desc: string;
//     features: string[];
//     cta: string;
//     highlight: boolean;
//     href?: string;
//   }>;
//   const faqItems = t.raw("faq.items") as Array<{ q: string; a: string }>;
//
//   const year = new Date().getFullYear();
//
//   const subjectsWithRoutes = (subjectCards ?? []).map((s) => {
//     const href =
//         (s.href && String(s.href)) ||
//         (s.slug ? ROUTES.subjectModules(String(s.slug)) : ROUTES.catalog);
//     return { ...s, href };
//   });
//
//   // ✅ NEVER call t.raw() for panels unless the key exists (prevents MISSING_MESSAGE).
//   const has = (key: string) =>
//       typeof (t as any).has === "function" ? (t as any).has(key) : false;
//
//   const heroPanels: HeroPanel[] | null = has("ui.heroCard.panels")
//       ? (t.raw("ui.heroCard.panels") as HeroPanel[])
//       : null;
//
//   // ✅ Demo data (all translated; zero hardcoded text)
//   const demoTokens =
//       (has("ui.demos.tokens") ? (t.raw("ui.demos.tokens") as string[]) : []) ??
//       [];
//   const demoQuizOptions =
//       (has("ui.demos.quiz.options")
//           ? (t.raw("ui.demos.quiz.options") as string[])
//           : []) ?? [];
//   const demoQuizSelectedIndex =
//       (has("ui.demos.quiz.selectedIndex")
//           ? Number(t.raw("ui.demos.quiz.selectedIndex"))
//           : 0) || 0;
//
//   const demoProgressRows =
//       (has("ui.demos.progress.rows")
//           ? (t.raw("ui.demos.progress.rows") as Array<{ k: string; v: number }>)
//           : []) ?? [];
//
//   const demoProgressSuffix = has("ui.demos.progress.suffix")
//       ? String(t("ui.demos.progress.suffix"))
//       : "%";
//
//   const fallbackPanels: HeroPanel[] = [
//     { label: t("ui.heroCard.laLabel"), text: t("ui.heroCard.laText"), demo: "progress" },
//     { label: t("ui.heroCard.pyLabel"), text: t("ui.heroCard.pyText"), demo: "tokens" },
//   ];
//
//   const panels = (
//       heroPanels && Array.isArray(heroPanels) && heroPanels.length > 0
//           ? heroPanels
//           : fallbackPanels
//   ).slice(0, 3);
//     const heroBadge1 = has("ui.images.hero.badge1") ? String(t("ui.images.hero.badge1")) : "";
//     const heroBadge2 = has("ui.images.hero.badge2") ? String(t("ui.images.hero.badge2")) : "";
//   // Image alt text (translation-safe with fallbacks)
//   const heroAlt1 = has("ui.images.hero.alt1")
//       ? String(t("ui.images.hero.alt1"))
//       : "Smiling student learning";
//   const heroAlt2 = has("ui.images.hero.alt2")
//       ? String(t("ui.images.hero.alt2"))
//       : "Students studying together";
//   const heroAlt3 = has("ui.images.hero.alt3")
//       ? String(t("ui.images.hero.alt3"))
//       : "Laptop with notes and practice";
//
//   const educatorsAlt = has("ui.images.educators.alt")
//       ? String(t("ui.images.educators.alt"))
//       : "Educator and student learning";
//
//   return (
//       <main className="relative ui-playground-bg">        {/* Background glow */}
//         <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
//           <div className="absolute -top-40 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-emerald-400/10 blur-3xl" />
//           <div className="absolute top-[30%] right-[-120px] h-[420px] w-[420px] rounded-full bg-indigo-400/10 blur-3xl" />
//         </div>
//
//         {/* Hero */}
//         <section className="relative pt-12 sm:pt-16">
//           <Container>
//             <div className="grid gap-10 lg:grid-cols-12 lg:items-center">
//               <div className="lg:col-span-7">
//                 <div className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-3 py-1 text-xs font-semibold text-neutral-700 shadow-sm dark:border-white/10 dark:bg-white/5 dark:text-white/80 dark:shadow-none">
//                   <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
//                   {t("hero.badge")}
//                 </div>
//
//                 <h1 className="mt-5 text-3xl font-semibold leading-tight text-neutral-950 dark:text-white sm:text-4xl lg:text-5xl">
//                   {t("hero.title")}
//                 </h1>
//
//                 <p className="mt-4 max-w-2xl text-sm leading-6 text-neutral-600 dark:text-white/70 sm:text-base">
//                   {t("hero.subtitle", { appName })}
//                 </p>
//
//                 <div className="mt-6 flex flex-wrap gap-2">
//                   {heroPills.map((p) => (
//                       <Pill key={p}>{p}</Pill>
//                   ))}
//                 </div>
//
//                 <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
//                   <ButtonLink href={ROUTES.catalog} variant="primary">
//                     {t("hero.ctaPrimary")}
//                   </ButtonLink>
//                   <ButtonLink href={ROUTES.catalog} variant="secondary">
//                     {t("hero.ctaSecondary")}
//                   </ButtonLink>
//                 </div>
//
//                 <div className="mt-6 text-xs text-neutral-500 dark:text-white/60">
//                   {t("ui.tagline")}
//                 </div>
//               </div>
//
//               {/* Hero visual */}
//               <div className="lg:col-span-5 space-y-4">
//                 {/* Nice photo mosaic */}
//                 <HeroPhotoMosaic alt1={heroAlt1} alt2={heroAlt2} alt3={heroAlt3} badge1={heroBadge1}
//                                  badge2={heroBadge2}
//                 />
//
//                 {/* Your existing UI demo card */}
//                 <div className={cn("ui-card", "p-4")}>
//                   <div className="flex items-center justify-between">
//                     <div className="text-sm font-semibold text-neutral-900 dark:text-white/90">
//                       {t("ui.heroCard.title")}
//                     </div>
//                     <div className="text-xs text-neutral-500 dark:text-white/60">
//                       {t("ui.heroCard.subtitle")}
//                     </div>
//                   </div>
//
//                   <div className="mt-4 grid gap-3">
//                     {panels.map((p, idx) => (
//                         <HeroPanelCard
//                             key={`${p.label}-${idx}`}
//                             label={p.label}
//                             text={p.text}
//                             demo={
//                                 p.demo ??
//                                 (idx === 0 ? "progress" : idx === 1 ? "tokens" : "quiz")
//                             }
//                             assetNote={t("ui.heroCard.assetNote")}
//                             demoTokens={demoTokens}
//                             demoQuizOptions={demoQuizOptions}
//                             demoQuizSelectedIndex={demoQuizSelectedIndex}
//                             demoProgressRows={demoProgressRows}
//                             demoProgressSuffix={demoProgressSuffix}
//                         />
//                     ))}
//                   </div>
//                 </div>
//               </div>
//             </div>
//           </Container>
//         </section>
//
//         {/* Trust */}
//         <section
//             id="product"
//             className="relative mt-14 border-t border-neutral-200 py-14 dark:border-white/10"
//         >
//           <Container>
//             <div className="grid gap-10 lg:grid-cols-12">
//               <div className="lg:col-span-5">
//                 <SectionKicker>{t("trust.kicker")}</SectionKicker>
//                 <SectionTitle>{t("trust.title")}</SectionTitle>
//                 <SectionSubtitle>{t("trust.subtitle")}</SectionSubtitle>
//               </div>
//
//               <div className="lg:col-span-7">
//                 <div className="grid gap-4 sm:grid-cols-3">
//                   {trustItems.map((it) => (
//                       <div key={it.k} className={cn("ui-card", "p-4")}>
//                         <div className="text-sm font-semibold text-neutral-900 dark:text-white">
//                           {it.k}
//                         </div>
//                         <div className="mt-2 text-sm leading-6 text-neutral-600 dark:text-white/70">
//                           {it.v}
//                         </div>
//                       </div>
//                   ))}
//                 </div>
//               </div>
//             </div>
//           </Container>
//         </section>
//
//         {/* Features */}
//         <section className="relative py-14">
//           <Container>
//             <SectionKicker>{t("features.kicker")}</SectionKicker>
//             <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
//               <div>
//                 <SectionTitle>{t("features.title")}</SectionTitle>
//                 <SectionSubtitle>{t("features.subtitle")}</SectionSubtitle>
//               </div>
//               <div className="flex gap-2">
//                 <ButtonLink href={ROUTES.review} variant="secondary">
//                   {t("ui.tryReview")}
//                 </ButtonLink>
//                 <ButtonLink href={ROUTES.catalog} variant="primary">
//                   {t("hero.ctaPrimary")}
//                 </ButtonLink>
//               </div>
//             </div>
//
//             <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
//               {featureItems.map((f) => (
//                   <div key={f.title} className={cn("ui-card", "p-5")}>
//                     <div className="text-sm font-semibold text-neutral-900 dark:text-white">
//                       {f.title}
//                     </div>
//                     <div className="mt-2 text-sm leading-6 text-neutral-600 dark:text-white/70">
//                       {f.desc}
//                     </div>
//                   </div>
//               ))}
//             </div>
//           </Container>
//         </section>
//
//         {/* Subjects */}
//         <section
//             id="subjects"
//             className="relative border-t border-neutral-200 py-14 dark:border-white/10"
//         >
//           <Container>
//             <SectionKicker>{t("subjects.kicker")}</SectionKicker>
//             <SectionTitle>{t("subjects.title")}</SectionTitle>
//             <SectionSubtitle>{t("subjects.subtitle")}</SectionSubtitle>
//
//             <div className="mt-10 grid gap-4 lg:grid-cols-2">
//               {subjectsWithRoutes.map((s) => (
//                   <div key={s.title} className={cn("ui-card", "p-6")}>
//                     <div className="flex items-start justify-between gap-6">
//                       <div>
//                         <div className="text-lg font-semibold text-neutral-900 dark:text-white">
//                           {s.title}
//                         </div>
//                         <p className="mt-2 text-sm leading-6 text-neutral-600 dark:text-white/70">
//                           {s.desc}
//                         </p>
//                       </div>
//                       <div className="hidden h-12 w-12 shrink-0 rounded-2xl bg-emerald-400/10 ring-1 ring-emerald-300/20 lg:block" />
//                     </div>
//
//                     <ul className="mt-5 space-y-2">
//                       {s.bullets.map((b) => (
//                           <li
//                               key={b}
//                               className="flex items-center gap-2 text-sm text-neutral-700 dark:text-white/80"
//                           >
//                             <CheckIcon className="h-4 w-4 text-emerald-600 dark:text-emerald-300" />
//                             <span>{b}</span>
//                           </li>
//                       ))}
//                     </ul>
//
//                     <div className="mt-6">
//                       <ButtonLink href={s.href} variant="secondary">
//                         {s.cta}
//                       </ButtonLink>
//                     </div>
//                   </div>
//               ))}
//             </div>
//           </Container>
//         </section>
//
//         {/* How it works */}
//         <section className="relative py-14">
//           <Container>
//             <SectionKicker>{t("how.kicker")}</SectionKicker>
//             <SectionTitle>{t("how.title")}</SectionTitle>
//
//             <div className="mt-8 grid gap-4 md:grid-cols-3">
//               {howSteps.map((st, idx) => (
//                   <div key={st.title} className={cn("ui-card", "p-6")}>
//                     <div className="flex items-center gap-3">
//                       <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-neutral-200 bg-white text-neutral-900 shadow-sm dark:border-white/10 dark:bg-white/5 dark:text-white dark:shadow-none">
//                         <span className="text-sm font-semibold">{idx + 1}</span>
//                       </div>
//                       <div className="text-sm font-semibold text-neutral-900 dark:text-white">
//                         {st.title}
//                       </div>
//                     </div>
//                     <p className="mt-3 text-sm leading-6 text-neutral-600 dark:text-white/70">
//                       {st.desc}
//                     </p>
//                   </div>
//               ))}
//             </div>
//           </Container>
//         </section>
//
//         {/* Educators */}
//         <section className="relative border-t border-neutral-200 py-14 dark:border-white/10">
//           <Container>
//             <div className="grid gap-10 lg:grid-cols-12 lg:items-center">
//               <div className="lg:col-span-7">
//                 <SectionKicker>{t("educators.kicker")}</SectionKicker>
//                 <SectionTitle>{t("educators.title")}</SectionTitle>
//                 <SectionSubtitle>{t("educators.subtitle", { appName })}</SectionSubtitle>
//
//                 <ul className="mt-6 space-y-2">
//                   {educatorBullets.map((b) => (
//                       <li
//                           key={b}
//                           className="flex items-center gap-2 text-sm text-neutral-700 dark:text-white/80"
//                       >
//                         <CheckIcon className="h-4 w-4 text-emerald-600 dark:text-emerald-300" />
//                         <span>{b}</span>
//                       </li>
//                   ))}
//                 </ul>
//
//                 <div className="mt-7 flex gap-2">
//                   <ButtonLink href={ROUTES.contact} variant="primary">
//                     {t("educators.cta")}
//                   </ButtonLink>
//                   <ButtonLink href={ROUTES.catalog} variant="secondary">
//                     {t("ui.browseModules")}
//                   </ButtonLink>
//                 </div>
//               </div>
//
//               <div className="lg:col-span-5">
//                 <div className={cn("ui-card", "p-6")}>
//                   <div className="text-sm font-semibold text-neutral-900 dark:text-white">
//                     {t("ui.heroCard.title")}
//                   </div>
//                   <p className="mt-2 text-sm leading-6 text-neutral-600 dark:text-white/70">
//                     {t("ui.heroCard.subtitle")}
//                   </p>
//
//                   {/* Replaced placeholder gradient with a real image */}
//                   <div className="mt-4">
//                     <PhotoCard
//                         src="/images/home/educator-helping.png"
//                         alt={educatorsAlt}
//                         className="aspect-[16/10]"
//                         sizes="(min-width: 1024px) 420px, 100vw"
//                     />
//                   </div>
//
//                   <p className="mt-3 text-xs text-neutral-500 dark:text-white/60">
//                     {t("ui.heroCard.assetNote")}
//                   </p>
//                 </div>
//               </div>
//             </div>
//           </Container>
//         </section>
//
//         {/* Testimonials */}
//         <section className="relative py-14">
//           <Container>
//             <SectionKicker>{t("testimonials.kicker")}</SectionKicker>
//             <SectionTitle>{t("testimonials.title")}</SectionTitle>
//             <SectionSubtitle>{t("testimonials.subtitle")}</SectionSubtitle>
//
//             <div className="mt-8 grid gap-4 lg:grid-cols-3">
//               {testimonials.map((x, i) => (
//                   <div key={i} className={cn("ui-card", "p-6")}>
//                     <p className="text-sm leading-6 text-neutral-700 dark:text-white/80">
//                       “{x.quote}”
//                     </p>
//                     <div className="mt-4 text-xs font-semibold text-neutral-500 dark:text-white/60">
//                       {x.who}
//                     </div>
//                   </div>
//               ))}
//             </div>
//           </Container>
//         </section>
//
//         {/* Pricing */}
//         <section
//             id="pricing"
//             className="relative border-t border-neutral-200 py-14 dark:border-white/10"
//         >
//           <Container>
//             <SectionKicker>{t("pricing.kicker")}</SectionKicker>
//             <SectionTitle>{t("pricing.title")}</SectionTitle>
//             <SectionSubtitle>{t("pricing.subtitle")}</SectionSubtitle>
//
//             <div className="mt-10 grid gap-4 lg:grid-cols-3">
//               {pricingTiers.map((tier) => (
//                   <div
//                       key={tier.name}
//                       className={cn(
//                           "rounded-2xl border p-6",
//                           tier.highlight
//                               ? "border-emerald-300/40 bg-emerald-300/10 shadow-[0_0_0_1px_rgba(52,211,153,0.15)]"
//                               : "border-neutral-200 bg-white shadow-sm dark:border-white/10 dark:bg-white/[0.03] dark:shadow-none",
//                       )}
//                   >
//                     <div className="flex items-start justify-between">
//                       <div>
//                         <div className="text-sm font-semibold text-neutral-900 dark:text-white">
//                           {tier.name}
//                         </div>
//                         <div className="mt-2 text-3xl font-semibold text-neutral-950 dark:text-white">
//                           {tier.price}
//                         </div>
//                         <div className="mt-2 text-sm text-neutral-600 dark:text-white/70">
//                           {tier.desc}
//                         </div>
//                       </div>
//
//                       {tier.highlight ? (
//                           <span className="rounded-full bg-emerald-400/15 px-3 py-1 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-300/30 dark:text-emerald-200 dark:ring-emerald-300/20">
//                       {t("ui.recommended")}
//                     </span>
//                       ) : null}
//                     </div>
//
//                     <ul className="mt-5 space-y-2">
//                       {tier.features.map((f) => (
//                           <li
//                               key={f}
//                               className="flex items-center gap-2 text-sm text-neutral-700 dark:text-white/80"
//                           >
//                             <CheckIcon className="h-4 w-4 text-emerald-600 dark:text-emerald-300" />
//                             <span>{f}</span>
//                           </li>
//                       ))}
//                     </ul>
//
//                     <div className="mt-6">
//                       <ButtonLink
//                           href={tier.href ?? (tier.highlight ? ROUTES.pricing : ROUTES.catalog)}
//                           variant={tier.highlight ? "primary" : "secondary"}
//                       >
//                         {tier.cta}
//                       </ButtonLink>
//                     </div>
//                   </div>
//               ))}
//             </div>
//
//             {/*<p className="mt-6 text-xs text-neutral-500 dark:text-white/60">*/}
//             {/*  {t("pricing.note")}*/}
//             {/*</p>*/}
//           </Container>
//         </section>
//
//         {/* FAQ */}
//         <section id="faq" className="relative py-14">
//           <Container>
//             <SectionKicker>{t("faq.kicker")}</SectionKicker>
//             <SectionTitle>{t("faq.title")}</SectionTitle>
//
//             <div className="mt-8 grid gap-4 lg:grid-cols-2">
//                 {faqItems.map((it) => (
//                     <details key={it.q} className={cn("ui-card", "group p-5")}>
//                         <summary className="cursor-pointer list-none text-sm font-semibold text-neutral-900 dark:text-white">
//                             <div className="flex items-center justify-between gap-4">
//                                 <span>{it.q}</span>
//                                 <span className="text-neutral-500 transition group-open:rotate-180 dark:text-white/50">
//           ▾
//         </span>
//                             </div>
//                         </summary>
//
//                         <p className="mt-3 text-sm leading-6 text-neutral-600 dark:text-white/70">
//                             {it.a.replaceAll("{appName}", appName)}
//                         </p>
//                     </details>
//                 ))}
//             </div>
//           </Container>
//         </section>
//
//         {/* Final CTA + Footer */}
//         <section className="relative border-t border-neutral-200 py-14 dark:border-white/10">
//           <Container>
//             <div className="rounded-2xl border border-neutral-200 bg-gradient-to-br from-emerald-400/10 to-white p-8 shadow-sm dark:border-white/10 dark:to-white/[0.02] dark:shadow-none">
//               <div className="grid gap-6 lg:grid-cols-12 lg:items-center">
//                 <div className="lg:col-span-8">
//                   <h3 className="text-xl font-semibold text-neutral-900 dark:text-white sm:text-2xl">
//                     {t("finalCta.title")}
//                   </h3>
//                   <p className="mt-2 text-sm leading-6 text-neutral-600 dark:text-white/70">
//                     {t("finalCta.subtitle")}
//                   </p>
//                 </div>
//                 <div className="flex flex-col gap-2 sm:flex-row lg:col-span-4 lg:justify-end">
//                   <ButtonLink href={ROUTES.catalog} variant="primary">
//                     {t("finalCta.primary")}
//                   </ButtonLink>
//                   <ButtonLink href={ROUTES.catalog} variant="secondary">
//                     {t("finalCta.secondary")}
//                   </ButtonLink>
//                 </div>
//               </div>
//             </div>
//
//             <footer className="mt-10 border-t border-neutral-200 pt-8 dark:border-white/10">
//               <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
//                 <div className="text-sm text-neutral-600 dark:text-white/70">
//                   {t("footer.rights", { year, appName })}
//                 </div>
//
//                 <div className="flex flex-wrap gap-x-4 gap-y-2">
//                   <Link
//                       href={ROUTES.catalog}
//                       className="text-sm text-neutral-600 hover:text-neutral-950 dark:text-white/60 dark:hover:text-white"
//                   >
//                     {t("footer.links.catalog")}
//                   </Link>
//                   <Link
//                       href={ROUTES.review}
//                       className="text-sm text-neutral-600 hover:text-neutral-950 dark:text-white/60 dark:hover:text-white"
//                   >
//                     {t("footer.links.review")}
//                   </Link>
//                   <Link
//                       href={ROUTES.pricing}
//                       className="text-sm text-neutral-600 hover:text-neutral-950 dark:text-white/60 dark:hover:text-white"
//                   >
//                     {t("footer.links.pricing")}
//                   </Link>
//                   <Link
//                       href={ROUTES.contact}
//                       className="text-sm text-neutral-600 hover:text-neutral-950 dark:text-white/60 dark:hover:text-white"
//                   >
//                     {t("footer.links.contact")}
//                   </Link>
//                   <Link
//                       href={ROUTES.privacy}
//                       className="text-sm text-neutral-600 hover:text-neutral-950 dark:text-white/60 dark:hover:text-white"
//                   >
//                     {t("footer.links.privacy")}
//                   </Link>
//                   <Link
//                       href={ROUTES.terms}
//                       className="text-sm text-neutral-600 hover:text-neutral-950 dark:text-white/60 dark:hover:text-white"
//                   >
//                     {t("footer.links.terms")}
//                   </Link>
//                 </div>
//               </div>
//             </footer>
//           </Container>
//         </section>
//       </main>
//   );
// }