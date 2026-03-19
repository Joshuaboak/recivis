import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CSA Reseller Portal — Civil Survey Applications",
  description: "Reseller portal for Civil Survey Applications — invoices, licences, and account management",
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
