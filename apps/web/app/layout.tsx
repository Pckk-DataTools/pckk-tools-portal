import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PCKK Tools Portal",
  description: "Internal tools portal for secure release distribution",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
