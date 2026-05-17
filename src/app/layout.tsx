import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Devin Dashboard",
  description: "Local Devin account and cloud-agent control plane",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="bg-devin-bg text-devin-text">
      <body className="min-h-screen font-sans antialiased">{children}</body>
    </html>
  );
}
