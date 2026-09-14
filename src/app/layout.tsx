import type { Metadata } from "next";
import { Noto_Sans_Thai, DM_Sans } from "next/font/google";
import "./globals.css";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
});

const notoThai = Noto_Sans_Thai({
  variable: "--font-noto-thai",
  subsets: ["thai"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Image Translator — แปลภาษาจากรูปภาพ",
  description: "อัปโหลดรูปภาพ แปลงข้อความด้วย OCR แล้วแปลภาษาทันที",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="th"
      className={`${dmSans.variable} ${notoThai.variable} dark h-full antialiased`}
    >
      <body className="min-h-full font-sans">{children}</body>
    </html>
  );
}
