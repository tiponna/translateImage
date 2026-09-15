import { Newsreader } from "next/font/google";
import "./globals.css";

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
    <html lang="th" className={`${newsreader.variable} h-full antialiased`}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Playpen+Sans+Thai:wght@100..800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground font-sans">
        {children}
      </body>
    </html>
  );
}
