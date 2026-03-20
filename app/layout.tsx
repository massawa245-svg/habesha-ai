import type { Metadata } from "next";
import "./globals.css";  // ← DAS ist wichtig!

export const metadata: Metadata = {
  title: "Habesha AI",
  description: "Tigrinya KI-Assistent",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}