import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Royal LePage — AI Lead Platform",
  description: "Replacing Verse.ai with a full AI brokerage stack",
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
          padding: 0,
          background: "#0a0a0a",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        {children}
      </body>
    </html>
  );
}
