import CtaFooter from "@/components/landing/CtaFooter";
import { Sparkles, FileText, BrainCircuit, Search } from "lucide-react";
import Link from "next/link";

const benefitCards = [
  {
    title: "Enterprise-grade governance",
    description: "Secure session boundaries, audit-ready workspace controls, and clean document lifecycle management for every project.",
  },
  {
    title: "Adaptive AI workflows",
    description: "Move from upload to insight in minutes with interactive chat, turnkey summaries, and document-aware retrieval.",
  },
  {
    title: "Fast results at scale",
    description: "Built for large document collections with streaming responses, multi-document reasoning, and document-specific context.",
  },
];

export default function Home() {
  return (
    <main className="min-h-screen text-white selection:bg-white selection:text-black">
      <section className="relative pt-24 pb-24 flex items-center justify-center">
        <div className="max-w-5xl mx-auto px-6 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-white/10 bg-white/5 mb-8 backdrop-blur-md">
            <Sparkles className="w-4 h-4 text-purple-400" />
            <span className="text-xs uppercase tracking-widest text-white/80">Enterprise RAG for Document Teams</span>
          </div>

          <h1 className="text-5xl md:text-7xl font-heading italic tracking-tight mb-6 leading-tight">
            DocuMind delivers professional document intelligence with a modern AI workspace.
          </h1>

          <p className="mx-auto max-w-3xl text-white/60 font-body text-lg md:text-xl mb-10 font-light">
            Build a fully managed retrieval-augmented generation workflow with session-level document control, conversational search, and automatic insights.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/workspace/demo"
              className="liquid-glass-strong rounded-full px-8 py-4 text-base font-medium text-white hover:bg-white/10 transition-all"
            >
              Launch Workspace
            </Link>
            <Link
              href="/product"
              className="border border-white/10 rounded-full px-8 py-4 text-base font-medium text-white/80 hover:text-white transition-all"
            >
              View Product
            </Link>
          </div>
        </div>
      </section>

      <section className="px-6 pb-20 max-w-7xl mx-auto grid gap-10">
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="rounded-[32px] border border-white/10 bg-white/[0.03] p-10 backdrop-blur-xl">
            <h2 className="text-4xl font-heading italic mb-4">Higher fidelity document workflows.</h2>
            <p className="text-white/60 text-base leading-relaxed mb-6">
              DocuMind is designed for enterprise teams who need more than a proof of concept. Keep documents scoped to sessions, maintain clear document states, and use a polished AI assistant experience that supports back-and-forth conversations.
            </p>
            <div className="space-y-4">
              <div className="flex gap-4 items-start">
                <span className="mt-1 inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-purple-500/10 text-purple-200">01</span>
                <div>
                  <h3 className="text-xl font-heading italic mb-1">Session-aware document control</h3>
                  <p className="text-white/60 text-sm">Create, rename, and delete sessions so each workspace project stays clean and independent.</p>
                </div>
              </div>
              <div className="flex gap-4 items-start">
                <span className="mt-1 inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-purple-500/10 text-purple-200">02</span>
                <div>
                  <h3 className="text-xl font-heading italic mb-1">Conversational analytics</h3>
                  <p className="text-white/60 text-sm">Chat with your documents over time and keep the conversation visible, organized, and actionable.</p>
                </div>
              </div>
              <div className="flex gap-4 items-start">
                <span className="mt-1 inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-purple-500/10 text-purple-200">03</span>
                <div>
                  <h3 className="text-xl font-heading italic mb-1">Instant executive summaries</h3>
                  <p className="text-white/60 text-sm">Automatically generate insights and keyword summaries from the documents you upload.</p>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6">
            {benefitCards.map((card) => (
              <div key={card.title} className="rounded-3xl border border-white/10 bg-white/[0.04] p-8 backdrop-blur-xl">
                <h3 className="text-2xl font-heading italic mb-3">{card.title}</h3>
                <p className="text-white/60 text-sm leading-relaxed">{card.description}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-8 backdrop-blur-xl">
            <FileText className="w-7 h-7 text-white/80 mb-4" />
            <h4 className="text-xl font-heading italic mb-2">Flexible ingestion</h4>
            <p className="text-white/60 text-sm">Upload PDFs, DOCX, CSV, PPTX, and images with a single unified workflow.</p>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-8 backdrop-blur-xl">
            <BrainCircuit className="w-7 h-7 text-white/80 mb-4" />
            <h4 className="text-xl font-heading italic mb-2">Modern vector retrieval</h4>
            <p className="text-white/60 text-sm">Use embeddings and relevance ranking to keep answers grounded in real document content.</p>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-8 backdrop-blur-xl">
            <Search className="w-7 h-7 text-white/80 mb-4" />
            <h4 className="text-xl font-heading italic mb-2">Document-first AI chat</h4>
            <p className="text-white/60 text-sm">A smooth Q&A experience with back-and-forth context, status-aware guidance, and insight recall.</p>
          </div>
        </div>
      </section>

      <section className="px-6 pb-20 max-w-7xl mx-auto">
        <div className="rounded-[32px] border border-white/10 bg-white/[0.03] p-10 backdrop-blur-xl">
          <h2 className="text-4xl font-heading italic mb-6 text-center">Why teams choose DocuMind</h2>
          <div className="grid gap-6 md:grid-cols-3">
            <div className="rounded-3xl border border-white/10 bg-black/20 p-6">
              <p className="text-sm uppercase tracking-[0.3em] text-white/40 mb-4">Speed</p>
              <p className="text-white/70 text-sm leading-relaxed">From upload to answer in one interface, with live processing feedback and chat-ready results.</p>
            </div>
            <div className="rounded-3xl border border-white/10 bg-black/20 p-6">
              <p className="text-sm uppercase tracking-[0.3em] text-white/40 mb-4">Clarity</p>
              <p className="text-white/70 text-sm leading-relaxed">Maintain clear session context and document state so every analysis remains reproducible.</p>
            </div>
            <div className="rounded-3xl border border-white/10 bg-black/20 p-6">
              <p className="text-sm uppercase tracking-[0.3em] text-white/40 mb-4">Control</p>
              <p className="text-white/70 text-sm leading-relaxed">Only documents uploaded into a session are available there, preserving separation across projects.</p>
            </div>
          </div>
        </div>
      </section>

      <CtaFooter />
    </main>
  );
}
