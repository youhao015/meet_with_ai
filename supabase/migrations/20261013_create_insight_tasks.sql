-- Create dedicated insight_tasks table completely separated from meeting vault
CREATE TABLE IF NOT EXISTS public.insight_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  task TEXT NOT NULL,
  assignee TEXT,
  due_date TIMESTAMPTZ,
  status TEXT CHECK (status IN ('pending', 'in_progress', 'completed')) DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Performance index
CREATE INDEX IF NOT EXISTS idx_insight_tasks_user_id ON public.insight_tasks(user_id);

-- Enable Row Level Security (RLS)
ALTER TABLE public.insight_tasks ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can manage their own insight tasks
DROP POLICY IF EXISTS "Users can manage own insight tasks" ON public.insight_tasks;
CREATE POLICY "Users can manage own insight tasks"
  ON public.insight_tasks FOR ALL
  USING (auth.uid() = user_id OR user_id IS NULL)
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL);
