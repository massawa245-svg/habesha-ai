import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Habesha AI – KI-Assistent für Eritreer & Äthiopier in Deutschland",
  description: "Habesha AI hilft der eritreischen und äthiopischen Community in Deutschland. Verstehe Behördenbriefe, Jobcenter, Finanzamt, AOK auf Tigrinya, Amharisch und Deutsch. Kostenloser KI-Assistent.",
  keywords: [
    "Habesha AI", "Tigrinya KI", "Amharisch Übersetzer", "Eritreer Deutschland",
    "Äthiopier Deutschland", "Behördenbrief verstehen", "Jobcenter Brief Tigrinya",
    "Finanzamt Eritrea", "AOK Brief erklären", "Habesha Community Deutschland",
    "KI Assistent Tigrinya", "ትግርኛ AI", "አማርኛ AI", "Habesha Diaspora",
    "Ausländerbehörde Brief", "Integration Hilfe Eritrea Äthiopien",
    "eritreisch äthiopisch KI", "habeshai.com"
  ],
  authors: [{ name: "Habesha AI" }],
  creator: "Habesha AI",
  openGraph: {
    title: "Habesha AI – Dein KI-Assistent auf Tigrinya & Amharisch",
    description: "Verstehe deutsche Behördenbriefe auf Tigrinya, Amharisch oder Deutsch. Für die Habesha Community in Deutschland.",
    url: "https://habeshai.com",
    siteName: "Habesha AI",
    locale: "de_DE",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Habesha AI – KI für die Habesha Community",
    description: "Behördenbriefe verstehen auf Tigrinya & Amharisch. Kostenlos testen.",
  },
  alternates: {
    canonical: "https://habeshai.com",
  },
  robots: {
    index: true,
    follow: true,
  },
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