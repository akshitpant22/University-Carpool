import express from 'express';
import { supabaseAdmin } from '../config/supabase.js';

const router = express.Router();

/**
 * POST /api/v1/auth/signup
 * Institutional email domain validation -> Supabase Auth -> PostgreSQL users record
 */
router.post('/signup', async (req, res) => {
  try {
    const {
      email,
      password,
      name,
      student_id_number,
      branch,
      course,
      year,
      semester,
      phone_number,
      parent_contact_number,
      upi_id
    } = req.body;

    if (!email || !password || !name || !student_id_number) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Name, email, password, and Student ID are required.' }
      });
    }

    // 1. Validate institutional email domain (e.g., gehu.ac.in)
    const emailParts = email.toLowerCase().trim().split('@');
    if (emailParts.length !== 2) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_EMAIL', message: 'Invalid email address format.' }
      });
    }
    const domain = emailParts[1];

    // Check against universities table in Supabase
    let { data: university, error: uniError } = await supabaseAdmin
      .from('universities')
      .select('id, name, email_domain')
      .eq('email_domain', domain)
      .single();

    // If query failed due to fetch error / bad env configuration
    if (uniError && uniError.message?.includes('fetch failed')) {
      return res.status(500).json({
        success: false,
        error: {
          code: 'DB_CONNECTION_ERROR',
          message: 'Backend cannot connect to Supabase. Please ensure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in backend/.env are filled and saved.'
        }
      });
    }

    // Auto-seed GEHU if it's gehu.ac.in and seed was not run yet
    if (!university && domain === 'gehu.ac.in') {
      const { data: seededUni, error: seedError } = await supabaseAdmin
        .from('universities')
        .insert({
          id: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
          name: 'Graphic Era Hill University, Dehradun',
          email_domain: 'gehu.ac.in'
        })
        .select('*')
        .single();

      if (seededUni) {
        university = seededUni;
      } else if (seedError) {
        console.warn('[Signup] Auto-seed error:', seedError);
      }
    }

    if (!university) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED_DOMAIN',
          message: `Registration is restricted to verified university domains (e.g. @gehu.ac.in). Domain '@${domain}' is not registered.`
        }
      });
    }

    // 2. Create user in Supabase Auth via Admin API
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: email.toLowerCase().trim(),
      password,
      email_confirm: true, // auto-confirm for university pilot
      user_metadata: { name, student_id_number }
    });

    if (authError) {
      return res.status(400).json({
        success: false,
        error: { code: 'AUTH_ERROR', message: authError.message }
      });
    }

    const userId = authData.user.id;

    // 3. Insert profile into PostgreSQL users table
    const { data: newUser, error: profileError } = await supabaseAdmin
      .from('users')
      .insert({
        id: userId,
        university_id: university.id,
        name: name.trim(),
        email: email.toLowerCase().trim(),
        student_id_number: student_id_number.trim(),
        branch: branch || null,
        course: course || null,
        year: year ? parseInt(year, 10) : null,
        semester: semester ? parseInt(semester, 10) : null,
        phone_number: phone_number || null,
        parent_contact_number: parent_contact_number || null,
        upi_id: upi_id || null,
        role: 'student',
        verification_status: 'pending'
      })
      .select('*')
      .single();

    if (profileError) {
      console.error('[Signup] Error inserting user profile:', profileError);
      await supabaseAdmin.auth.admin.deleteUser(userId);
      return res.status(500).json({
        success: false,
        error: { code: 'DB_ERROR', message: 'Failed to create student profile record: ' + profileError.message }
      });
    }

    return res.status(201).json({
      success: true,
      data: {
        user: newUser,
        university: { id: university.id, name: university.name },
        message: 'Account created successfully. Please upload your student ID card for verification.'
      }
    });
  } catch (err) {
    console.error('[Signup] Unexpected error:', err);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: err.message || 'Internal server error during registration.' }
    });
  }
});

/**
 * POST /api/v1/auth/login
 * Standard credential authentication wrapper
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_CREDENTIALS', message: 'Email and password are required.' }
      });
    }

    const { data, error } = await supabaseAdmin.auth.signInWithPassword({
      email: email.toLowerCase().trim(),
      password
    });

    if (error) {
      return res.status(401).json({
        success: false,
        error: { code: 'AUTH_FAILED', message: error.message }
      });
    }

    const { data: profile } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('id', data.user.id)
      .single();

    return res.status(200).json({
      success: true,
      data: {
        session: {
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
          expires_in: data.session.expires_in
        },
        user: profile || data.user
      }
    });
  } catch (err) {
    console.error('[Login] Error:', err);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Authentication service unavailable.' }
    });
  }
});

export default router;
