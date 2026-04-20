import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Royal LePage — Find Your Next Home",
  description: "Search MLS listings with AI-powered property intelligence",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
