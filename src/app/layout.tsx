import type { Metadata } from "next";
import "./globals.css";
import ThemeScript from "@/components/ThemeScript";

export const metadata: Metadata = {
  title: "Partner Portal — Civil Survey Applications",
  description: "Partner portal for Civil Survey Applications — orders, licences, and account management",
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
    apple: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning: ThemeScript sets data-theme on this element before
    // React hydrates, so the server-rendered markup and the DOM differ by design.
    <html lang="en" suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body>{children}</body>
    </html>
  );
}
