import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bus Route — 보드게임",
  description:
    "Bus Route 전략 보드게임. 5개 팀이 두 대의 버스를 조종하여 영역을 확보하세요!",
  icons: {
    icon: "data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🚌</text></svg>",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
