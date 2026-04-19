import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
