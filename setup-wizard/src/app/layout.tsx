import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Royal LePage — Platform Setup",
  description: "3-step setup wizard for the AI Lead Management Platform",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily: "system-ui, -apple-system, sans-serif",
          background: "#f5f5f5",
        }}
      >
        {children}
      </body>
    </html>
  );
}
