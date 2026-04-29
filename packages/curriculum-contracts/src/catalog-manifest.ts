export type CatalogManifest = {
  catalog: {
    slug: string;
    order: number;
    title: string;
    description?: string | null;
    imagePublicId?: string | null;
    imageAlt?: string | null;
    defaultSubjectSlug?: string | null;
    status?: "active" | "coming_soon" | "disabled";
    subjectSlugs: string[];
    meta?: Record<string, unknown> | null;
  };
};

export type ResolvedCatalogSubjectItem = {
  slug: string;
  title: string;
  description: string;
  imagePublicId: string | null;
  imageAlt: string | null;
  defaultModuleSlug: string | null;
  status: "active" | "coming_soon" | "disabled";
};

export type ResolvedCatalogItem = {
  slug: string;
  title: string;
  description: string;
  imagePublicId: string | null;
  imageAlt: string | null;
  defaultSubjectSlug: string | null;
  status: "active" | "coming_soon" | "disabled";
  subjects: ResolvedCatalogSubjectItem[];
};
