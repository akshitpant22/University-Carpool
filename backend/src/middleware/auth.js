import { supabaseAdmin } from '../config/supabase.js';

/**
 * Middleware: verifyAuth
 * Extracts Bearer JWT, validates with Supabase Auth,
 * and attaches database profile to req.user.
 */
export async function verifyAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Missing or malformed Authorization header.' }
      });
    }

    const token = authHeader.split(' ')[1];

    // Verify token with Supabase Auth
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({
        success: false,
        error: { code: 'INVALID_TOKEN', message: authError?.message || 'Invalid or expired token.' }
      });
    }

    // Fetch user profile from PostgreSQL users table
    const { data: profile, error: dbError } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('id', user.id)
      .is('deleted_at', null)
      .single();

    if (dbError && dbError.code !== 'PGRST116') { // PGRST116 = no rows returned
      console.error('[verifyAuth] Database error fetching user profile:', dbError);
    }

    // Attach to request with gender from metadata if not present in profile table
    const gender = profile?.gender || user.user_metadata?.gender || 'male';
    req.user = {
      id: user.id,
      email: user.email,
      user_metadata: user.user_metadata || {},
      gender: gender,
      profile: profile ? { ...profile, gender } : { gender },
      role: profile?.role || 'student',
      verification_status: profile?.verification_status || 'pending'
    };

    next();
  } catch (err) {
    console.error('[verifyAuth] Unexpected error:', err);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to authenticate user.' }
    });
  }
}

/**
 * Middleware: requireVerified
 * Fast-fail check ensuring user is approved before posting/requesting rides
 */
export function requireVerified(req, res, next) {
  if (req.user?.verification_status !== 'verified') {
    return res.status(403).json({
      success: false,
      error: {
        code: 'VERIFICATION_REQUIRED',
        message: 'Your university ID is currently under verification. Read-only access.'
      }
    });
  }
  next();
}

/**
 * Middleware: requireAdmin
 * Role-gated check for administrative endpoints
 */
export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Admin privileges required.' }
    });
  }
  next();
}
