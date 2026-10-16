import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: "ProofLoop — Don't Just Claim It. Prove It. | AI Career Coach",
  description:
    "ProofLoop compares real internship requirements against verifiable code evidence from your GitHub repositories and automatically updates your assessment upon commit push events.",
  keywords: [
    'internship fit',
    'code evidence',
    'developer career coach',
    'github reassessment',
    'technical skills proof',
    'proofloop'
  ],
  authors: [{ name: 'ProofLoop Engineering' }]
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className="h-full antialiased dark"
      suppressHydrationWarning
    >
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Caveat:wght@400;500;600;700&family=Fraunces:ital,opsz,wght@0,9..144,300..900;1,9..144,300..800&family=JetBrains+Mono:ital,wght@0,300..800;1,300..800&family=Newsreader:ital,opsz,wght@0,6..72,300..800;1,6..72,300..800&display=swap"
        />
      </head>
      <body
        className="min-h-full flex flex-col font-sans antialiased"
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}
