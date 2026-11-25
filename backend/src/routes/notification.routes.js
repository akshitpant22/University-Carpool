import express from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { verifyAuth } from '../middleware/auth.js';

const router = express.Router();

// GET /api/v1/notifications?unread=true
router.get('/', verifyAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const unreadOnly = req.query.unread === 'true';

    let query = supabaseAdmin
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (unreadOnly) {
      query = query.eq('is_read', false);
    }

    const { data, error } = await query;

    if (error) throw error;

    return res.status(200).json({
      success: true,
      data: {
        notifications: data || []
      }
    });
  } catch (error) {
    console.error('[GET Notifications]', error);

    return res.status(500).json({
      success: false,
      error: {
        message: error.message || 'Failed to fetch notifications.'
      }
    });
  }
});

export default router;