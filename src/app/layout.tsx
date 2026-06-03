import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/components/AuthProvider";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "Splitwise — Show me the money!",
  description: "Split expenses with your group. Dark mode only.",
  // Behaves like a native app when added to the iPhone home screen.
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Splitwise",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#0b0f14",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  // Extend under the notch / Dynamic Island and home indicator; we pad content
  // back in with env(safe-area-inset-*) so nothing hides behind the hardware.
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen font-sans antialiased">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
