import express from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { verifyAuth } from '../middleware/auth.js';

const router = express.Router();

/**
 * GET /api/v1/users/me
 * Returns full authenticated user profile
 */
router.get('/me', verifyAuth, async (req, res) => {
  try {
    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select(`
        id,
        university_id,
        name,
        email,
        phone_number,
        parent_contact_number,
        student_id_number,
        branch,
        course,
        year,
        semester,
        role,
        verification_status,
        id_card_image_url,
        profile_photo_url,
        upi_id,
        dl_number,
        dl_verified,
        composite_rating,
        completed_rides_count,
        no_show_count,
        late_cancellation_count,
        created_at,
        universities ( id, name, email_domain )
      `)
      .eq('id', req.user.id)
      .is('deleted_at', null)
      .single();

    if (error || !user) {
      return res.status(404).json({
        success: false,
        error: { code: 'USER_NOT_FOUND', message: 'User profile not found.' }
      });
    }

    return res.status(200).json({
      success: true,
      data: { user }
    });
  } catch (err) {
    console.error('[GET /users/me] Error:', err);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to retrieve profile.' }
    });
  }
});

/**
 * PATCH /api/v1/users/me
 * Update editable profile details
 */
router.patch('/me', verifyAuth, async (req, res) => {
  try {
    const {
      phone_number,
      parent_contact_number,
      upi_id,
      dl_number,
      branch,
      course,
      year,
      semester
    } = req.body;

    const updates = {
      updated_at: new Date().toISOString()
    };

    if (phone_number !== undefined) updates.phone_number = phone_number;
    if (parent_contact_number !== undefined) updates.parent_contact_number = parent_contact_number;
    if (upi_id !== undefined) updates.upi_id = upi_id;
    if (dl_number !== undefined) updates.dl_number = dl_number;
    if (branch !== undefined) updates.branch = branch;
    if (course !== undefined) updates.course = course;
    if (year !== undefined) updates.year = parseInt(year, 10);
    if (semester !== undefined) updates.semester = parseInt(semester, 10);

    const { data: updatedUser, error } = await supabaseAdmin
      .from('users')
      .update(updates)
      .eq('id', req.user.id)
      .select('*')
      .single();

    if (error) {
      return res.status(400).json({
        success: false,
        error: { code: 'UPDATE_FAILED', message: error.message }
      });
    }

    return res.status(200).json({
      success: true,
      data: { user: updatedUser }
    });
  } catch (err) {
    console.error('[PATCH /users/me] Error:', err);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to update profile.' }
    });
  }
});

/**
 * POST /api/v1/users/me/id-card
 * Saves storage path of uploaded ID card image
 */
router.post('/me/id-card', verifyAuth, async (req, res) => {
  try {
    let { storage_path, file_base64, file_ext } = req.body;

    if (!storage_path && !file_base64) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_DATA', message: 'Either storage_path or file_base64 is required.' }
      });
    }

    // If base64 file data is passed, upload using supabaseAdmin (bypasses RLS)
    if (file_base64) {
      const ext = file_ext || 'jpg';
      const fileName = `${req.user.id}/student_id_${Date.now()}.${ext}`;
      const buffer = Buffer.from(file_base64.replace(/^data:image\/\w+;base64,/, ''), 'base64');

      // Try 'id_cards' first, then 'id-cards'
      let uploadResult = await supabaseAdmin.storage
        .from('id_cards')
        .upload(fileName, buffer, { contentType: `image/${ext}`, upsert: true });

      if (uploadResult.error) {
        uploadResult = await supabaseAdmin.storage
          .from('id-cards')
          .upload(fileName, buffer, { contentType: `image/${ext}`, upsert: true });
      }

      if (uploadResult.error) {
        console.error('[POST /users/me/id-card] Storage upload error:', uploadResult.error);
        return res.status(500).json({
          success: false,
          error: { code: 'UPLOAD_FAILED', message: uploadResult.error.message }
        });
      }

      storage_path = fileName;
    }

    const { data: updatedUser, error } = await supabaseAdmin
      .from('users')
      .update({
        id_card_image_url: storage_path,
        verification_status: 'pending',
        updated_at: new Date().toISOString()
      })
      .eq('id', req.user.id)
      .select('id, name, verification_status, id_card_image_url')
      .single();

    if (error) {
      return res.status(400).json({
        success: false,
        error: { code: 'UPDATE_FAILED', message: error.message }
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        user: updatedUser,
        message: 'Student ID card submitted for administrative verification.'
      }
    });
  } catch (err) {
    console.error('[POST /users/me/id-card] Error:', err);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to save ID card reference.' }
    });
  }
});

/**
 * GET /api/v1/users/:id/public
 * Public-safe profile view (intentionally excludes phone, parent contact, ID card)
 */
router.get('/:id/public', verifyAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const { data: publicProfile, error } = await supabaseAdmin
      .from('users')
      .select('id, name, profile_photo_url, branch, course, composite_rating, completed_rides_count')
      .eq('id', id)
      .is('deleted_at', null)
      .single();

    if (error || !publicProfile) {
      return res.status(404).json({
        success: false,
        error: { code: 'USER_NOT_FOUND', message: 'Profile not found.' }
      });
    }

    return res.status(200).json({
      success: true,
      data: { user: publicProfile }
    });
  } catch (err) {
    console.error('[GET /users/:id/public] Error:', err);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to fetch public profile.' }
    });
  }
});

export default router;
