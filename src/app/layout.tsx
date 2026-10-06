import type { Metadata, Viewport } from "next";
import "./globals.css";
import { APP_DESCRIPTION, APP_NAME } from "@/components/reel-cover-maker/meta";

/** Where the site is served; the Pages workflow sets it, and this is its address there. */
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://emehta.github.io/reel-cover-maker";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: APP_NAME,
  description: APP_DESCRIPTION,
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // The pre-paint script colours <html> and the body before React sees them.
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
