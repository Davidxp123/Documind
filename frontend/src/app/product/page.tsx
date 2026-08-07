import Link from 'next/link';

export default function ProductPage() {
  return (
    <main className="min-h-screen text-white selection:bg-white selection:text-black">
      <section className="pt-24 pb-16 px-6 mx-auto max-w-6xl">
        <div className="rounded-[32px] border border-white/10 bg-white/[0.04] p-10 backdrop-blur-xl">
          <p className="text-xs uppercase tracking-[0.3em] text-white/40 mb-4">Product</p>
          <h1 className="text-5xl md:text-6xl font-heading italic mb-6">DocuMind product overview</h1>
          <p className="text-white/70 max-w-3xl leading-relaxed mb-8">
            DocuMind is a high-end retrieval-augmented generation workspace built for document teams. It combines session isolation, managed uploads and a powerful AI chat interface so enterprise users can build repeatable knowledge workflows.
          </p>
          <div className="grid gap-6 md:grid-cols-2">
            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-8">
              <h2 className="text-2xl font-heading italic mb-3">Session-first architecture</h2>
              <p className="text-white/60 text-sm leading-relaxed">
                Create independent sessions with their own documents and conversation history. Keep experiments and client projects segregated and secure.
              </p>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-8">
              <h2 className="text-2xl font-heading italic mb-3">Document insights</h2>
              <p className="text-white/60 text-sm leading-relaxed">
                Auto-generated summaries, keyword extraction, and timeline cues make documents easier to consume and share.
              </p>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-8">
              <h2 className="text-2xl font-heading italic mb-3">AI chat experience</h2>
              <p className="text-white/60 text-sm leading-relaxed">
                Use a conversational interface to ask questions of your documents with back-and-forth context and built-in status awareness.
              </p>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-8">
              <h2 className="text-2xl font-heading italic mb-3">Industry-ready styling</h2>
              <p className="text-white/60 text-sm leading-relaxed">
                Professional layout, polished components, and a modern dark glass aesthetic make the workspace feel like a production-ready platform.
              </p>
            </div>
          </div>
          <div className="mt-10 flex flex-col sm:flex-row items-center gap-4">
            <Link href="/workspace/demo" className="liquid-glass-strong rounded-full px-8 py-4 text-base font-medium text-white hover:bg-white/10 transition-all">
              Open Workspace
            </Link>
            <Link href="/pricing" className="border border-white/10 rounded-full px-8 py-4 text-base font-medium text-white/80 hover:text-white transition-all">
              See Pricing
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
