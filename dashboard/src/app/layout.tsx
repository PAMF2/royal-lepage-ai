import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Royal LePage — AI Lead Dashboard",
  description: "Homie AI lead management and conversion dashboard",
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
