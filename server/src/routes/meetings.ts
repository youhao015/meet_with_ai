import { Router } from 'express';
import { supabaseAdmin, createReqSupabaseClient } from '../utils/supabase.js';
import type { Request, Response } from 'express';

const router = Router();

/**
 * POST /api/meetings/save
 * Persists a live-recorded meeting with transcript, summary, and action items.
 */
router.post('/save', async (req: Request, res: Response) => {
  try {
    const supabase = createReqSupabaseClient(req, res);
    const { data: { user } } = await supabase.auth.getUser();

    const { title, duration_seconds, source, transcript, summary, action_items } = req.body;

    const { data: meeting, error: meetingError } = await supabaseAdmin
      .from('meetings')
      .insert({
        user_id: user ? user.id : null,
        title: title || 'Meeting Recording',
        duration_seconds: duration_seconds || 0,
        source: source || 'live',
        transcript: transcript || '',
        summary: summary || {},
        status: 'completed'
      })
      .select()
      .single();

    if (meetingError) {
      console.error('Error inserting meeting:', meetingError);
      return res.status(500).json({ error: 'Database meeting insert error' });
    }

    if (action_items && Array.isArray(action_items) && action_items.length > 0) {
      const itemsToInsert = action_items.map((item: any) => ({
        meeting_id: meeting.id,
        user_id: user ? user.id : null,
        task: item.task || 'Task',
        assignee: item.assignee || 'Unassigned',
        due_date: item.due_date ? new Date(item.due_date).toISOString() : null,
        status: 'pending'
      }));

      await supabaseAdmin.from('action_items').insert(itemsToInsert);
    }

    return res.status(201).json({ meeting });
  } catch (err) {
    console.error('Error in /api/meetings/save:', err);
    return res.status(500).json({ error: 'Failed to save meeting record' });
  }
});

/**
 * GET /api/meetings
 * Returns all meetings for the authenticated user.
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const supabase = createReqSupabaseClient(req, res);
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { data, error } = await supabaseAdmin
      .from('meetings')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ meetings: data || [] });
  } catch {
    return res.status(500).json({ error: 'Failed to retrieve meetings' });
  }
});

/**
 * DELETE /api/meetings/:id
 * Deletes a meeting and its associated action items.
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const supabase = createReqSupabaseClient(req, res);
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return res.status(401).json({ error: 'Authentication required' });

    const { error } = await supabaseAdmin
      .from('meetings')
      .delete()
      .eq('id', req.params.id)
      .eq('user_id', user.id);

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true });
  } catch {
    return res.status(500).json({ error: 'Failed to delete meeting' });
  }
});

export default router;
