import { supabase } from './supabase';
import type { User } from '@supabase/supabase-js';

export type AuthUser = Pick<User, 'id' | 'email' | 'user_metadata'>;

export interface AuthResult {
  user: AuthUser | null;
  error: string | null;
}

/** Sign up with email & password, then create profile row */
export async function signUpWithEmail(
  email: string,
  password: string,
  fullName: string
): Promise<AuthResult> {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
      emailRedirectTo: typeof window !== 'undefined' ? `${window.location.origin}` : undefined
    }
  });

  if (error) return { user: null, error: error.message };

  // Insert profile row (trigger also does this, belt-and-suspenders)
  if (data.user) {
    await supabase.from('profiles').upsert({
      id: data.user.id,
      email,
      full_name: fullName
    }).select();
  }

  return { user: data.user, error: null };
}

/** Sign in with email & password */
export async function signInWithEmail(
  email: string,
  password: string
): Promise<AuthResult> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { user: null, error: error.message };
  return { user: data.user, error: null };
}

/** Sign out */
export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}

/** Send password reset email */
export async function sendPasswordReset(email: string): Promise<{ error: string | null }> {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: typeof window !== 'undefined' ? `${window.location.origin}` : undefined
  });
  return { error: error?.message || null };
}

/** Get current session user */
export async function getSessionUser(): Promise<AuthUser | null> {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}
