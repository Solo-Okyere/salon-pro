import type { Metadata } from "next";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "SalonPro — Stop the Crowd. Cut More. Earn More.",
    template: "%s | SalonPro",
  },
  description:
    "AI-powered barber shop operating system for Ghana. Virtual queues, mobile money payments, WhatsApp automation, and real-time analytics.",
  keywords: ["barber shop", "ghana", "booking", "queue", "mobile money", "AI"],
  openGraph: {
    title: "SalonPro",
    description: "AI-powered barber shop OS for Ghana",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className="h-full antialiased"
    >
      <body suppressHydrationWarning className="min-h-full bg-background text-foreground">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
