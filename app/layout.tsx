import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tower of Hanoi Speedrun",
  description: "Solve the Tower of Hanoi as fast as possible. Choose 3, 4, or 5 disks and race the clock!",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" style={{ height: "100%" }}>
      <body style={{ minHeight: "100%", display: "flex", flexDirection: "column" }}>
        {children}
      </body>
    </html>
  );
}
