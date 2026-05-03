import './globals.css';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Agent-Med OS',
  description: 'Clinical automation platform',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}