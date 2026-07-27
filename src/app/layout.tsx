import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "GroundedDesk",
  description: "将可管理的知识转化为有据回答",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
