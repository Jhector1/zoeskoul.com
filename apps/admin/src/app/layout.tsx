import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
    title: "Admin Dashboard",
    description: "Track learner progress across practice, review, and streak activity.",
};

export default function RootLayout(props: { children: React.ReactNode }) {
    return (
        <html lang="en">
            <body>{props.children}</body>
        </html>
    );
}
