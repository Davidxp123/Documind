-- =============================================================================
-- DocuMind Schema & Row Level Security (RLS) Policies
-- =============================================================================

-- Enable UUID extension if not enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. SESSIONS TABLE
CREATE TABLE IF NOT EXISTS public.sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index on sessions.user_id
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON public.sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_updated_at ON public.sessions(updated_at DESC);

-- 2. DOCUMENTS TABLE
CREATE TABLE IF NOT EXISTS public.documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    file_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index on documents.session_id
CREATE INDEX IF NOT EXISTS idx_documents_session_id ON public.documents(session_id);

-- 3. MESSAGES TABLE
CREATE TABLE IF NOT EXISTS public.messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    sources JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index on messages.session_id
CREATE INDEX IF NOT EXISTS idx_messages_session_id ON public.messages(session_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON public.messages(created_at ASC);

-- =============================================================================
-- ROW LEVEL SECURITY (RLS)
-- =============================================================================

ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Sessions policies
DROP POLICY IF EXISTS "Users can view own sessions" ON public.sessions;
CREATE POLICY "Users can view own sessions"
    ON public.sessions FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own sessions" ON public.sessions;
CREATE POLICY "Users can insert own sessions"
    ON public.sessions FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own sessions" ON public.sessions;
CREATE POLICY "Users can update own sessions"
    ON public.sessions FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own sessions" ON public.sessions;
CREATE POLICY "Users can delete own sessions"
    ON public.sessions FOR DELETE
    USING (auth.uid() = user_id);

-- Documents policies (check ownership via join to sessions)
DROP POLICY IF EXISTS "Users can view documents in own sessions" ON public.documents;
CREATE POLICY "Users can view documents in own sessions"
    ON public.documents FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.sessions
            WHERE public.sessions.id = public.documents.session_id
            AND public.sessions.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Users can insert documents into own sessions" ON public.documents;
CREATE POLICY "Users can insert documents into own sessions"
    ON public.documents FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.sessions
            WHERE public.sessions.id = public.documents.session_id
            AND public.sessions.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Users can update documents in own sessions" ON public.documents;
CREATE POLICY "Users can update documents in own sessions"
    ON public.documents FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.sessions
            WHERE public.sessions.id = public.documents.session_id
            AND public.sessions.user_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.sessions
            WHERE public.sessions.id = public.documents.session_id
            AND public.sessions.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Users can delete documents in own sessions" ON public.documents;
CREATE POLICY "Users can delete documents in own sessions"
    ON public.documents FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.sessions
            WHERE public.sessions.id = public.documents.session_id
            AND public.sessions.user_id = auth.uid()
        )
    );

-- Messages policies (check ownership via join to sessions)
DROP POLICY IF EXISTS "Users can view messages in own sessions" ON public.messages;
CREATE POLICY "Users can view messages in own sessions"
    ON public.messages FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.sessions
            WHERE public.sessions.id = public.messages.session_id
            AND public.sessions.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Users can insert messages into own sessions" ON public.messages;
CREATE POLICY "Users can insert messages into own sessions"
    ON public.messages FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.sessions
            WHERE public.sessions.id = public.messages.session_id
            AND public.sessions.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Users can update messages in own sessions" ON public.messages;
CREATE POLICY "Users can update messages in own sessions"
    ON public.messages FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.sessions
            WHERE public.sessions.id = public.messages.session_id
            AND public.sessions.user_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.sessions
            WHERE public.sessions.id = public.messages.session_id
            AND public.sessions.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Users can delete messages in own sessions" ON public.messages;
CREATE POLICY "Users can delete messages in own sessions"
    ON public.messages FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.sessions
            WHERE public.sessions.id = public.messages.session_id
            AND public.sessions.user_id = auth.uid()
        )
    );
