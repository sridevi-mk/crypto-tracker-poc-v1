
import './globals.css';
import { QueryProvider } from '../providers/QueryProvider';
import { WagmiProvider } from '../providers/WagmiProvider';
import { TuffyChatWidget } from '../components/TuffyChatWidget';
import { TopNav } from '../components/TopNav';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <WagmiProvider>
          <QueryProvider>
            <TopNav />
            {children}
            <TuffyChatWidget />
          </QueryProvider>
        </WagmiProvider>
      </body>
    </html>
  );
}
