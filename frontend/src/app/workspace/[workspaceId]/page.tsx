'use client';

import { use, useState } from "react";
import { Folder, Send, FileText, Sparkles, BarChart2, Layers } from "lucide-react";

export default function WorkspacePage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = use(params);
  const [messages, setMessages] = useState<{ role: string; text: string }[]>([
    { role: "assistant", text: `Welcome to workspace: ${workspaceId}. Upload a document on the left to begin RAG query processing.` }
  ]);
  const [input, setInput] = useState("");

  const handleSend = () => {
    if (!input.trim()) return;
    setMessages((prev) => [...prev, { role: "user", text: input }]);
    const currentQuery = input;
    setInput("");

    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: `[Synthesis for "${currentQuery}"]: Based on your ingested files, the extracted parameters indicate optimal alignment.` }
      ]);
    }, 1000);
  };

  return (
    <div className="flex h-screen bg-black text-white overflow-hidden">
      {/* Column 1: Document Explorer */}
      <aside className="w-72 border-r border-white/10 bg-white/[0.01] p-4 flex flex-col justify-between">
        <div>
          <div className="flex items-center gap-2 mb-6">
            <Folder className="w-5 h-5 text-white/70" />
            <h2 className="text-xl font-heading italic">Explorer</h2>
          </div>
          <div className="p-3 border border-dashed border-white/20 rounded-xl text-center text-xs text-white/50 cursor-pointer hover:bg-white/5 transition-colors">
            + Drop or Click to Upload Docs
          </div>
        </div>
        <div className="text-xs text-white/30 font-light">Workspace ID: {workspaceId}</div>
      </aside>

      {/* Column 2: Streaming AI Chat */}
      <main className="flex-1 flex flex-col border-r border-white/10">
        <header className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-purple-400" />
            <span className="font-heading italic text-lg">AI Assistant</span>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.map((m, i) => (
            <div
              key={i}
              className={`max-w-xl p-4 rounded-2xl text-sm ${
                m.role === "user"
                  ? "ml-auto bg-white/10 text-white font-body"
                  : "bg-white/[0.03] border border-white/10 text-white/90 font-body"
              }`}
            >
              {m.text}
            </div>
          ))}
        </div>

        <div className="p-4 border-t border-white/10 flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="Ask questions across uploaded documents..."
            className="flex-1 bg-white/5 border border-white/10 rounded-full px-5 py-3 text-sm focus:outline-none focus:border-white/40 font-body"
          />
          <button
            onClick={handleSend}
            className="liquid-glass-strong rounded-full p-3 hover:bg-white/10 transition-all"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </main>

      {/* Column 3: Insights Panel */}
      <aside className="w-80 bg-white/[0.01] p-6 space-y-6 overflow-y-auto">
        <div className="flex items-center gap-2">
          <BarChart2 className="w-5 h-5 text-white/70" />
          <h2 className="text-xl font-heading italic">Document Insights</h2>
        </div>

        <div className="p-4 rounded-xl border border-white/10 bg-white/[0.02]">
          <h4 className="text-xs uppercase text-white/40 mb-2 font-body">Executive Summary</h4>
          <p className="text-xs text-white/70 font-light leading-relaxed">
            Upload files to automatically compute BGE semantic embeddings and extract timeline benchmarks.
          </p>
        </div>

        <div className="p-4 rounded-xl border border-white/10 bg-white/[0.02]">
          <h4 className="text-xs uppercase text-white/40 mb-2 font-body">Extracted Keywords</h4>
          <div className="flex flex-wrap gap-1.5">
            {["RAG", "ChromaDB", "FastAPI", "Next.js 15"].map((tag) => (
              <span key={tag} className="text-[10px] px-2 py-1 rounded-md bg-white/5 border border-white/10 text-white/60">
                {tag}
              </span>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}
