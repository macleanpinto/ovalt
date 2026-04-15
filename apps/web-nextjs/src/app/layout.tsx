import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import { AlertProvider } from "@/lib/alert-context";
import { GtmBody, GtmHead } from "@/components/gtm";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Ovalt - Server-Side Tag Migration",
  description: "Automated GTM client-side to server-side tag migration with minimal manual work",
  keywords: ["GTM", "Google Tag Manager", "server-side tagging", "migration", "analytics"],
  icons: {
    icon: [{ url: "/ovalt.svg", type: "image/svg+xml" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <GtmHead />
        <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0" rel="stylesheet" />
      </head>
      <body className={`${inter.variable} ${inter.className}`}>
        <GtmBody />
        <AlertProvider>
          <AuthProvider>{children}</AuthProvider>
        </AlertProvider>
      </body>
    </html>
  );
}
