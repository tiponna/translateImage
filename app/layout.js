import { Newsreader, Sarabun } from "next/font/google";
import "./globals.css";

const sarabun = Sarabun({
  variable: "--font-sarabun",
  subsets: ["thai", "latin"],
  weight: ["400", "500", "600", "700"],
});

const newsreader = Newsreader({
  variable: "--font-display",
  subsets: ["latin"],
  style: ["normal", "italic"],
});

export const metadata = {
  title: "ภาพแปล — แปลป้ายโฆษณาและมังงะเป็นไทย",
  description:
    "ตรวจจับข้อความญี่ปุ่น อังกฤษ จีน จากรูปป้ายโฆษณาหรือมังงะ แล้วทับด้วยภาษาไทย",
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="th"
      className={`${sarabun.variable} ${newsreader.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {children}
      </body>
    </html>
  );
}
