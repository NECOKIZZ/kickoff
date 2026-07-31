import "./globals.css";

export const metadata = {
  title: "Kickoff — Proximity Markets",
  description:
    "Beat the pack, keep the stack. Proximity markets for EPL fixtures — rewards for how close you land, not just yes/no.",
};

// Apply persisted theme before paint to avoid a light-mode flash.
const themeScript = `
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
      </head>
      <body>{children}</body>
    </html>
  );
}
