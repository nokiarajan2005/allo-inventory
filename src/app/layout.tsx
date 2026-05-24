import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Allo Inventory",
  description: "Multi-warehouse inventory and order-fulfillment platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <header className="border-b bg-white sticky top-0 z-10 shadow-sm">
          <div className="max-w-6xl mx-auto px-4 py-4 flex items-center gap-3">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">A</span>
            </div>
            <div>
              <span className="font-semibold text-gray-900 text-lg">Allo</span>
              <span className="text-gray-400 text-sm ml-2">Inventory Platform</span>
            </div>
          </div>
        </header>
        <main className="min-h-screen bg-gray-50">{children}</main>
      </body>
    </html>
  );
}
