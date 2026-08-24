import './globals.css';
import BackgroundVideo from '@/components/Background/BackgroundVideo';
import Navbar from '@/components/Navbar';

export const metadata = {
  title: 'DocuMind – Enterprise RAG Workspace',
  description: 'DocuMind is a professional RAG workspace for document intelligence and AI-assisted workflows.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="min-h-full bg-black">
      <body className="relative text-white min-h-screen bg-transparent antialiased selection:bg-white selection:text-black">
        <BackgroundVideo />
        <Navbar />
        {children}
      </body>
    </html>
  );
}

