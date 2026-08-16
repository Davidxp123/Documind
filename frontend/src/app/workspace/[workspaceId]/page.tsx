'use client';

import { useEffect, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { useParams } from 'next/navigation';
import { Folder, Sparkles, BarChart2, UploadCloud, AlertTriangle, User, Bot } from 'lucide-react';

type DocumentStatus = {
  id: string;
  workspace_id: string;
  session_id?: string | null;
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

type SessionState = {
  id: string;
  name: string;
  messages: { role: 'user' | 'assistant'; text: string }[];
  docs: DocumentStatus[];
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '/api';

export default function WorkspacePage() {
  const params = useParams();
  const workspaceId = String(params?.workspaceId ?? '');
  const [input, setInput] = useState('');
  const [uploadSteps, setUploadSteps] = useState<string[]>([]);
  const [documents, setDocuments] = useState<DocumentStatus[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionState[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState('');
  const [activeTab, setActiveTab] = useState<'explorer' | 'chat' | 'insights'>('chat');

  const currentSession: SessionState = sessions.find((session) => session.id === currentSessionId) ?? {
    id: '',
    name: '',
    messages: [],
    docs: [],
  };
  const currentMessages = currentSession.messages;

  const updateSessionMessages = (newMessages: { role: 'user' | 'assistant'; text: string }[]) => {
    setSessions((prev) => prev.map((session) => (session.id === currentSessionId ? { ...session, messages: newMessages } : session)));
  };

  const appendSessionMessage = (message: { role: 'user' | 'assistant'; text: string }) => {
    setSessions((prev) => prev.map((session) => (session.id !== currentSessionId ? session : { ...session, messages: [...session.messages, message] })));
  };

  const appendSessionDoc = (doc: DocumentStatus) => {
    setSessions((prev) => prev.map((session) => {
      if (session.id !== currentSessionId) return session;
      if (session.docs.some((d) => d.id === doc.id)) return session;
      return { ...session, docs: [...session.docs, doc] };
    }));
  };

  const removeSessionDoc = (docId: string) => {
    setSessions((prev) => prev.map((session) => {
      if (session.id !== currentSessionId) return session;
      return { ...session, docs: session.docs.filter((d) => d.id !== docId) };
    }));
  };

  const updateSessionDocsFromWorkspace = (workspaceDocs: DocumentStatus[]) => {
    setSessions((prev) => prev.map((session) => ({
      ...session,
      docs: workspaceDocs.filter((doc) => doc.session_id === session.id),
    })));
  };

  const fetchWorkspaceDocuments = async () => {
    if (!workspaceId) return;
    try {
      const response = await fetch(`${API_BASE}/documents/workspace/${workspaceId}`);
      if (!response.ok) throw new Error(await response.text());
      const docs = await response.json();
      setDocuments(docs);
      updateSessionDocsFromWorkspace(docs);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchSessionMessages = async (sessionId: string) => {
    try {
      const response = await fetch(`${API_BASE}/documents/session/${sessionId}/messages`);
      if (!response.ok) throw new Error(await response.text());
      const messages = await response.json();
      const formattedMessages = messages.map((m: any) => ({
        role: m.role,
        text: m.content
      }));
      setSessions((prev) => prev.map((s) => (s.id === sessionId ? { ...s, messages: formattedMessages } : s)));
    } catch (err) {
      console.error(err);
      setError('Unable to fetch chat history.');
    }
  };

  const fetchWorkspaceSessions = async () => {
    try {
      const response = await fetch(`${API_BASE}/workspaces/${workspaceId}/sessions`);
      if (!response.ok) throw new Error(await response.text());
      const data = await response.json();
      if (!Array.isArray(data) || data.length === 0) {
        await createDefaultSession();
        return;
      }
      const normalized = data.map((session: any) => ({
        id: session.id,
        name: session.name,
        messages: [],
        docs: [],
      }));
      setSessions(normalized);
      const firstSessionId = normalized[0]?.id;
      if (firstSessionId) {
        setCurrentSessionId(firstSessionId);
        fetchSessionMessages(firstSessionId);
      }
    } catch (err) {
      console.error(err);
      await createDefaultSession();
    }
  };

  const createDefaultSession = async () => {
    const name = 'Session 1';
    try {
      const response = await fetch(`${API_BASE}/workspaces/${workspaceId}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!response.ok) throw new Error(await response.text());
      const session = await response.json();
      setSessions([{ id: session.id, name: session.name, messages: [{ role: 'assistant' as const, text: `Started a new session in workspace ${workspaceId}.` }], docs: [] }]);
      setCurrentSessionId(session.id);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    const initWorkspace = async () => {
      await fetchWorkspaceSessions();
      await fetchWorkspaceDocuments();
    };

    initWorkspace();
  }, [workspaceId]);

  const setStage = (stages: string[]) => setUploadSteps(stages);

  const handleSend = async () => {
    if (!input.trim()) return;
    const pendingDocs = currentSession.docs.filter((d) => d.status !== 'completed');
    if (pendingDocs.length > 0) {
      const warningMessage = 'One or more selected documents are still processing. Please wait a few seconds and try again.';
      setError(warningMessage);
      appendSessionMessage({ role: 'assistant', text: warningMessage });
      return;
    }

    const currentQuery = input;
    setInput('');
    const updatedMessages: { role: 'user' | 'assistant'; text: string }[] = [...currentMessages, { role: 'user', text: currentQuery }];
    updateSessionMessages(updatedMessages);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/documents/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace_id: workspaceId, session_id: currentSessionId, query: currentQuery, doc_ids: currentSession.docs.map((d) => d.id) }),
      });
      if (!response.ok) throw new Error(await response.text());
      const result = await response.json();
      appendSessionMessage({ role: 'assistant', text: result.answer || 'No answer returned from the workspace.' });
    } catch (err: any) {
      setError(err?.message || 'Failed to fetch answer.');
      appendSessionMessage({ role: 'assistant', text: 'Sorry, I could not generate an answer right now.' });
    }
  };

  const pollDocumentStatus = async (docId: string | null) => {
    if (!docId) return;
    let count = 0;
    const interval = setInterval(async () => {
      count += 1;
      try {
        const response = await fetch(`${API_BASE}/documents/workspace/${workspaceId}`);
        if (!response.ok) throw new Error(await response.text());
        const docs: DocumentStatus[] = await response.json();
        setDocuments(docs);
        const doc = docs.find((item) => item.id === docId);
        if (!doc || doc.status === 'completed' || doc.status.startsWith('failed') || count >= 15) {
          clearInterval(interval);
          if (doc?.status === 'completed') {
            setStage(['Upload complete', 'Extraction finished', 'Embedding complete', 'Analysis finalized']);
            appendSessionMessage({ role: 'assistant', text: `Document ${doc.filename} has finished processing.` });
            setSessions((prev) => prev.map((session) => {
              if (session.id !== currentSessionId) return session;
              return {
                ...session,
                docs: session.docs.map((d) => (d.id === doc.id ? { ...d, ...doc } : d)),
              };
            }));
          } else if (doc?.status.startsWith('failed')) {
            setStage(['Upload complete', 'Processing failed']);
            setError(`Processing failed: ${doc.status}`);
          }
        } else if (doc.status === 'processing') {
          setStage(['Upload complete', 'Extracting text', 'Chunking content', 'Building embeddings', 'Generating insights']);
        }
      } catch (err) {
        clearInterval(interval);
        console.error(err);
        setError('Unable to poll document status.');
      }
    }, 2500);
  };

  const handleDeleteDocument = async (docId: string) => {
    try {
      const resp = await fetch(`${API_BASE}/documents/${docId}`, { method: 'DELETE' });
      if (!resp.ok) throw new Error(await resp.text());
      setDocuments((prev) => prev.filter((d) => d.id !== docId));
      removeSessionDoc(docId);
      appendSessionMessage({ role: 'assistant', text: 'Document removed from this session.' });
    } catch (e: any) {
      console.error(e);
      setError(e?.message || 'Failed to delete document');
    }
  };

  const renameSession = async (sessionId: string) => {
    const newName = prompt('Rename session', sessions.find((s) => s.id === sessionId)?.name ?? 'Session');
    if (!newName?.trim()) return;
    try {
      const response = await fetch(`${API_BASE}/workspaces/${workspaceId}/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() }),
      });
      if (!response.ok) throw new Error(await response.text());
      const updated = await response.json();
      setSessions((prev) => prev.map((session) => (session.id === sessionId ? { ...session, name: updated.name } : session)));
    } catch (err) {
      console.error(err);
      setError('Unable to rename session.');
    }
  };

  const createNewSession = async () => {
    const name = `Session ${sessions.length + 1}`;
    try {
      const response = await fetch(`${API_BASE}/workspaces/${workspaceId}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!response.ok) throw new Error(await response.text());
      const session = await response.json();
      setSessions((prev) => [...prev, { ...session, docs: [], messages: [{ role: 'assistant', text: `Started a new session in workspace ${workspaceId}.` }] }]);
      setCurrentSessionId(session.id);
    } catch (err) {
      console.error(err);
      setError('Unable to create session.');
    }
  };

  const deleteSession = async (sessionId: string) => {
    if (!confirm('Are you sure you want to delete this session and its associated session documents?')) return;
    try {
      const response = await fetch(`${API_BASE}/workspaces/${workspaceId}/sessions/${sessionId}`, { method: 'DELETE' });
      if (!response.ok) throw new Error(await response.text());
      const remaining = sessions.filter((session) => session.id !== sessionId);
      setSessions(remaining);
      if (currentSessionId === sessionId) {
        setCurrentSessionId(remaining[0]?.id ?? '');
      }
    } catch (err) {
      console.error(err);
      setError('Unable to delete session.');
    }
  };

  const getTopInsights = () => {
    const insights: string[] = [];
    for (const doc of currentSession.docs) {
      if (doc.summary) {
        const sentences = doc.summary.split(/(?<=[.!?])\s+/).filter(Boolean);
        for (const sentence of sentences) {
          if (insights.length >= 5) break;
          const cleaned = sentence.trim();
          if (cleaned && !insights.includes(cleaned)) {
            insights.push(cleaned);
          }
        }
      }
      if (insights.length >= 5) break;
    }

    if (insights.length === 0) {
      for (const msg of currentMessages) {
        if (msg.role === 'assistant' && msg.text && !msg.text.includes('ready') && !msg.text.includes('Started a new session')) {
          const sentences = msg.text.split(/(?<=[.!?])\s+/).filter((s) => s.length > 20);
          for (const s of sentences) {
            if (insights.length >= 4) break;
            const cleaned = s.trim();
            if (cleaned && !insights.includes(cleaned)) {
              insights.push(cleaned);
            }
          }
        }
        if (insights.length >= 4) break;
      }
    }
    return insights;
  };

  const getTopKeywords = () => {
    const counts: Record<string, number> = {};
    const stopwords = new Set([
      'the', 'and', 'for', 'that', 'this', 'with', 'you', 'are', 'not', 'have', 'from', 'was', 'what', 'your',
      'can', 'about', 'document', 'session', 'workspace', 'upload', 'begin', 'ready', 'files', 'file',
      'text', 'content', 'system', 'please', 'there', 'were', 'which', 'would', 'could', 'should', 'here', 'ready.'
    ]);

    for (const doc of currentSession.docs) {
      for (const keyword of doc.keywords ?? []) {
        const k = keyword.toLowerCase().trim();
        if (k && !stopwords.has(k)) {
          counts[k] = (counts[k] || 0) + 3;
        }
      }
    }

    for (const msg of currentMessages) {
      const words = msg.text.match(/\b[a-zA-Z]{4,}\b/g) || [];
      for (const word of words) {
        const w = word.toLowerCase();
        if (!stopwords.has(w)) {
          counts[w] = (counts[w] || 0) + 1;
        }
      }
    }

    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([keyword]) => keyword.charAt(0).toUpperCase() + keyword.slice(1));
  };

  const assignDocumentToSession = async (doc: DocumentStatus, sessionId: string | null) => {
    try {
      const response = await fetch(`${API_BASE}/documents/${doc.id}/session`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId }),
      });
      if (!response.ok) throw new Error(await response.text());
      const updated = await response.json();
      setDocuments((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      if (sessionId === currentSessionId) {
        appendSessionDoc(updated);
      } else if (doc.session_id === currentSessionId) {
        removeSessionDoc(doc.id);
      }
    } catch (err) {
      console.error(err);
      setError('Unable to update document session membership.');
    }
  };

  const onDrop = async (acceptedFiles: File[]) => {
    if (!acceptedFiles.length) return;
    setError(null);
    setUploading(true);
    setStage(['Preparing upload']);

    try {
      for (const file of acceptedFiles) {
        const formData = new FormData();
        formData.append('workspace_id', workspaceId);
        if (currentSessionId) {
          formData.append('session_id', currentSessionId);
        }
        formData.append('file', file);

        setStage([`Uploading ${file.name}...`]);
        const response = await fetch(`${API_BASE}/documents/upload`, {
          method: 'POST',
          body: formData,
        });
        if (!response.ok) throw new Error(await response.text());
        const data = await response.json();
        setStage(['Upload complete', 'Queuing processing...']);
        appendSessionMessage({ role: 'assistant', text: `Document ${file.name} uploaded. Processing has started in the background.` });
        if (data?.doc) {
          appendSessionDoc(data.doc as DocumentStatus);
          setDocuments((prev) => [data.doc, ...prev]);
          pollDocumentStatus(data.doc.id);
        } else {
          await fetchWorkspaceDocuments();
        }
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to upload document.');
      setStage(['Error uploading document.']);
    } finally {
      setUploading(false);
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, multiple: true });

  return (
    <div className="flex h-screen bg-black text-white overflow-hidden flex-col lg:flex-row">
      {/* Mobile Tab Bar */}
      <div className="lg:hidden flex border-b border-white/10 bg-white/[0.04] backdrop-blur-2xl flex-shrink-0">
        <button
          onClick={() => setActiveTab('explorer')}
          className={`flex-1 py-4 text-[10px] uppercase tracking-[0.2em] font-medium transition-all ${activeTab === 'explorer' ? 'bg-white/10 text-white border-b-2 border-purple-400' : 'text-white/40'}`}
        >
          Sessions
        </button>
        <button
          onClick={() => setActiveTab('chat')}
          className={`flex-1 py-4 text-[10px] uppercase tracking-[0.2em] font-medium transition-all ${activeTab === 'chat' ? 'bg-white/10 text-white border-b-2 border-purple-400' : 'text-white/40'}`}
        >
          Chat
        </button>
        <button
          onClick={() => setActiveTab('insights')}
          className={`flex-1 py-4 text-[10px] uppercase tracking-[0.2em] font-medium transition-all ${activeTab === 'insights' ? 'bg-white/10 text-white border-b-2 border-purple-400' : 'text-white/40'}`}
        >
          Insights
        </button>
      </div>

      <aside className={`
        ${activeTab === 'explorer' ? 'flex' : 'hidden'} 
        lg:flex lg:w-72 border-r border-white/10 bg-white/[0.04] backdrop-blur-2xl p-5 flex-col justify-between overflow-y-auto h-full flex-shrink-0
      `}>
        <div className="space-y-6">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Folder className="w-5 h-5 text-white/70" />
              <h2 className="text-xl font-heading italic">Session Explorer</h2>
            </div>
            <div className="rounded-3xl border border-white/15 bg-white/[0.03] p-4 text-sm text-white/70">
              <p className="mb-3 uppercase tracking-[0.3em] text-white/40 text-[10px]">Sessions</p>
              <div className="space-y-3">
                {sessions.map((session) => (
                  <div key={session.id} className="space-y-2">
                    <button
                      onClick={() => {
                        setCurrentSessionId(session.id);
                        if (window.innerWidth < 1024) setActiveTab('chat');
                      }}
                      className={`w-full text-left rounded-2xl px-3 py-2 text-xs ${session.id === currentSessionId ? 'bg-white/10 text-white' : 'bg-transparent text-white/70 hover:bg-white/10'} transition-all`}
                    >
                      {session.name}
                    </button>
                    {session.id === currentSessionId ? (
                      <div className="flex gap-2 text-[10px] text-white/50">
                        <button onClick={() => renameSession(session.id)} className="uppercase tracking-[0.2em] hover:text-white">Rename</button>
                        <button onClick={() => deleteSession(session.id)} className="uppercase tracking-[0.2em] hover:text-white">Delete</button>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
              <button
                onClick={createNewSession}
                className="mt-4 w-full rounded-2xl border border-white/10 bg-white/5 py-2 text-[11px] uppercase tracking-[0.3em] text-white/70 hover:bg-white/10"
              >
                New session
              </button>
            </div>
          </div>

          <div
            {...getRootProps()}
            className={`relative rounded-3xl border border-white/15 bg-white/[0.06] backdrop-blur-xl p-6 text-center transition-all hover:border-white/30 ${isDragActive ? 'border-purple-400/40 bg-purple-500/10' : ''}`}
          >
            <input {...getInputProps()} />
            <UploadCloud className="mx-auto mb-4 w-10 h-10 text-white/70" />
            <h3 className="text-sm uppercase tracking-[0.3em] text-white/60 mb-2">Upload document</h3>
            <p className="text-xs text-white/50 leading-relaxed">Drag and drop files for the active session, or click to choose PDF, DOCX, CSV, PPTX, or image files.</p>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-4">
            <div className="flex items-center justify-between gap-2 mb-3">
              <p className="text-xs uppercase text-white/40 tracking-[0.3em]">Session documents</p>
              <span className="text-[10px] text-white/50">{currentSession.docs.length} files</span>
            </div>
            <div className="space-y-3">
              {currentSession.docs.map((doc) => (
                <div key={doc.id} className="rounded-2xl border border-white/10 bg-black/30 p-3 overflow-hidden">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-white truncate" title={doc.filename}>{doc.filename}</p>
                      <p className="text-[10px] text-white/50 mt-0.5">{doc.file_type.toUpperCase()} · {doc.page_count} pages</p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button onClick={() => assignDocumentToSession(doc, null)} className="text-[10px] uppercase tracking-wider text-white/70 hover:text-white px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 transition-all">Remove</button>
                      <button onClick={() => handleDeleteDocument(doc.id)} className="text-[10px] uppercase tracking-wider text-red-400/90 hover:text-red-300 px-2 py-1 rounded-lg bg-red-500/10 hover:bg-red-500/20 transition-all">Delete</button>
                    </div>
                  </div>
                  <p className="mt-2 text-[10px] text-white/40">Status: {doc.status}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-4">
            <h4 className="text-xs uppercase text-white/40 mb-3">Processing status</h4>
            <div className="space-y-2 text-xs text-white/70">
              {uploadSteps.length ? (uploadSteps.map((step, index) => (
                <div key={index} className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-purple-400" />
                  <span>{step}</span>
                </div>
              ))) : (
                <p className="text-white/40">Upload a document to reveal the ingest workflow and status details.</p>
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
        <div className="text-xs text-white/30 font-light mt-6">Workspace ID: {workspaceId}</div>
      </aside>

      <main className={`
        ${activeTab === 'chat' ? 'flex' : 'hidden'}
        lg:flex lg:flex-[6] flex-col border-r border-white/10 h-full overflow-hidden
      `}>
        <header className="px-6 py-4 border-b border-white/10 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <Sparkles className="w-5 h-5 text-purple-400" />
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-white/40">AI Assistant</p>
              <h1 className="text-xl md:text-2xl font-heading italic">Conversation workspace</h1>
            </div>
          </div>
          <div className="text-[10px] md:text-xs text-white/50">Active: {currentSession.name}</div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
          <div className="space-y-6">
            {currentMessages.map((message, index) => (
              <div
                key={index}
                className={`flex items-start gap-3 ${
                  message.role === 'user' ? 'justify-end' : 'justify-start'
                }`}
              >
                {message.role === 'assistant' && (
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-tr from-purple-600/70 to-purple-400/90 border border-purple-300/30 flex items-center justify-center shadow-lg shadow-purple-500/20 mt-1">
                    <Sparkles className="w-4 h-4 text-white" />
                  </div>
                )}
                <div
                  className={`p-4 rounded-3xl text-sm leading-relaxed whitespace-pre-wrap ${
                    message.role === 'user'
                      ? 'bg-white/10 border border-white/15 text-white max-w-[85%] md:max-w-[75%]'
                      : 'bg-white/[0.04] border border-white/10 text-white/90 max-w-[90%] md:max-w-[85%]'
                  }`}
                >
                  {message.text}
                </div>
                {message.role === 'user' && (
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-white/10 border border-white/20 flex items-center justify-center shadow-md mt-1">
                    <User className="w-4 h-4 text-white/80" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="p-4 md:p-6 border-t border-white/10 bg-black/20 backdrop-blur-md flex-shrink-0 mt-auto">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Ask a question about uploaded documents..."
              className="flex-1 bg-white/5 border border-white/10 rounded-full px-5 py-3 text-sm text-white focus:outline-none focus:border-white/40"
            />
            <button
              onClick={handleSend}
              disabled={currentSession.docs.some((d) => d.status !== 'completed')}
              className={`liquid-glass-strong rounded-full px-8 py-3 text-sm font-medium text-white transition-all ${currentSession.docs.some((d) => d.status !== 'completed') ? 'opacity-50 cursor-not-allowed bg-white/10' : 'hover:bg-white/10'}`}>
              Ask
            </button>
          </div>
        </div>
      </main>

      <aside className={`
        ${activeTab === 'insights' ? 'flex' : 'hidden'}
        lg:flex lg:w-80 xl:w-96 bg-white/[0.04] backdrop-blur-2xl p-6 flex-col gap-6 overflow-y-auto h-full flex-shrink-0
      `}>
        <div className="flex items-center gap-2">
          <BarChart2 className="w-5 h-5 text-white/70" />
          <h2 className="text-xl font-heading italic">Session Insights</h2>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-5">
          <h4 className="text-xs uppercase text-white/40 mb-3">Executive summary</h4>
          {getTopInsights().length ? (
            <ul className="list-inside list-disc text-xs text-white/70 space-y-2">
              {getTopInsights().map((ins, idx) => (
                <li key={idx}>{ins}</li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-white/70 leading-relaxed">The system will auto-generate document insights once documents are uploaded and processed.</p>
          )}
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-5">
          <h4 className="text-xs uppercase text-white/40 mb-3">Top keywords</h4>
          <div className="flex flex-wrap gap-2">
            {getTopKeywords().length ? getTopKeywords().map((keyword) => (
              <span key={keyword} className="text-[10px] px-3 py-2 rounded-full bg-white/5 border border-white/10 text-white/60">{keyword}</span>
            )) : (
              <span className="text-[10px] px-3 py-2 rounded-full bg-white/5 border border-white/10 text-white/40">No keywords yet</span>
            )}
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-5">
          <h4 className="text-xs uppercase text-white/40 mb-3">Workspace document library</h4>
          <div className="space-y-3">
            {documents.map((doc) => (
              <div key={doc.id} className="rounded-3xl border border-white/10 bg-black/10 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm text-white truncate" title={doc.filename}>{doc.filename}</p>
                    <p className="text-[11px] text-white/50">{doc.file_type.toUpperCase()}</p>
                  </div>
                  <button
                    onClick={() => {
                      assignDocumentToSession(doc, currentSessionId);
                      if (window.innerWidth < 1024) setActiveTab('explorer');
                    }}
                    className="text-[11px] uppercase tracking-[0.2em] text-white/60 hover:text-white flex-shrink-0"
                  >
                    Add
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}
