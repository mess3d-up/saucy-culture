import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SAUCY CULTURE | Basketball x Streetwear — saucyculture.in",
  description:
    "The New Hoop Era. BAPE-inspired basketball camo jerseys, 450 GSM heavyweight hoodies, pro-mesh shorts, and oversized pump-cover tees.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-theme="day">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Anton&family=Bebas+Neue&family=Permanent+Marker&family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen flex flex-col">{children}</body>
    </html>
  );
}
