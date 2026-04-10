import type { Metadata } from "next";
import {redirect} from "next/navigation";
import {auth} from "@/lib/auth";

export const metadata: Metadata = {
    robots: {
        index: false,
        follow: false,
        nocache: true,
        googleBot: {
            index: false,
            follow: false,
            noimageindex: true,
            "max-image-preview": "none",
            "max-snippet": -1,
            "max-video-preview": -1,
        },
    },
};

export default async function AuthenticateLayout({
                                               children,
                                           }: {
    children: React.ReactNode;
}) {
    const session = await  auth();

    if (session?.user) {
        redirect("/profile");
    }
    return children;
}