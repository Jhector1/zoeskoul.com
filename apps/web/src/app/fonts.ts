// src/app/fonts.ts
import { Inter, Playfair_Display, Great_Vibes } from "next/font/google";

export const inter = Inter({
    subsets: ["latin"],
    variable: "--font-inter",
});

export const playfair = Playfair_Display({
    subsets: ["latin"],
    variable: "--font-playfair",
});

export const greatVibes = Great_Vibes({
    weight: "400",
    subsets: ["latin"],
    variable: "--font-script",
});