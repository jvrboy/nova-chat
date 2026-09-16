import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Fira_Code, IBM_Plex_Sans, IBM_Plex_Mono, Source_Code_Pro, Playfair_Display, Lora, Space_Grotesk, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { NovaProvider } from "@/components/nova-provider";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
});

const firaCode = Fira_Code({
  variable: "--font-fira-code",
  subsets: ["latin"],
  display: "swap",
});

const ibmPlexSans = IBM_Plex_Sans({
  variable: "--font-ibm-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

const sourceCodePro = Source_Code_Pro({
  variable: "--font-source-code-pro",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const playfairDisplay = Playfair_Display({
  variable: "--font-playfair-display",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  display: "swap",
});

const lora = Lora({
  variable: "--font-lora",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Nova Chat — Advanced AI Workspace with Real Artifacts",
  description: "Nova Chat is an advanced AI workspace with real-time streaming, persistent storage (Supabase + Cloudflare), artifact generation, multiple themes, and powerful backend tools.",
  keywords: ["Nova Chat", "AI", "Chat", "Artifacts", "Supabase", "Cloudflare", "Next.js"],
  authors: [{ name: "Nova Chat" }],
  icons: {
    icon: "/logo.svg",
  },
  openGraph: {
    title: "Nova Chat",
    description: "Advanced AI Workspace with Real Artifacts",
    siteName: "Nova Chat",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className="dark">
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} ${firaCode.variable} ${ibmPlexSans.variable} ${ibmPlexMono.variable} ${sourceCodePro.variable} ${playfairDisplay.variable} ${lora.variable} ${spaceGrotesk.variable} ${geistSans.variable} ${geistMono.variable} antialiased`}
        style={{
          // Default font variables - can be overridden at runtime by theme provider
          ['--font-app-sans' as string]: 'var(--font-inter)',
          ['--font-app-mono' as string]: 'var(--font-jetbrains-mono)',
          ['--font-app-display' as string]: 'var(--font-space-grotesk)',
        }}
      >
        <NovaProvider>{children}</NovaProvider>
        <Toaster />
        <SonnerToaster />
      </body>
    </html>
  );
}
