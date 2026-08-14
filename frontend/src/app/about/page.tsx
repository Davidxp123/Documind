import Link from 'next/link';

export default function AboutPage() {
  return (
    <main className="min-h-screen text-white selection:bg-white selection:text-black">
      <section className="pt-20 md:pt-24 pb-16 px-4 md:px-6 mx-auto max-w-6xl">
        <div className="rounded-[32px] border border-white/10 bg-white/[0.04] p-6 md:p-10 backdrop-blur-xl">
          <p className="text-[10px] md:text-xs uppercase tracking-[0.3em] text-white/40 mb-4">About</p>
          <h1 className="text-3xl sm:text-4xl md:text-6xl font-heading italic mb-6 leading-tight">Professional RAG built for teams</h1>
          <p className="text-white/70 max-w-3xl leading-relaxed mb-8">
            DocuMind brings polished workflow design to retrieval-augmented generation. It is built around session-level document workflows, AI assistance, and meaningful insights for every upload.
          </p>
          <div className="space-y-6">
            <div className="rounded-3xl border border-white/10 bg-black/20 p-8">
              <h2 className="text-2xl font-heading italic mb-3">Mission</h2>
              <p className="text-white/60 text-sm leading-relaxed">
                Empower teams to extract value from documents using modern AI conversation interfaces and enterprise-grade design.
              </p>
            </div>
            <div className="rounded-3xl border border-white/10 bg-black/20 p-8">
              <h2 className="text-2xl font-heading italic mb-3">Experience</h2>
              <p className="text-white/60 text-sm leading-relaxed">
                The application is designed to feel like a production-ready platform, with clear session workflows and sophisticated UI structure.
              </p>
            </div>
            <div className="rounded-3xl border border-white/10 bg-black/20 p-8">
              <h2 className="text-2xl font-heading italic mb-3">The result</h2>
              <p className="text-white/60 text-sm leading-relaxed">
                A focus on quality, session management, and document-specific AI responses makes this a strong foundation for an industry-ready RAG product.
              </p>
            </div>
          </div>
          <div className="mt-10">
            <Link href="/workspace/demo" className="liquid-glass-strong rounded-full px-8 py-4 text-base font-medium text-white hover:bg-white/10 transition-all">
              Explore the Workspace
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
