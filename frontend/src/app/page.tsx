import CtaFooter from "@/components/landing/CtaFooter";
import { Sparkles, FileText, BrainCircuit, Search } from "lucide-react";
import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen text-white selection:bg-white selection:text-black">
      {/* Hero Section */}
      <section className="relative pt-24 pb-20 flex items-center justify-center min-h-[70vh]">
        <div className="max-w-3xl mx-auto px-6 text-center">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-white/10 bg-white/5 mb-8 backdrop-blur-md">
          <Sparkles className="w-4 h-4 text-purple-400" />
          <span className="text-xs uppercase tracking-widest text-white/80">Next-Gen Document Intelligence</span>
        </div>
        
        <h1 className="text-4xl md:text-6xl font-heading italic tracking-tight mb-6 leading-none">
          DocuMind AI Workspace
        </h1>
        
        <p className="text-white/60 font-body text-lg md:text-xl mb-10 font-light">
          Transform documents into an interactive knowledge universe. Unify multi-modal RAG, instant citations, and deep synthesis.
        </p>

        <div className="flex items-center justify-center gap-4">
          <Link 
            href="/workspace/demo"
            className="liquid-glass-strong rounded-full px-8 py-4 text-base font-medium text-white hover:bg-white/10 transition-all"
          >
            Launch Workspace
          </Link>
        </div>
        </div>
      </section>

      {/* Feature Grid */}
      <section className="px-6 py-20 max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="p-8 rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-xl">
          <FileText className="w-8 h-8 text-white/80 mb-4" />
          <h3 className="text-2xl font-heading italic mb-2">Multi-Format Ingestion</h3>
          <p className="text-white/50 text-sm font-light">PDF, DOCX, CSV, PPTX, and Image OCR seamlessly unified into structured vectors.</p>
        </div>
        <div className="p-8 rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-xl">
          <BrainCircuit className="w-8 h-8 text-white/80 mb-4" />
          <h3 className="text-2xl font-heading italic mb-2">BGE Embeddings</h3>
          <p className="text-white/50 text-sm font-light">Powered by BAAI/bge-small-en-v1.5 and ChromaDB for instant vector retrieval.</p>
        </div>
        <div className="p-8 rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-xl">
          <Search className="w-8 h-8 text-white/80 mb-4" />
          <h3 className="text-2xl font-heading italic mb-2">Cited Knowledge Chat</h3>
          <p className="text-white/50 text-sm font-light">Gemini 2.5 Flash streaming with direct page citations and visual preview jumpers.</p>
        </div>
      </section>

      {/* CTA Footer Section Component */}
      <CtaFooter />
    </main>
  );
}
