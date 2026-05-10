import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Navbar } from "@/components/layout/Navbar";
import { ThemeProvider } from "@/components/them-prov";
import { DesignPresetProvider } from "@/components/design/DesignPresetProvider";
import { RecoveryRedirect } from "@/components/auth/RecoveryRedirect";
import { FavouriteTeamPrompt } from "@/components/auth/FavouriteTeamPrompt";
import { GlobalChatLauncher } from "@/components/chat/GlobalChatLauncher";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Scoreline - Predict. Compete. Climb.",
  description:
    "Compete with friends by predicting football matches. Create or join a league, predict weekly fixtures, and climb the leaderboard.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased bg-background text-foreground min-h-screen overflow-x-hidden`}
      >
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
          <DesignPresetProvider>
            <RecoveryRedirect />
            <FavouriteTeamPrompt />
            <Navbar />
            {children}
            <GlobalChatLauncher />
          </DesignPresetProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
