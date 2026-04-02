import type { Metadata } from "next";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "PlasmaXAI",
  description: "Explainable plasma cell review workspace for doctors",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased" data-scroll-behavior="smooth">
      <body className="min-h-full flex flex-col bg-[var(--bg)] text-[var(--text)]">
        {children}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
