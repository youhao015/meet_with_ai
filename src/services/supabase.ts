import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://tbowdfpwhgakbgecdoqg.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});

export interface MeetingRecord {
  id: string;
  user_id?: string;
  title: string;
  date: string;
  duration_seconds: number;
  source: 'live' | 'teams' | 'google' | 'upload';
  transcript: string;
  summary: {
    overview?: string;
    key_points?: string[];
    decisions?: string[];
    action_items?: Array<{ task: string; assignee: string; due_date?: string; status?: 'pending' | 'completed' }>;
  };
  status: string;
  audio_url?: string;
  created_at: string;
}

export interface ActionItemRecord {
  id: string;
  meeting_id: string;
  user_id?: string;
  task: string;
  assignee?: string;
  due_date?: string;
  status: 'pending' | 'in_progress' | 'completed';
  created_at: string;
}

// Fetch meetings for current session
export async function fetchMeetings(): Promise<MeetingRecord[]> {
  const { data, error } = await supabase
    .from('meetings')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.warn('Error fetching meetings from Supabase:', error.message);
    return [];
  }
  return data || [];
}

export type ActionItemInput = {
  task: string;
  assignee?: string;
  due_date?: string;
};

// Save meeting and action items
export async function saveMeetingWithItems(meeting: Partial<MeetingRecord>, actionItems?: ActionItemInput[]): Promise<MeetingRecord | null> {
  const { data: { user } } = await supabase.auth.getUser();

  const { data: savedMeeting, error } = await supabase
    .from('meetings')
    .insert({
      user_id: user?.id || null,
      title: meeting.title || 'Meeting Recording',
      duration_seconds: meeting.duration_seconds || 0,
      source: meeting.source || 'live',
      transcript: meeting.transcript || '',
      summary: meeting.summary || {},
      audio_url: meeting.audio_url || null,
      status: 'completed'
    })
    .select()
    .single();

  if (error) {
    console.error('Error saving meeting:', error);
    return null;
  }

  if (actionItems && actionItems.length > 0 && savedMeeting) {
    const items = actionItems.map((item) => ({
      meeting_id: savedMeeting.id,
      user_id: user?.id || null,
      task: item.task,
      assignee: item.assignee || 'Unassigned',
      due_date: item.due_date ? new Date(item.due_date).toISOString() : null,
      status: 'pending'
    }));

    await supabase.from('action_items').insert(items);
  }

  return savedMeeting;
}

/** Delete a meeting and its associated audio file from storage */
export async function deleteMeeting(meetingId: string, audioUrl?: string): Promise<boolean> {
  // Remove audio from storage if present
  if (audioUrl) {
    try {
      const urlParts = audioUrl.split('/meeting-recordings/');
      if (urlParts.length === 2) {
        const filePath = decodeURIComponent(urlParts[1]);
        await supabase.storage.from('meeting-recordings').remove([filePath]);
      }
    } catch (err) {
      console.warn('[deleteMeeting] Could not remove audio file:', err);
    }
  }

  const { error } = await supabase
    .from('meetings')
    .delete()
    .eq('id', meetingId);

  if (error) {
    console.error('[deleteMeeting] Error:', error.message);
    return false;
  }
  return true;
}

/** Update a single action item's status */
export async function updateActionItemStatus(
  actionItemId: string,
  status: 'pending' | 'in_progress' | 'completed'
): Promise<boolean> {
  const { error } = await supabase
    .from('action_items')
    .update({ status })
    .eq('id', actionItemId);

  if (error) {
    console.error('[updateActionItemStatus] Error:', error.message);
    return false;
  }
  return true;
}

/** Update meeting action items in both meetings table and action_items table */
export async function updateMeetingActionItems(
  meetingId: string,
  actionItems: Array<{ task: string; assignee?: string; due_date?: string; status?: 'pending' | 'completed' }>
): Promise<boolean> {
  try {
    // 1. Update summary column in meetings table
    const { data: meeting } = await supabase
      .from('meetings')
      .select('summary')
      .eq('id', meetingId)
      .single();

    if (meeting && meeting.summary) {
      const updatedSummary = {
        ...meeting.summary,
        action_items: actionItems
      };
      await supabase
        .from('meetings')
        .update({ summary: updatedSummary })
        .eq('id', meetingId);
    }

    // 2. Also update status in action_items table for matching tasks
    for (const item of actionItems) {
      if (!item.task) continue;
      const statusVal = item.status === 'completed' ? 'completed' : 'pending';
      await supabase
        .from('action_items')
        .update({ status: statusVal })
        .eq('meeting_id', meetingId)
        .eq('task', item.task);
    }

    return true;
  } catch (err) {
    console.warn('[updateMeetingActionItems] Error:', err);
    return false;
  }
}

/** Fetch action items for a specific meeting */
export async function fetchActionItems(meetingId: string): Promise<ActionItemRecord[]> {
  const { data, error } = await supabase
    .from('action_items')
    .select('*')
    .eq('meeting_id', meetingId)
    .order('created_at', { ascending: true });

  if (error) {
    console.warn('[fetchActionItems] Error:', error.message);
    return [];
  }
  return data || [];
}

/** Fetch all action items across meetings */
export async function fetchAllActionItems(): Promise<ActionItemRecord[]> {
  const { data, error } = await supabase
    .from('action_items')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.warn('[fetchAllActionItems] Error:', error.message);
    return [];
  }
  return data || [];
}

/** Create a new action item in Supabase */
export async function createActionItem(task: string, assignee?: string, meetingId?: string): Promise<ActionItemRecord | null> {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('action_items')
    .insert({
      user_id: user?.id || null,
      meeting_id: meetingId || null,
      task,
      assignee: assignee || 'Unassigned',
      status: 'pending'
    })
    .select()
    .single();

  if (error) {
    console.error('[createActionItem] Error:', error.message);
    return null;
  }
  return data;
}

/** Delete an action item from Supabase */
export async function deleteActionItem(id: string): Promise<boolean> {
  const { error } = await supabase
    .from('action_items')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('[deleteActionItem] Error:', error.message);
    return false;
  }
  return true;
}
