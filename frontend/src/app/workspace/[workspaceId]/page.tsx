'use client';

import { use, useEffect, useState } from "react";
import { useDropzone } from "react-dropzone";
import { Folder, Send, Sparkles, BarChart2, UploadCloud, AlertTriangle } from "lucide-react";

type DocumentStatus = {
  id: string;
  workspace_id: string;
  filename: string;
  file_type: string;
  file_size: number;
  status: string;
  page_count: number;
  summary?: string;
  keywords?: string[];
  timeline?: any[];
  entities?: string[];
  created_at: string;
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "/api";

export default function WorkspacePage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = use(params);
  const [input, setInput] = useState("");
  const [uploadSteps, setUploadSteps] = useState<string[]>([]);
  const [documents, setDocuments] = useState<DocumentStatus[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<{ id: string; name: string; messages: { role: string; text: string }[]; docs: DocumentStatus[] }[]>([
    { id: "default", name: "Current Session", messages: [{ role: "assistant", text: `Welcome to workspace: ${workspaceId}. Upload a document on the left to begin RAG query processing.` }], docs: [] }
  ]);
  const [currentSessionId, setCurrentSessionId] = useState("default");

  const currentSession = sessions.find((session) => session.id === currentSessionId) ?? sessions[0];
  const currentMessages = currentSession?.messages ?? [];

  const updateSessionMessages = (newMessages: { role: string; text: string }[]) => {
    setSessions((prev) => prev.map((session) => session.id === currentSessionId ? { ...session, messages: newMessages } : session));
  };

  const appendSessionMessage = (message: { role: string; text: string }) => {
    setSessions((prev) => prev.map((session) => {
      if (session.id !== currentSessionId) return session;
      return { ...session, messages: [...session.messages, message] };
    }));
  };

  const appendSessionDoc = (doc: DocumentStatus) => {
    setSessions((prev) => prev.map((session) => {
      if (session.id !== currentSessionId) return session;
      // avoid duplicates
      if ((session.docs || []).some((d) => d.id === doc.id)) return session;
      return { ...session, docs: [...(session.docs || []), doc] };
    }));
  };

  const removeSessionDoc = (docId: string) => {
    setSessions((prev) => prev.map((session) => {
      if (session.id !== currentSessionId) return session;
      return { ...session, docs: (session.docs || []).filter((d) => d.id !== docId) };
    }));
  };

  const fetchWorkspaceDocuments = async () => {
    try {
      const response = await fetch(`${API_BASE}/documents/workspace/${workspaceId}`);
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const docs = await response.json();
      setDocuments(docs);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchWorkspaceDocuments();
  }, [workspaceId]);

  const setStage = (stages: string[]) => setUploadSteps(stages);

  const handleSend = async () => {
    if (!input.trim()) return;
    const currentQuery = input;
    setInput("");
    const updatedMessages = [...currentMessages, { role: "user", text: currentQuery }];
    updateSessionMessages(updatedMessages);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/documents/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspace_id: workspaceId, query: currentQuery }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Query failed");
      }

      const result = await response.json();
      updateSessionMessages([
        ...updatedMessages,
        { role: "assistant", text: result.answer || "No answer returned from the workspace." }
      ]);
    } catch (err: any) {
      setError(err?.message || "Failed to fetch answer.");
      updateSessionMessages([
        ...updatedMessages,
        { role: "assistant", text: "Sorry, I could not generate an answer right now." }
      ]);
    }
  };

  const pollDocumentStatus = async (docId: string) => {
    let count = 0;
    const interval = setInterval(async () => {
      count += 1;
      try {
        const response = await fetch(`${API_BASE}/documents/workspace/${workspaceId}`);
        if (!response.ok) {
          throw new Error(await response.text());
        }
        const docs: DocumentStatus[] = await response.json();
        setDocuments(docs);
        // populate default session docs (persist existing workspace docs to default session)
        setSessions((prev) => prev.map((s, i) => i === 0 ? { ...s, docs } : s));
        const doc = docs.find((item) => item.id === docId);

        if (doc?.status === "completed" || doc?.status?.startsWith("failed") || count >= 15) {
          clearInterval(interval);
          if (doc?.status === "completed") {
            setStage(["Upload complete", "Extraction finished", "Embedding complete", "Analysis finalized"]);
            appendSessionMessage({ role: "assistant", text: `Document ${doc.filename} has finished processing.` });
          } else if (doc?.status?.startsWith("failed")) {
            setStage(["Upload complete", "Processing failed"]);
            setError(`Processing failed: ${doc.status}`);
          }
        } else if (doc?.status === "processing") {
          setStage(["Upload complete", "Extracting text", "Chunking content", "Building embeddings", "Generating insights"]);
        }
      } catch (err) {
        clearInterval(interval);
        console.error(err);
        setError("Unable to poll document status.");
      }
    }, 2000);
  };

  const handleDeleteDocument = async (docId: string) => {
    try {
      const resp = await fetch(`${API_BASE}/documents/${docId}`, { method: 'DELETE' });
      if (!resp.ok) throw new Error(await resp.text());
      // remove from workspace list and session
      setDocuments((prev) => prev.filter((d) => d.id !== docId));
      removeSessionDoc(docId);
      appendSessionMessage({ role: 'assistant', text: 'Document removed from this session.' });
    } catch (e: any) {
      console.error(e);
      setError(e?.message || 'Failed to delete document');
    }
  };

  const handleRenameSession = (newName: string) => {
    setSessions((prev) => prev.map((s) => s.id === currentSessionId ? { ...s, name: newName } : s));
  };

  const onDrop = async (acceptedFiles: File[]) => {
    if (!acceptedFiles.length) return;
    setError(null);
    setUploading(true);
    setStage(["Preparing upload"]);

    try {
      for (const file of acceptedFiles) {
        const formData = new FormData();
        formData.append("workspace_id", workspaceId);
        formData.append("file", file);

        setStage([`Uploading ${file.name}...`]);
        const response = await fetch(`${API_BASE}/documents/upload`, {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          const text = await response.text();
          throw new Error(text || "Upload failed");
        }

        const data = await response.json();
        setStage(["Upload complete", "Queuing processing..."]);
        appendSessionMessage({ role: "assistant", text: `Document ${file.name} uploaded. Processing has started in the background.` });
        // attach returned doc to current session immediately
        if (data?.doc) {
          appendSessionDoc(data.doc as DocumentStatus);
          setDocuments((prev) => [data.doc, ...prev]);
        } else {
          await fetchWorkspaceDocuments();
        }
        pollDocumentStatus(data.doc?.id ?? data.doc_id ?? null);
      }
    } catch (err: any) {
      setError(err?.message || "Failed to upload document.");
      setStage(["Error uploading document."]);
    } finally {
      setUploading(false);
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, multiple: true });

  return (
    <div className="flex h-screen bg-black text-white overflow-hidden">
      <aside className="w-80 border-r border-white/10 bg-white/[0.04] backdrop-blur-2xl p-5 flex flex-col justify-between">
        <div>
          <div className="flex flex-col gap-4 mb-6">
          <div className="flex items-center gap-2">
            <Folder className="w-5 h-5 text-white/70" />
            <h2 className="text-xl font-heading italic">Explorer</h2>
          </div>
          <div className="rounded-3xl border border-white/15 bg-white/[0.03] p-4 text-sm text-white/70">
            <p className="mb-2 uppercase tracking-[0.3em] text-white/40 text-[10px]">Sessions</p>
            <div className="space-y-2">
              {sessions.map((session) => (
                <button
                  key={session.id}
                  onClick={() => setCurrentSessionId(session.id)}
                  className={`w-full text-left rounded-2xl px-3 py-2 text-xs ${session.id === currentSessionId ? 'bg-white/10 text-white' : 'bg-transparent text-white/70 hover:bg-white/10'}`}
                >
                  {session.name}
                </button>
              ))}
            </div>
            <button
              onClick={() => {
                  const nextId = `session-${Date.now()}`;
                  setSessions((prev) => [
                    ...prev,
                    { id: nextId, name: `Session ${prev.length + 1}`, messages: [{ role: 'assistant', text: `Started new session in workspace: ${workspaceId}.` }], docs: [] }
                  ]);
                  setCurrentSessionId(nextId);
                }}
              className="mt-4 w-full rounded-2xl border border-white/10 bg-white/5 py-2 text-[11px] uppercase tracking-[0.3em] text-white/70 hover:bg-white/10"
            >
              New session
            </button>
          </div>
        </div>
          <div
            {...getRootProps()}
            className={`relative rounded-3xl border border-white/15 bg-white/[0.06] backdrop-blur-xl p-6 text-center transition-all hover:border-white/30 ${
              isDragActive ? "border-purple-400/40 bg-purple-500/10" : ""
            }`}
          >
            <input {...getInputProps()} />
            <UploadCloud className="mx-auto mb-4 w-10 h-10 text-white/70" />
            <h3 className="text-sm uppercase tracking-[0.3em] text-white/60 mb-2">Upload Document</h3>
            <p className="text-xs text-white/50 leading-relaxed">
              Drop a file here or click to choose a PDF, DOCX, CSV, PPTX, or image.
            </p>
          </div>

          {documents.length > 0 ? (
            <div className="mt-6 rounded-3xl border border-white/10 bg-white/[0.06] p-4">
              <div className="flex items-center justify-between gap-2 mb-3">
                <p className="text-xs uppercase text-white/40 tracking-[0.3em]">Uploaded Files</p>
                <span className="text-[10px] text-white/50">{documents.length} files</span>
              </div>
              <div className="space-y-3">
                {documents.map((doc) => (
                  <div key={doc.id} className="rounded-3xl border border-white/10 bg-black/20 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-white">{doc.filename}</p>
                        <p className="text-[11px] text-white/50">{doc.file_type.toUpperCase()} · {doc.page_count} pages</p>
                      </div>
                      <button
                        onClick={() => handleDeleteDocument(doc.id)}
                        className="text-[11px] uppercase tracking-[0.2em] text-white/60 hover:text-white"
                      >
                        Delete
                      </button>
                    </div>
                    <p className="mt-2 text-[11px] text-white/50">Status: {doc.status}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="mt-6 p-4 rounded-3xl border border-white/10 bg-white/[0.06] backdrop-blur-xl">
            <h4 className="text-xs uppercase text-white/40 mb-3">Processing Status</h4>
            <div className="space-y-2 text-xs text-white/70">
              {uploadSteps.length ? (
                uploadSteps.map((step, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-purple-400" />
                    <span>{step}</span>
                  </div>
                ))
              ) : (
                <p className="text-white/40">Upload a document to see the full ingest cycle.</p>
              )}
            </div>
            {error ? (
              <div className="mt-4 rounded-2xl bg-red-500/10 border border-red-500/20 p-3 text-xs text-red-100">
                <AlertTriangle className="inline mr-2 align-text-bottom" />
                {error}
              </div>
            ) : null}
          </div>
        </div>

        <div className="text-xs text-white/30 font-light">Workspace ID: {workspaceId}</div>
      </aside>

      <main className="flex-[3] flex flex-col border-r border-white/10">
        <header className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-purple-400" />
            <span className="font-heading italic text-lg">AI Assistant</span>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {currentMessages.map((m, i) => (
            <div
              key={i}
              className={`max-w-xl p-4 rounded-3xl text-sm ${
                m.role === "user"
                  ? "ml-auto bg-white/10 text-white font-body"
                  : "bg-white/[0.04] border border-white/10 text-white/90 font-body"
              }`}
            >
              {m.text}
            </div>
          ))}

          <div className="mt-4 flex items-center gap-3">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              placeholder="Ask a question about uploaded documents..."
              className="flex-1 bg-white/5 border border-white/10 rounded-full px-5 py-3 text-sm text-white focus:outline-none focus:border-white/40 font-body"
            />
            <button
              onClick={handleSend}
              className="liquid-glass-strong rounded-full px-5 py-3 text-sm text-white hover:bg-white/10 transition-all"
            >
              Ask
            </button>
          </div>

          {documents.length > 0 ? (
            <div className="rounded-3xl border border-white/10 bg-white/[0.05] p-5">
              <h3 className="text-base font-heading italic mb-4">Recent Documents</h3>
              <div className="space-y-3">
                {documents.map((doc) => (
                  <div key={doc.id} className="rounded-3xl border border-white/10 bg-black/20 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-white">{doc.filename}</p>
                        <p className="text-[11px] text-white/50">{doc.file_type.toUpperCase()} · {doc.page_count} pages</p>
                      </div>
                      <span className={`rounded-full px-3 py-1 text-[11px] ${doc.status === "completed" ? "bg-emerald-500/15 text-emerald-200" : doc.status === "processing" ? "bg-sky-500/15 text-sky-200" : "bg-white/10 text-white/70"}`}>
                        {doc.status}
                      </span>
                    </div>
                    {doc.summary ? <p className="mt-3 text-xs text-white/60">{doc.summary}</p> : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="p-4 border-t border-white/10 flex gap-2 items-center">
          <button
            onClick={fetchWorkspaceDocuments}
            className="liquid-glass-strong rounded-full px-5 py-3 text-sm text-white hover:bg-white/10 transition-all"
          >
            Refresh documents
          </button>
          {uploading ? (
            <span className="text-xs text-white/60">Processing upload...</span>
          ) : null}
        </div>
      </main>

      <aside className="w-96 bg-white/[0.04] backdrop-blur-2xl p-6 space-y-6 overflow-y-auto">
        <div className="flex items-center gap-2">
          <BarChart2 className="w-5 h-5 text-white/70" />
          <h2 className="text-xl font-heading italic">Document Insights</h2>
        </div>

        <div className="p-5 rounded-3xl border border-white/10 bg-white/[0.06]">
          <h4 className="text-xs uppercase text-white/40 mb-3 font-body">Executive Summary</h4>
          <p className="text-xs text-white/70 font-light leading-relaxed">
            Upload and process a document to see a complete insight summary, keyword extraction, timeline and entity highlights.
          </p>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-5">
          <h4 className="text-xs uppercase text-white/40 mb-3 font-body">Top Keywords</h4>
          <div className="flex flex-wrap gap-2">
            {['RAG', 'ChromaDB', 'FastAPI', 'Next.js 15', 'Embedding'].map((tag) => (
              <span key={tag} className="text-[10px] px-3 py-2 rounded-full bg-white/5 border border-white/10 text-white/60">
                {tag}
              </span>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}
