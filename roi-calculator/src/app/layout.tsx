import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Royal LePage AI Platform — ROI Calculator",
  description: "See how the AI Lead Management Platform pays for itself",
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
          fontFamily: "system-ui, sans-serif",
          background: "#f8f8f8",
        }}
      >
        {children}
      </body>
    </html>
  );
}
