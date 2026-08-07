import Link from 'next/link';

export default function PricingPage() {
  return (
    <main className="min-h-screen text-white selection:bg-white selection:text-black">
      <section className="pt-24 pb-16 px-6 mx-auto max-w-6xl">
        <div className="rounded-[32px] border border-white/10 bg-white/[0.04] p-10 backdrop-blur-xl">
          <p className="text-xs uppercase tracking-[0.3em] text-white/40 mb-4">Pricing</p>
          <h1 className="text-5xl md:text-6xl font-heading italic mb-6">Flexible enterprise-ready plans</h1>
          <p className="text-white/70 max-w-3xl leading-relaxed mb-8">
            DocuMind is built to support multiple teams and growing document environments with transparent usage and session-based organization.
          </p>
          <div className="grid gap-6 md:grid-cols-3">
            <div className="rounded-3xl border border-white/10 bg-black/20 p-8">
              <h2 className="text-2xl font-heading italic mb-3">Starter</h2>
              <p className="text-white/60 mb-4 text-sm">Best for small teams trying out enterprise RAG workflows.</p>
              <ul className="space-y-2 text-sm text-white/70">
                <li>Unlimited sessions</li>
                <li>Structured document upload</li>
                <li>Base AI assistant</li>
              </ul>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-8">
              <h2 className="text-2xl font-heading italic mb-3">Growth</h2>
              <p className="text-white/60 mb-4 text-sm">Designed for teams working with multiple document collections.</p>
              <ul className="space-y-2 text-sm text-white/70">
                <li>Document insights</li>
                <li>Session isolation</li>
                <li>Priority support</li>
              </ul>
            </div>
            <div className="rounded-3xl border border-white/10 bg-black/20 p-8">
              <h2 className="text-2xl font-heading italic mb-3">Enterprise</h2>
              <p className="text-white/60 mb-4 text-sm">The full DocuMind experience with advanced governance and custom workflows.</p>
              <ul className="space-y-2 text-sm text-white/70">
                <li>Large-scale document support</li>
                <li>Dedicated sessions and governance</li>
                <li>Custom AI integration</li>
              </ul>
            </div>
          </div>
          <div className="mt-10 flex items-center gap-4">
            <Link href="/workspace/demo" className="liquid-glass-strong rounded-full px-8 py-4 text-base font-medium text-white hover:bg-white/10 transition-all">
              Try Demo Workspace
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
