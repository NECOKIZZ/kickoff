export const metadata = {
  title: "Kickoff — Proximity Markets",
  description: "Guess close, win big. Proximity markets for EPL fixtures.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
