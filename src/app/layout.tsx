import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Devin Dashboard",
  description: "Multi-account Devin switcher (OmniRoute companion)",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="bg-devin-bg text-devin-text">
      <body className="min-h-screen font-sans antialiased">{children}</body>
    </html>
  );
}
