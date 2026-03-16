import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ReCivis — CSA Invoice Management",
  description: "Invoice management system for Civil Survey Applications",
  icons: {
    icon: "/favicon.svg",
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
