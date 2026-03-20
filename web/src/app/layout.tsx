import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Luminus - European Energy Grid',
  description: 'Real-time interactive map of European electricity data',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
