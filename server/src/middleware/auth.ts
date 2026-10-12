import type { Request, Response, NextFunction } from 'express';
import { createReqSupabaseClient } from '../utils/supabase.js';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email?: string;
    user_metadata?: Record<string, unknown>;
  };
}

export async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const supabase = createReqSupabaseClient(req, res);
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
      return res.status(401).json({ error: 'Unauthorized: Session missing or invalid' });
    }

    req.user = user;
    next();
  } catch {
    return res.status(500).json({ error: 'Authentication verification failure' });
  }
}
