import { Router } from 'express';
import { createReqSupabaseClient, supabaseAdmin } from '../utils/supabase.js';
import type { Request, Response } from 'express';

const CLIENT_URL = process.env.CLIENT_URL || '';

/**
 * GET /auth/callback
 * Handles Supabase PKCE callback (for password-reset magic links, email confirmation, etc.)
 * Enterprise OAuth flows have been removed — authentication is handled entirely client-side
 * via Supabase JS SDK (email/password and optional Google social auth).
 */
router.get('/callback', async (req: Request, res: Response) => {
  const code = req.query.code as string;
  const next = (req.query.next as string) || '/';

  if (!code) {
    return res.redirect(`${CLIENT_URL}/?error=missing_code`);
  }

  try {
    const supabase = createReqSupabaseClient(req, res);
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      console.error('Code exchange failed:', error);
      return res.redirect(`${CLIENT_URL}/?error=auth_failed`);
    }

    return res.redirect(`${CLIENT_URL}${next}`);
  } catch (err) {
    console.error('Unexpected callback error:', err);
    return res.redirect(`${CLIENT_URL}/?error=server_error`);
  }
});

/**
 * GET /auth/session
 * Returns the current authenticated user profile from the session cookie.
 */
router.get('/session', async (req: Request, res: Response) => {
  try {
    const supabase = createReqSupabaseClient(req, res);
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
      return res.json({ authenticated: false, user: null });
    }

    return res.json({
      authenticated: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0],
        avatar_url: user.user_metadata?.avatar_url
      }
    });
  } catch {
    return res.status(500).json({ error: 'Failed to retrieve session' });
  }
});

/**
 * POST /auth/logout
 * Signs out the user and clears session cookies.
 */
router.post('/logout', async (req: Request, res: Response) => {
  try {
    const supabase = createReqSupabaseClient(req, res);
    await supabase.auth.signOut();
    return res.json({ success: true });
  } catch {
    return res.status(500).json({ error: 'Failed to log out' });
  }
});

/**
 * POST /auth/auto-confirm
 * Automatically confirms user's email via admin API to avoid email verification delays & localhost:3000 redirects
 */
router.post('/auto-confirm', async (req: Request, res: Response) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  try {
    const { data, error: listError } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 100 });
    if (listError) throw listError;

    const user = data.users.find((u) => u.email?.toLowerCase() === String(email).trim().toLowerCase());
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (!user.email_confirmed_at) {
      await supabaseAdmin.auth.admin.updateUserById(user.id, { email_confirm: true });
    }

    return res.json({ success: true, confirmed: true });
  } catch (err) {
    console.error('Auto-confirm error:', err);
    return res.status(500).json({ error: 'Failed to auto-confirm user' });
  }
});

export default router;
