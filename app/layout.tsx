import "./globals.css";

export const metadata = {
  title: "Kickoff — Proximity Markets",
  description:
    "Beat the pack, keep the stack. Proximity markets for EPL fixtures — rewards for how close you land, not just yes/no.",
};

// Apply persisted theme before paint to avoid a light-mode flash.
// Also tag <html> with .js — scroll-reveal styles only hide content when
// scripts actually run, so a JS-less render still shows every word.
const themeScript = `
document.documentElement.classList.add('js');
try {
  var s = localStorage.getItem('kickoff-theme');
  var d = s ? s === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
  if (d) document.documentElement.classList.add('dark');
} catch (e) {}
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        {/* Brand fonts — loaded as links; CSS @import gets stripped by the Tailwind build */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://api.fontshare.com" />
        <link
          rel="stylesheet"
          href="https://api.fontshare.com/v2/css?f[]=clash-display@400,500,600,700&display=swap"
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,400;0,9..144,500;0,9..144,600;0,9..144,700;1,9..144,300;1,9..144,400;1,9..144,500&family=Inter:ital,opsz,wght@0,14..32,300..700;1,14..32,400&display=swap"
        />
        {/* Above-the-fold hero image — preloaded so it never pops in late */}
        <link rel="preload" as="image" href="/brand/hero-players.webp" type="image/webp" />
      </head>
      <body>{children}</body>
    </html>
  );
}
