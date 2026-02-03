import { IBM_Plex_Sans } from "next/font/google";

export const ibmPlexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

// Cabinet Grotesk is not on Google Fonts, so we use IBM Plex Sans for display
// with heavier weights to differentiate headings. To add Cabinet Grotesk,
// self-host the font files in /public/fonts and register via @font-face in globals.css.
export const displayFont = ibmPlexSans;
