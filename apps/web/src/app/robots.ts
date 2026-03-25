import type { MetadataRoute } from "next";
import { ROUTES } from "@/utils";
import { SITE_URL } from "@/lib/seo/site";

export default function robots(): MetadataRoute.Robots {
    return {
        rules: [
            {
                userAgent: "*",
                allow: [
                    ROUTES.home,
                    ROUTES.catalog,
                    ROUTES.pricing,
                    ROUTES.contact,
                    ROUTES.privacy,
                    ROUTES.terms
                ],
                disallow: [
                    "/api/",
                    "/admin",
                    "/profile",
                    "/assignments",
                    ROUTES.signIn,
                    ROUTES.review,
                    ROUTES.authenticate
                ]
            }
        ],
        sitemap: `${SITE_URL}/sitemap.xml`,
        host: SITE_URL
    };
}