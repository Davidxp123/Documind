'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { useRouter, usePathname } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import {
  Sparkles,
  UploadCloud,
  FileText,
  FileSpreadsheet,
  FileImage,
  Presentation,
  File,
  Trash2,
  Edit2,
  MoreVertical,
  Paperclip,
  Send,
  BarChart2,
  Check,
  RotateCcw,
  Activity,
  User,
  Plus,
  AlertTriangle,
  CheckCircle2,
  LogOut,
  Loader2,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase/client';

type DocumentStatus = {
  id: string;
  workspace_id?: string;
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
  const router = useRouter();
  const pathname = usePathname();
  const [workspaceId, setWorkspaceId] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const parts = window.location.pathname.split('/').filter(Boolean);
      if (parts[0] === 'workspace' && parts[1]) {
        return decodeURIComponent(parts[1]);
      }
    }
    return 'default';
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const parts = (pathname || window.location.pathname).split('/').filter(Boolean);
      if (parts[0] === 'workspace' && parts[1]) {
        setWorkspaceId(decodeURIComponent(parts[1]));
      }
    }
  }, [pathname]);

  const { user, session, loading: authLoading, signOut } = useAuth();

  const [input, setInput] = useState('');
  const [documents, setDocuments] = useState<DocumentStatus[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionState[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState('');
  const [activeTab, setActiveTab] = useState<'sessions' | 'chat' | 'insights'>('chat');
  const [activeMenuSessionId, setActiveMenuSessionId] = useState<string | null>(null);
  const [activeMenuDocId, setActiveMenuDocId] = useState<string | null>(null);
  const [sessionMenuPos, setSessionMenuPos] = useState<{ top: number; right: number } | null>(null);
  const [docMenuPos, setDocMenuPos] = useState<{ top: number; right: number } | null>(null);
  const [expandedMessages, setExpandedMessages] = useState<Record<number, boolean>>({});
  const [processingStage, setProcessingStage] = useState<number>(5); // 1: Upload Complete, 2: Extraction, 3: Embedding, 4: Analysis, 5: Ready
  const [isProcessing, setIsProcessing] = useState(false);
  const [showAllDocs, setShowAllDocs] = useState(false);
  const [userScrolledUp, setUserScrolledUp] = useState(false);
  const [hasNewMessage, setHasNewMessage] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Authentication guard
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login?redirectTo=/workspace');
    }
  }, [user, authLoading, router]);

  // Helper to get fresh access token
  const getAccessToken = useCallback(async (): Promise<string | null> => {
    if (session?.access_token) return session.access_token;
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }, [session]);

  const currentSession: SessionState = sessions.find((session) => session.id === currentSessionId) ?? {
    id: currentSessionId || 'default',
    name: 'Sample-1',
    messages: [],
    docs: [],
  };
  const currentMessages = currentSession.messages;

  // Auto-scroll to bottom
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    if (!userScrolledUp) {
      container.scrollTop = container.scrollHeight;
      setHasNewMessage(false);
    } else {
      setHasNewMessage(true);
    }
  }, [currentMessages, userScrolledUp]);

  const handleMessagesScroll = () => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const distFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    setUserScrolledUp(distFromBottom > 100);
    if (distFromBottom <= 100) setHasNewMessage(false);
  };

  const scrollToBottom = () => {
    const container = messagesContainerRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
    setUserScrolledUp(false);
    setHasNewMessage(false);
  };

  const updateSessionMessages = (newMessages: { role: 'user' | 'assistant'; text: string }[]) => {
    setSessions((prev) =>
      prev.map((session) =>
        session.id === currentSessionId ? { ...session, messages: newMessages } : session
      )
    );
  };

  const appendSessionMessage = (message: { role: 'user' | 'assistant'; text: string }) => {
    setSessions((prev) =>
      prev.map((session) =>
        session.id !== currentSessionId
          ? session
          : { ...session, messages: [...session.messages, message] }
      )
    );
  };

  const appendSessionDoc = (doc: DocumentStatus) => {
    setSessions((prev) =>
      prev.map((session) => {
        if (session.id !== currentSessionId) return session;
        if (session.docs.some((d) => d.id === doc.id)) {
          return {
            ...session,
            docs: session.docs.map((d) => (d.id === doc.id ? { ...d, ...doc } : d)),
          };
        }
        return { ...session, docs: [...session.docs, doc] };
      })
    );
  };

  const removeSessionDoc = (docId: string) => {
    setSessions((prev) =>
      prev.map((session) => {
        if (session.id !== currentSessionId) return session;
        return { ...session, docs: session.docs.filter((d) => d.id !== docId) };
      })
    );
  };

  const fetchSessionDocuments = useCallback(async (sessionId: string) => {
    const token = await getAccessToken();
    if (!token) return;

    try {
      const response = await fetch(`${API_BASE}/documents/session/${sessionId}/documents`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!response.ok) return;
      const docs: DocumentStatus[] = await response.json();
      if (Array.isArray(docs)) {
        setSessions((prev) =>
          prev.map((s) => (s.id === sessionId ? { ...s, docs } : s))
        );
      }
    } catch (err) {
      console.warn('Session documents fetch warning:', err);
    }
  }, [getAccessToken]);

  const fetchSessionMessages = useCallback(async (sessionId: string) => {
    const token = await getAccessToken();
    if (!token) return;

    try {
      const response = await fetch(`${API_BASE}/documents/session/${sessionId}/messages`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!response.ok) return;
      const messages = await response.json();
      if (Array.isArray(messages) && messages.length > 0) {
        const formattedMessages = messages.map((m: any) => ({
          role: m.role as 'user' | 'assistant',
          text: m.content,
        }));
        setSessions((prev) =>
          prev.map((s) => (s.id === sessionId ? { ...s, messages: formattedMessages } : s))
        );
      } else {
        // Initial welcome message if fresh session
        setSessions((prev) =>
          prev.map((s) =>
            s.id === sessionId && s.messages.length === 0
              ? {
                  ...s,
                  messages: [
                    {
                      role: 'assistant',
                      text: "Hello! I've processed your documents and they are ready for analysis.\nHow can I assist you today?",
                    },
                  ],
                }
              : s
          )
        );
      }
    } catch (err) {
      console.warn('Session messages fetch warning:', err);
    }
  }, [getAccessToken]);

  const createDefaultSession = useCallback(async () => {
    const defaultName = 'Sample-1';
    const token = await getAccessToken();
    if (!token) return;

    try {
      const response = await fetch(`${API_BASE}/workspaces/${workspaceId}/sessions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: defaultName }),
      });
      if (response.ok) {
        const sessionData = await response.json();
        setSessions([
          {
            id: sessionData.id,
            name: sessionData.name,
            messages: [
              {
                role: 'assistant',
                text: "Hello! I've processed your documents and they are ready for analysis.\nHow can I assist you today?",
              },
            ],
            docs: [],
          },
        ]);
        setCurrentSessionId(sessionData.id);
      }
    } catch (err) {
      console.warn('Default session creation fallback:', err);
    }
  }, [getAccessToken, workspaceId]);

  const fetchWorkspaceSessions = useCallback(async () => {
    const token = await getAccessToken();
    if (!token) return;

    try {
      const response = await fetch(`${API_BASE}/workspaces/${workspaceId}/sessions`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!response.ok) throw new Error(await response.text());
      const data = await response.json();
      if (!Array.isArray(data) || data.length === 0) {
        await createDefaultSession();
        return;
      }
      const normalized: SessionState[] = data.map((session: any) => ({
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
        fetchSessionDocuments(firstSessionId);
      }
    } catch (err) {
      console.warn('Workspace sessions fetch error:', err);
      await createDefaultSession();
    }
  }, [getAccessToken, workspaceId, createDefaultSession, fetchSessionMessages, fetchSessionDocuments]);

  // Initial load when user is authenticated
  useEffect(() => {
    if (user && !authLoading) {
      fetchWorkspaceSessions();
    }
  }, [user, authLoading, fetchWorkspaceSessions]);

  // Close dropdowns on outside click or Escape
  useEffect(() => {
    const handleGlobalClick = () => {
      setActiveMenuSessionId(null);
      setActiveMenuDocId(null);
      setSessionMenuPos(null);
      setDocMenuPos(null);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActiveMenuSessionId(null);
        setActiveMenuDocId(null);
        setSessionMenuPos(null);
        setDocMenuPos(null);
      }
    };
    window.addEventListener('click', handleGlobalClick);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('click', handleGlobalClick);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const pollDocumentStatus = async (docId: string | null) => {
    if (!docId) return;
    setIsProcessing(true);
    setProcessingStage(1); // Upload Complete

    let count = 0;
    const token = await getAccessToken();

    const interval = setInterval(async () => {
      count += 1;

      try {
        if (currentSessionId && token) {
          const response = await fetch(`${API_BASE}/documents/session/${currentSessionId}/documents`, {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });
          if (response.ok) {
            const docs: DocumentStatus[] = await response.json();
            setSessions((prev) =>
              prev.map((s) => (s.id === currentSessionId ? { ...s, docs } : s))
            );

            const doc = docs.find((item) => item.id === docId);
            if (doc) {
              if (doc.status === 'processing') {
                if (count === 1) setProcessingStage(2); // Extraction
                else if (count === 2) setProcessingStage(3); // Embedding
                else setProcessingStage(4); // Analysis
              } else if (doc.status === 'completed' || doc.status.startsWith('failed') || count >= 25) {
                clearInterval(interval);
                setIsProcessing(false);
                setProcessingStage(5); // Ready

                if (doc.status.startsWith('failed')) {
                  setError(`Document processing failed: ${doc.status}`);
                }
              }
            }
          }
        }
      } catch (err) {
        if (count >= 15) {
          clearInterval(interval);
          setIsProcessing(false);
          setProcessingStage(5);
        }
      }
    }, 1500);
  };

  const handleSend = async () => {
    if (!input.trim() || !currentSessionId) return;

    const pendingDocs = currentSession.docs.filter(
      (d) => d.status === 'pending' || d.status === 'processing'
    );
    if (pendingDocs.length > 0) {
      const warningMessage =
        'One or more documents are still processing. Please allow a few moments for indexing to complete.';
      setError(warningMessage);
      appendSessionMessage({ role: 'assistant', text: warningMessage });
      return;
    }

    const currentQuery = input.trim();
    setInput('');
    const updatedMessages: { role: 'user' | 'assistant'; text: string }[] = [
      ...currentMessages,
      { role: 'user', text: currentQuery },
    ];
    updateSessionMessages(updatedMessages);
    setError(null);

    const token = await getAccessToken();
    if (!token) {
      setError('You must be logged in to send messages.');
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/documents/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          workspace_id: workspaceId,
          session_id: currentSessionId,
          query: currentQuery,
          doc_ids: currentSession.docs.map((d) => d.id),
        }),
      });

      if (!response.ok) throw new Error(await response.text());
      const result = await response.json();
      appendSessionMessage({
        role: 'assistant',
        text: result.answer || 'No answer returned from the workspace documents.',
      });
    } catch (err: any) {
      console.error(err);
      setError(err?.message || 'Failed to fetch answer.');
      appendSessionMessage({
        role: 'assistant',
        text: 'Sorry, I encountered an issue retrieving the answer from the document context. Please try again.',
      });
    }
  };

  const onDrop = async (acceptedFiles: File[]) => {
    if (!acceptedFiles.length || !currentSessionId) return;
    setError(null);
    setUploading(true);
    setIsProcessing(true);
    setProcessingStage(1);

    const token = await getAccessToken();
    if (!token) {
      setError('You must be logged in to upload documents.');
      setUploading(false);
      setIsProcessing(false);
      return;
    }

    try {
      for (const file of acceptedFiles) {
        const formData = new FormData();
        formData.append('workspace_id', workspaceId);
        formData.append('session_id', currentSessionId);
        formData.append('file', file);

        const response = await fetch(`${API_BASE}/documents/upload`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: formData,
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(errText || 'Upload failed');
        }

        const data = await response.json();
        if (data?.doc) {
          appendSessionDoc(data.doc as DocumentStatus);
          pollDocumentStatus(data.doc.id);
        } else {
          await fetchSessionDocuments(currentSessionId);
        }
      }
    } catch (err: any) {
      console.error(err);
      setError(err?.message || 'Failed to upload document.');
      setIsProcessing(false);
      setProcessingStage(5);
    } finally {
      setUploading(false);
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: true,
  });

  const handleDeleteDocument = async (docId: string) => {
    const token = await getAccessToken();
    if (!token) return;

    try {
      const resp = await fetch(`${API_BASE}/documents/${docId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!resp.ok) throw new Error(await resp.text());
      removeSessionDoc(docId);
      setActiveMenuDocId(null);
    } catch (e: any) {
      console.error(e);
      setError(e?.message || 'Failed to delete document');
    }
  };

  const handleRenameDocument = async (docId: string, currentFilename: string) => {
    const newName = prompt('Rename document:', currentFilename);
    if (!newName?.trim() || newName.trim() === currentFilename) return;

    const token = await getAccessToken();
    if (!token) return;

    try {
      const response = await fetch(`${API_BASE}/documents/${docId}/rename`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ filename: newName.trim() }),
      });
      if (!response.ok) throw new Error(await response.text());
      const updated = await response.json();
      setSessions((prev) =>
        prev.map((s) => ({
          ...s,
          docs: s.docs.map((d) => (d.id === docId ? { ...d, filename: updated.filename } : d)),
        }))
      );
      setActiveMenuDocId(null);
    } catch (err: any) {
      setError('Unable to rename document.');
    }
  };

  const handleRetryDocument = async (docId: string) => {
    const token = await getAccessToken();
    if (!token) return;

    try {
      const resp = await fetch(`${API_BASE}/documents/${docId}/retry`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (resp.ok) {
        pollDocumentStatus(docId);
        setActiveMenuDocId(null);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const createNewSession = async () => {
    const name = `Sample-${sessions.length + 1}`;
    const token = await getAccessToken();
    if (!token) return;

    try {
      const response = await fetch(`${API_BASE}/workspaces/${workspaceId}/sessions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name }),
      });
      if (response.ok) {
        const sessionData = await response.json();
        const newSessionState: SessionState = {
          id: sessionData.id,
          name: sessionData.name,
          docs: [],
          messages: [
            {
              role: 'assistant',
              text: "Hello! I've started a new conversation session for you. Upload documents or ask questions to begin.",
            },
          ],
        };
        // Insert at the front (most recent first)
        setSessions((prev) => [newSessionState, ...prev]);
        setCurrentSessionId(sessionData.id);
      }
    } catch (err) {
      console.error('Failed to create new session:', err);
    }
  };

  const renameSession = async (sessionId: string) => {
    const currentName = sessions.find((s) => s.id === sessionId)?.name ?? 'Session';
    const newName = prompt('Rename session:', currentName);
    if (!newName?.trim() || newName.trim() === currentName) return;

    const token = await getAccessToken();
    if (!token) return;

    try {
      const response = await fetch(`${API_BASE}/workspaces/${workspaceId}/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: newName.trim() }),
      });
      if (!response.ok) throw new Error(await response.text());
      const updated = await response.json();
      setSessions((prev) =>
        prev.map((session) =>
          session.id === sessionId ? { ...session, name: updated.name } : session
        )
      );
      setActiveMenuSessionId(null);
    } catch (err) {
      console.error('Failed to rename session:', err);
      setActiveMenuSessionId(null);
    }
  };

  const deleteSession = async (sessionId: string) => {
    if (!confirm('Are you sure you want to delete this session?')) return;

    const token = await getAccessToken();
    if (token) {
      try {
        await fetch(`${API_BASE}/workspaces/${workspaceId}/sessions/${sessionId}`, {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
      } catch (err) {
        console.warn('Delete session call failed:', err);
      }
    }

    const remaining = sessions.filter((session) => session.id !== sessionId);
    if (remaining.length === 0) {
      await createDefaultSession();
    } else {
      setSessions(remaining);
      if (currentSessionId === sessionId) {
        const nextId = remaining[0]?.id ?? '';
        setCurrentSessionId(nextId);
        if (nextId) {
          fetchSessionMessages(nextId);
          fetchSessionDocuments(nextId);
        }
      }
    }
    setActiveMenuSessionId(null);
  };

  const getTopInsights = () => {
    const insights: string[] = [];
    for (const doc of currentSession.docs) {
      if (doc.summary) {
        const sentences = doc.summary
          .split(/(?<=[.!?])\s+|\n+/)
          .map((s) => s.replace(/^[-*•]\s*/, '').trim())
          .filter((s) => s.length > 20);
        for (const sentence of sentences) {
          if (insights.length >= 8) break;
          if (!insights.includes(sentence)) {
            insights.push(sentence);
          }
        }
      }
    }
    return insights;
  };

  const getTopKeywords = () => {
    const counts: Record<string, number> = {};
    const stopwords = new Set([
      'the', 'and', 'for', 'that', 'this', 'with', 'you', 'are', 'not', 'have', 'from', 'was',
      'what', 'your', 'can', 'about', 'document', 'session', 'workspace', 'upload', 'begin',
      'ready', 'files', 'file', 'text', 'content', 'system', 'please', 'there', 'were', 'which',
      'would', 'could', 'should', 'here', 'ready.', 'based', 'using', 'also', 'will',
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

  const formatFileSize = (bytes: number) => {
    if (!bytes || bytes === 0) return '1.2 MB';
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getFileIcon = (fileType: string) => {
    const ext = fileType.toLowerCase().replace('.', '');
    if (['pdf'].includes(ext)) {
      return <FileText className="w-4 h-4 text-red-400" />;
    }
    if (['xlsx', 'xls', 'csv'].includes(ext)) {
      return <FileSpreadsheet className="w-4 h-4 text-emerald-400" />;
    }
    if (['png', 'jpg', 'jpeg', 'webp'].includes(ext)) {
      return <FileImage className="w-4 h-4 text-violet-400" />;
    }
    if (['pptx', 'ppt'].includes(ext)) {
      return <Presentation className="w-4 h-4 text-orange-400" />;
    }
    if (['docx', 'doc'].includes(ext)) {
      return <FileText className="w-4 h-4 text-blue-400" />;
    }
    return <File className="w-4 h-4 text-purple-300" />;
  };

  const displayedDocs = showAllDocs ? currentSession.docs : currentSession.docs.slice(0, 6);

  if (authLoading) {
    return (
      <div className="min-h-[calc(100vh-73px)] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
          <p className="text-xs text-white/60 tracking-wider uppercase font-medium">Loading Workspace...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null; // Handled by useEffect redirect
  }

  return (
    <div className="h-[calc(100vh-73px)] w-full p-2.5 sm:p-4 lg:p-5 flex flex-col overflow-hidden bg-transparent select-none">
      {/* 3-Column Glass Card Container */}
      <div className="w-full h-full max-w-[1780px] mx-auto rounded-[28px] border border-white/15 bg-black/65 backdrop-blur-2xl grid grid-cols-1 lg:grid-cols-[280px_1fr_320px] xl:grid-cols-[300px_1fr_340px] overflow-hidden shadow-2xl min-h-0">
        
        {/* ========================================================================= */}
        {/* LEFT COLUMN: Workspace Header -> SESSIONS -> DOCUMENTS                     */}
        {/* ========================================================================= */}
        <aside
          className={`
            ${activeTab === 'sessions' ? 'flex' : 'hidden'}
            lg:flex flex-col h-full overflow-hidden border-r border-white/10 p-4 xl:p-5 bg-white/[0.02] min-h-0
          `}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-5 flex-shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-purple-600/80 to-purple-400/90 flex items-center justify-center shadow-lg shadow-purple-500/20 border border-purple-300/30">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <h1 className="text-2xl font-heading italic text-white tracking-wide">Workspace</h1>
            </div>
            <span className="text-[10px] text-white/40 max-w-[100px] truncate" title={user.email || ''}>
              {user.email?.split('@')[0]}
            </span>
          </div>

          {/* SESSIONS BLOCK */}
          <div className="flex flex-col min-h-0 flex-shrink-0 mb-5">
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-[10px] uppercase tracking-[0.25em] text-white/40 font-semibold">
                SESSIONS
              </span>
              <button
                onClick={createNewSession}
                className="flex items-center gap-1 border border-white/15 rounded-full px-2.5 py-1 text-[10px] text-white/80 hover:bg-white/10 hover:text-white transition-all font-medium"
              >
                <Plus className="w-3 h-3 text-purple-400" />
                <span>New Session</span>
              </button>
            </div>

            {/* Session List */}
            <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1 workspace-scroll">
              {sessions.map((session) => {
                const isActive = session.id === currentSessionId;
                return (
                  <div
                    key={session.id}
                    className={`group relative flex items-center justify-between rounded-xl px-3 py-2 text-xs transition-all cursor-pointer ${
                      isActive
                        ? 'bg-white/10 border border-white/15 text-white shadow-sm font-medium'
                        : 'bg-transparent text-white/70 hover:bg-white/5 hover:text-white'
                    }`}
                    onClick={() => {
                      setCurrentSessionId(session.id);
                      fetchSessionMessages(session.id);
                      fetchSessionDocuments(session.id);
                      if (window.innerWidth < 1024) setActiveTab('chat');
                    }}
                  >
                    <span className="truncate pr-2">{session.name}</span>

                    {/* Kebab menu trigger */}
                    <div className="flex-shrink-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (activeMenuSessionId === session.id) {
                            setActiveMenuSessionId(null);
                            setSessionMenuPos(null);
                          } else {
                            const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                            setSessionMenuPos({
                              top: rect.bottom + 4,
                              right: window.innerWidth - rect.right,
                            });
                            setActiveMenuSessionId(session.id);
                            setActiveMenuDocId(null);
                            setDocMenuPos(null);
                          }
                        }}
                        className="p-1 rounded-md text-white/40 hover:text-white hover:bg-white/10 transition-all"
                        title="Session options"
                      >
                        <MoreVertical className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Dedicated Delete Session Button */}
            <button
              onClick={() => currentSessionId && deleteSession(currentSessionId)}
              className="mt-3 w-full rounded-xl border border-red-500/20 bg-red-500/10 py-2 text-xs text-red-300 hover:bg-red-500/20 hover:text-red-200 transition-all flex items-center justify-center gap-2 font-medium"
            >
              <Trash2 className="w-3.5 h-3.5 text-red-400" />
              <span>Delete Session</span>
            </button>
          </div>

          {/* DOCUMENTS BLOCK */}
          <div className="flex-1 flex flex-col min-h-0">
            <span className="text-[10px] uppercase tracking-[0.25em] text-white/40 font-semibold mb-2.5">
              DOCUMENTS
            </span>

            {/* Drag & Drop Upload Zone */}
            <div
              {...getRootProps()}
              className={`rounded-2xl border border-dashed border-white/20 bg-white/[0.03] p-4 text-center cursor-pointer transition-all hover:border-purple-400/40 hover:bg-purple-500/5 ${
                isDragActive ? 'border-purple-400 bg-purple-500/10' : ''
              }`}
            >
              <input {...getInputProps()} />
              <UploadCloud className="mx-auto mb-2 w-6 h-6 text-white/70" />
              <p className="text-xs text-white/80 font-medium">Drag & drop files here</p>
              <p className="text-xs text-purple-400 font-medium hover:underline mt-0.5">
                or click to browse
              </p>
              <p className="text-[10px] text-white/40 mt-1.5">
                Supported formats: PDF, DOCX, CSV, PPTX, TXT, MD, Images
              </p>
            </div>

            {/* Document List */}
            <div className="space-y-2 mt-3 flex-1 overflow-y-auto pr-1 workspace-scroll">
              {displayedDocs.map((doc) => (
                <div
                  key={doc.id}
                  className="group relative flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] p-2.5 hover:bg-white/[0.06] transition-all"
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <div className="w-7 h-7 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center flex-shrink-0">
                      {getFileIcon(doc.file_type)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-white truncate" title={doc.filename}>
                        {doc.filename}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-white/50 uppercase">
                          {doc.file_type.toUpperCase()} · {formatFileSize(doc.file_size)}
                        </span>
                        {doc.status !== 'completed' && (
                          <span
                            className={`text-[9px] px-1.5 py-0.2 rounded-md max-w-[85px] truncate font-medium ${
                              doc.status.startsWith('failed')
                                ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                                : 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                            }`}
                            title={doc.status}
                          >
                            {doc.status.startsWith('failed') ? 'Failed' : 'Processing'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Kebab menu */}
                  <div className="flex-shrink-0 ml-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (activeMenuDocId === doc.id) {
                          setActiveMenuDocId(null);
                          setDocMenuPos(null);
                        } else {
                          const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                          setDocMenuPos({
                            top: rect.bottom + 4,
                            right: window.innerWidth - rect.right,
                          });
                          setActiveMenuDocId(doc.id);
                          setActiveMenuSessionId(null);
                          setSessionMenuPos(null);
                        }
                      }}
                      className="p-1 rounded-md text-white/40 hover:text-white hover:bg-white/10 transition-all"
                      title="Document options"
                    >
                      <MoreVertical className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}

              {currentSession.docs.length === 0 && (
                <p className="text-[11px] text-white/40 text-center py-4">
                  No documents in this session yet.
                </p>
              )}
            </div>

            {/* View all documents link */}
            {currentSession.docs.length > 6 && (
              <button
                onClick={() => setShowAllDocs(!showAllDocs)}
                className="mt-2 text-left text-xs text-purple-400 hover:text-purple-300 transition-colors flex items-center gap-1 font-medium"
              >
                <span>{showAllDocs ? 'Show fewer documents ↑' : 'View all documents →'}</span>
              </button>
            )}
          </div>
        </aside>

        {/* ========================================================================= */}
        {/* CENTER COLUMN: AI Assistant Conversation & Timeline & Sticky Input        */}
        {/* ========================================================================= */}
        <main
          className={`
            ${activeTab === 'chat' ? 'flex' : 'hidden'}
            lg:flex flex-col h-full overflow-hidden border-r border-white/10 min-w-0 bg-transparent
          `}
        >
          {/* Header */}
          <header className="px-5 xl:px-6 py-4 border-b border-white/10 flex items-center justify-between flex-shrink-0 bg-white/[0.01]">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-purple-600 to-purple-400 border border-purple-300/30 flex items-center justify-center shadow-lg shadow-purple-500/20">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-[0.25em] text-white/40 font-semibold">
                  AI ASSISTANT
                </p>
                <h2 className="text-xl md:text-2xl font-heading italic text-white tracking-wide">
                  Conversation
                </h2>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-xs text-purple-400 font-medium">
                Active session: <span className="text-purple-300">{currentSession.name}</span>
              </div>
            </div>
          </header>

          {/* Messages Scroll Area */}
          <div className="relative flex-1 flex flex-col min-h-0">
            <div
              ref={messagesContainerRef}
              onScroll={handleMessagesScroll}
              className="flex-1 overflow-y-auto p-4 md:p-6 space-y-5 min-h-0 select-text workspace-scroll"
            >
              {currentMessages.map((message, index) => {
                const isAssistant = message.role === 'assistant';
                const isExpanded = expandedMessages[index] ?? false;
                const isLong = isAssistant && message.text.length > 1800;

                return (
                  <div
                    key={index}
                    className={`flex items-start gap-3 ${
                      isAssistant ? 'justify-start' : 'justify-end'
                    }`}
                  >
                    {isAssistant && (
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-tr from-purple-600 to-purple-400 border border-purple-300/30 flex items-center justify-center shadow-md shadow-purple-500/20 mt-1">
                        <Sparkles className="w-4 h-4 text-white" />
                      </div>
                    )}

                    <div
                      className={`rounded-3xl p-4 md:p-5 text-sm leading-relaxed ${
                        isAssistant
                          ? 'bg-white/[0.04] border border-white/10 text-white/90 max-w-[90%] md:max-w-[82%]'
                          : 'bg-white/10 border border-white/15 text-white max-w-[85%] md:max-w-[75%]'
                      }`}
                    >
                      {isAssistant ? (
                        <div className="prose prose-invert prose-sm max-w-none prose-p:my-1 prose-ul:my-1.5 prose-li:my-0.5">
                          <ReactMarkdown>
                            {isLong && !isExpanded
                              ? `${message.text.slice(0, 900)}...`
                              : message.text}
                          </ReactMarkdown>
                          {isLong && (
                            <button
                              onClick={() =>
                                setExpandedMessages((prev) => ({
                                  ...prev,
                                  [index]: !prev[index],
                                }))
                              }
                              className="mt-2 text-xs text-purple-400 hover:text-purple-300 font-medium flex items-center gap-1 transition-colors"
                            >
                              <span>{isExpanded ? 'See less ↑' : 'See details ↓'}</span>
                            </button>
                          )}
                        </div>
                      ) : (
                        <p className="whitespace-pre-wrap">{message.text}</p>
                      )}
                    </div>

                    {!isAssistant && (
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-white/10 border border-white/20 flex items-center justify-center shadow-md mt-1">
                        <User className="w-4 h-4 text-white/80" />
                      </div>
                    )}
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {userScrolledUp && hasNewMessage && (
              <button
                onClick={scrollToBottom}
                className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-purple-500/40 bg-black/70 backdrop-blur-md text-xs text-purple-300 hover:text-white hover:bg-purple-600/30 transition-all shadow-lg"
              >
                <span>New message ↓</span>
              </button>
            )}
          </div>

          {/* Bottom Container: Processing Status Timeline + Sticky Chat Input */}
          <div className="p-4 md:p-5 border-t border-white/10 bg-black/40 backdrop-blur-md flex-shrink-0 space-y-3">
            
            {/* Horizontal Animated Processing Status Timeline */}
            <div className="flex items-center justify-between gap-3 px-2 py-1">
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <Activity className="w-3.5 h-3.5 text-purple-400" />
                <span className="text-[11px] font-medium text-white/70">Processing Status</span>
              </div>

              {/* 5-Stage Timeline Nodes */}
              <div className="flex items-center gap-1 sm:gap-2 flex-1 max-w-xl justify-end">
                {/* 1. Upload Complete */}
                <div className="flex flex-col items-center">
                  <div className="w-6 h-6 rounded-full bg-purple-600 border border-purple-300 flex items-center justify-center shadow-md shadow-purple-500/40">
                    <Check className="w-3.5 h-3.5 text-white" />
                  </div>
                  <span className="text-[9px] text-white/60 mt-1 whitespace-nowrap hidden sm:inline">
                    Upload Complete
                  </span>
                </div>

                <div
                  className={`h-0.5 flex-1 min-w-[12px] sm:min-w-[20px] transition-all duration-500 ${
                    processingStage >= 2 ? 'bg-purple-500' : 'bg-white/15 border-t border-dotted border-white/25'
                  }`}
                />

                {/* 2. Extraction */}
                <div className="flex flex-col items-center">
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center transition-all duration-300 ${
                      processingStage === 2
                        ? 'bg-purple-600 border border-purple-300 shadow-md shadow-purple-500/40 animate-pulse text-white'
                        : processingStage > 2
                        ? 'bg-purple-600 border border-purple-300 shadow-md shadow-purple-500/40 text-white'
                        : 'bg-white/10 border border-white/15 text-white/40'
                    }`}
                  >
                    {processingStage > 2 ? <Check className="w-3.5 h-3.5 text-white" /> : <Sparkles className="w-3 h-3 text-white" />}
                  </div>
                  <span className="text-[9px] text-white/60 mt-1 whitespace-nowrap hidden sm:inline">
                    Extraction
                  </span>
                </div>

                <div
                  className={`h-0.5 flex-1 min-w-[12px] sm:min-w-[20px] transition-all duration-500 ${
                    processingStage >= 3 ? 'bg-purple-500' : 'bg-white/15 border-t border-dotted border-white/25'
                  }`}
                />

                {/* 3. Embedding */}
                <div className="flex flex-col items-center">
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center transition-all duration-300 ${
                      processingStage === 3
                        ? 'bg-purple-600 border border-purple-300 shadow-md shadow-purple-500/40 animate-pulse text-white'
                        : processingStage > 3
                        ? 'bg-purple-600 border border-purple-300 shadow-md shadow-purple-500/40 text-white'
                        : 'bg-white/10 border border-white/15 text-white/40'
                    }`}
                  >
                    {processingStage > 3 ? <Check className="w-3.5 h-3.5 text-white" /> : <Sparkles className="w-3 h-3 text-white" />}
                  </div>
                  <span className="text-[9px] text-white/60 mt-1 whitespace-nowrap hidden sm:inline">
                    Embedding
                  </span>
                </div>

                <div
                  className={`h-0.5 flex-1 min-w-[12px] sm:min-w-[20px] transition-all duration-500 ${
                    processingStage >= 4 ? 'bg-purple-500' : 'bg-white/15 border-t border-dotted border-white/25'
                  }`}
                />

                {/* 4. Analysis */}
                <div className="flex flex-col items-center">
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center transition-all duration-300 ${
                      processingStage === 4
                        ? 'bg-purple-600 border border-purple-300 shadow-md shadow-purple-500/40 animate-pulse text-white'
                        : processingStage > 4
                        ? 'bg-purple-600 border border-purple-300 shadow-md shadow-purple-500/40 text-white'
                        : 'bg-white/10 border border-white/15 text-white/40'
                    }`}
                  >
                    {processingStage > 4 ? <Check className="w-3.5 h-3.5 text-white" /> : <Sparkles className="w-3 h-3 text-white" />}
                  </div>
                  <span className="text-[9px] text-white/60 mt-1 whitespace-nowrap hidden sm:inline">
                    Analysis
                  </span>
                </div>

                <div
                  className={`h-0.5 flex-1 min-w-[12px] sm:min-w-[20px] transition-all duration-500 ${
                    processingStage >= 5 ? 'bg-purple-500' : 'bg-white/15 border-t border-dotted border-white/25'
                  }`}
                />

                {/* 5. Ready */}
                <div className="flex flex-col items-center">
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center transition-all duration-300 ${
                      processingStage >= 5
                        ? 'bg-purple-600 border border-purple-300 text-white shadow-md shadow-purple-500/40'
                        : 'bg-white/5 border border-white/10 text-white/40'
                    }`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-[9px] text-white/60 mt-1 whitespace-nowrap hidden sm:inline">
                    Ready
                  </span>
                </div>
              </div>
            </div>

            {/* Error banner */}
            {error && (
              <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
                  <span>{error}</span>
                </div>
                <button
                  onClick={() => setError(null)}
                  className="text-white/40 hover:text-white text-xs px-2"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Input Bar */}
            <div className="flex items-center gap-2 rounded-2xl border border-white/15 bg-white/[0.04] p-1.5 focus-within:border-purple-400/50 focus-within:bg-white/[0.06] transition-all">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.length) {
                    onDrop(Array.from(e.target.files));
                    e.target.value = '';
                  }
                }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="p-2.5 rounded-xl text-white/60 hover:text-white hover:bg-white/10 transition-all disabled:opacity-50"
                title="Attach files to session"
              >
                <Paperclip className="w-4 h-4" />
              </button>

              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Ask anything grounded in your session's documents..."
                className="flex-1 bg-transparent px-2 py-2 text-sm text-white placeholder-white/40 focus:outline-none"
              />

              <button
                type="button"
                onClick={handleSend}
                disabled={!input.trim() || uploading}
                className="liquid-glass-strong rounded-xl px-4 py-2.5 text-white disabled:opacity-40 hover:bg-white/20 transition-all flex items-center gap-1.5 text-xs font-medium"
              >
                <span>Send</span>
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </main>

        {/* ========================================================================= */}
        {/* RIGHT COLUMN: Session Insights (Executive Summary + Top Keywords)         */}
        {/* ========================================================================= */}
        <aside
          className={`
            ${activeTab === 'insights' ? 'flex' : 'hidden'}
            lg:flex flex-col h-full overflow-hidden p-4 xl:p-5 bg-white/[0.02] min-h-0
          `}
        >
          <div className="flex items-center gap-2.5 mb-5 flex-shrink-0">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-purple-600/80 to-purple-400/90 flex items-center justify-center shadow-lg shadow-purple-500/20 border border-purple-300/30">
              <BarChart2 className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.25em] text-white/40 font-semibold">
                ANALYTICS
              </p>
              <h2 className="text-xl font-heading italic text-white tracking-wide">
                Session Insights
              </h2>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto pr-1 space-y-5 workspace-scroll">
            {/* Executive Summary */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-md">
              <h3 className="text-xs uppercase tracking-wider text-purple-300 font-medium mb-3 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                <span>Executive Summary</span>
              </h3>

              {getTopInsights().length > 0 ? (
                <ul className="space-y-2 text-xs text-white/80 leading-relaxed">
                  {getTopInsights().map((insight, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="text-purple-400 font-bold mt-0.5">•</span>
                      <span>{insight}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-white/40 leading-relaxed">
                  Upload documents to generate an executive summary grounded in your active session.
                </p>
              )}
            </div>

            {/* Top Keywords */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-md">
              <h3 className="text-xs uppercase tracking-wider text-purple-300 font-medium mb-3">
                Top Keywords
              </h3>
              {getTopKeywords().length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {getTopKeywords().map((kw, idx) => (
                    <span
                      key={idx}
                      className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-white/80"
                    >
                      {kw}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-white/40">
                  Key entities and themes will appear here as you upload documents and converse.
                </p>
              )}
            </div>
          </div>
        </aside>
      </div>

      {/* Floating Kebab Context Menus */}
      {activeMenuSessionId && sessionMenuPos && (
        <div
          style={{
            position: 'fixed',
            top: `${sessionMenuPos.top}px`,
            right: `${sessionMenuPos.right}px`,
          }}
          className="z-50 w-36 rounded-xl border border-white/15 bg-black/90 backdrop-blur-2xl p-1.5 shadow-2xl space-y-1"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => renameSession(activeMenuSessionId)}
            className="w-full flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-white/80 hover:bg-white/10 hover:text-white transition-colors text-left"
          >
            <Edit2 className="w-3.5 h-3.5 text-purple-400" />
            <span>Rename</span>
          </button>
          <button
            onClick={() => deleteSession(activeMenuSessionId)}
            className="w-full flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-red-300 hover:bg-red-500/20 hover:text-red-200 transition-colors text-left"
          >
            <Trash2 className="w-3.5 h-3.5 text-red-400" />
            <span>Delete</span>
          </button>
        </div>
      )}

      {activeMenuDocId && docMenuPos && (
        <div
          style={{
            position: 'fixed',
            top: `${docMenuPos.top}px`,
            right: `${docMenuPos.right}px`,
          }}
          className="z-50 w-36 rounded-xl border border-white/15 bg-black/90 backdrop-blur-2xl p-1.5 shadow-2xl space-y-1"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => {
              const doc = currentSession.docs.find((d) => d.id === activeMenuDocId);
              if (doc) handleRenameDocument(doc.id, doc.filename);
            }}
            className="w-full flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-white/80 hover:bg-white/10 hover:text-white transition-colors text-left"
          >
            <Edit2 className="w-3.5 h-3.5 text-purple-400" />
            <span>Rename</span>
          </button>
          <button
            onClick={() => handleRetryDocument(activeMenuDocId)}
            className="w-full flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-white/80 hover:bg-white/10 hover:text-white transition-colors text-left"
          >
            <RotateCcw className="w-3.5 h-3.5 text-blue-400" />
            <span>Retry</span>
          </button>
          <button
            onClick={() => handleDeleteDocument(activeMenuDocId)}
            className="w-full flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-red-300 hover:bg-red-500/20 hover:text-red-200 transition-colors text-left"
          >
            <Trash2 className="w-3.5 h-3.5 text-red-400" />
            <span>Delete</span>
          </button>
        </div>
      )}

      {/* Mobile Tab Bar */}
      <div className="lg:hidden flex items-center justify-around mt-2 p-2 rounded-2xl border border-white/15 bg-black/70 backdrop-blur-xl">
        <button
          onClick={() => setActiveTab('sessions')}
          className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
            activeTab === 'sessions' ? 'bg-white/15 text-white' : 'text-white/60 hover:text-white'
          }`}
        >
          Sessions
        </button>
        <button
          onClick={() => setActiveTab('chat')}
          className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
            activeTab === 'chat' ? 'bg-white/15 text-white' : 'text-white/60 hover:text-white'
          }`}
        >
          Chat
        </button>
        <button
          onClick={() => setActiveTab('insights')}
          className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
            activeTab === 'insights' ? 'bg-white/15 text-white' : 'text-white/60 hover:text-white'
          }`}
        >
          Insights
        </button>
      </div>
    </div>
  );
}
