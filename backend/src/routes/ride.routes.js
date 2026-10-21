import express from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { verifyAuth, requireVerified } from '../middleware/auth.js';
import { rankCandidateRides } from '../services/matching.service.js';

const router = express.Router();

// Fixed GEHU Dehradun Campus Coordinates (PostGIS: POINT(longitude latitude))
const GEHU_CAMPUS_LNG = 77.9944;
const GEHU_CAMPUS_LAT = 30.2704;
const GEHU_CAMPUS_ADDRESS = 'Graphic Era Hill University (GEHU Campus), Dehradun';

/**
 * POST /api/v1/rides
 * Driver posts an ad-hoc ride to campus
 */
router.post('/', verifyAuth, requireVerified, async (req, res) => {
  try {
    const {
      vehicle_id,
      origin_address_text,
      origin_lat,
      origin_lng,
      departure_time,
      available_seats,
      price_per_seat,
      gender_preference,
      dl_number
    } = req.body;

    // 1. Validate Driving License (conditionally required when offering a ride)
    let userDl = req.user.profile?.dl_number;
    if (!userDl && dl_number) {
      // Save provided DL to user profile
      await supabaseAdmin
        .from('users')
        .update({ dl_number: dl_number.trim(), updated_at: new Date().toISOString() })
        .eq('id', req.user.id);
      userDl = dl_number.trim();
    }

    if (!userDl) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'DL_REQUIRED',
          message: 'A valid driving license number is required before offering a ride as driver.'
        }
      });
    }

    // 2. Validate Vehicle Ownership & Capacity
    if (!vehicle_id) {
      return res.status(400).json({
        success: false,
        error: { code: 'VEHICLE_REQUIRED', message: 'Please select a registered vehicle for this ride.' }
      });
    }

    const { data: vehicle, error: vehicleErr } = await supabaseAdmin
      .from('vehicles')
      .select('*')
      .eq('id', vehicle_id)
      .eq('user_id', req.user.id)
      .single();

    if (vehicleErr || !vehicle) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_VEHICLE', message: 'Vehicle not found or does not belong to your account.' }
      });
    }

    // 3. Validate Seats
    const seatCount = parseInt(available_seats, 10);
    if (isNaN(seatCount) || seatCount < 1 || seatCount > vehicle.seat_capacity) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_SEATS',
          message: `Available seats must be between 1 and vehicle capacity (${vehicle.seat_capacity}).`
        }
      });
    }

    // 4. Validate Departure Time (Must be in the future)
    if (!departure_time) {
      return res.status(400).json({
        success: false,
        error: { code: 'TIME_REQUIRED', message: 'Departure time is required.' }
      });
    }

    const depDate = new Date(departure_time);
    if (isNaN(depDate.getTime()) || depDate <= new Date(Date.now() + 2 * 60 * 1000)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_DEPARTURE_TIME', message: 'Departure time must be at least 2 minutes in the future.' }
      });
    }

    // 5. Commute Direction & Coordinates (Anchor to GEHU Campus)
    const isFromCampus = req.body.commute_direction === 'from_campus';
    const lng = origin_lng !== undefined ? parseFloat(origin_lng) : GEHU_CAMPUS_LNG;
    const lat = origin_lat !== undefined ? parseFloat(origin_lat) : GEHU_CAMPUS_LAT;

    let originPointWKT;
    let destPointWKT;
    let formattedOriginText;

    if (isFromCampus) {
      // Return commute: Driver starts at GEHU Campus and drops peers off on way to destination
      originPointWKT = `POINT(${GEHU_CAMPUS_LNG} ${GEHU_CAMPUS_LAT})`;
      destPointWKT = `POINT(${lng} ${lat})`;
      formattedOriginText = `GEHU Campus → ${origin_address_text.trim()}`;
    } else {
      // Morning / Exam commute: Driver starts at home landmark and heads towards GEHU Campus
      originPointWKT = `POINT(${lng} ${lat})`;
      destPointWKT = `POINT(${GEHU_CAMPUS_LNG} ${GEHU_CAMPUS_LAT})`;
      formattedOriginText = origin_address_text.trim();
    }

    // 6. Price & Gender Preference
    const parsedPrice = price_per_seat !== undefined && price_per_seat !== null && price_per_seat !== ''
      ? Math.max(0, parseFloat(price_per_seat))
      : null;

    const parsedGenderPref = gender_preference === 'same_gender_only'
      ? 'same_gender_only'
      : 'no_preference';

    // 7. Insert Ride
    const { data: newRide, error: insertErr } = await supabaseAdmin
      .from('rides')
      .insert({
        driver_id: req.user.id,
        vehicle_id: vehicle.id,
        university_id: req.user.profile?.university_id || 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
        origin_point: originPointWKT,
        origin_address_text: formattedOriginText,
        destination_point: destPointWKT,
        departure_time: depDate.toISOString(),
        available_seats: seatCount,
        price_per_seat: parsedPrice,
        gender_preference: parsedGenderPref,
        status: 'posted'
      })
      .select('*, vehicles (*)')

      .single();

    if (insertErr) {
      console.error('[POST /rides] Database error:', insertErr);
      return res.status(500).json({
        success: false,
        error: { code: 'INSERT_FAILED', message: insertErr.message }
      });
    }

    return res.status(201).json({
      success: true,
      data: {
        ride: newRide,
        message: 'Ride offered successfully! Riders travelling towards campus can now discover your ride.'
      }
    });
  } catch (err) {
    console.error('[POST /rides] Unexpected error:', err);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to post ride.' }
    });
  }
});

/**
 * GET /api/v1/rides/mine
 * Driver's view of rides they have offered (active & past)
 */
router.get('/mine', verifyAuth, async (req, res) => {
  try {
    const { data: rides, error } = await supabaseAdmin
      .from('rides')
      .select(`
        *,
        vehicles ( id, vehicle_type, vehicle_number, seat_capacity ),
        ride_requests ( id, status, rider_id )
      `)
      .eq('driver_id', req.user.id)
      .order('departure_time', { ascending: false });

    if (error) {
      return res.status(400).json({
        success: false,
        error: { code: 'FETCH_FAILED', message: error.message }
      });
    }

    return res.status(200).json({
      success: true,
      data: { rides: rides || [] }
    });
  } catch (err) {
    console.error('[GET /rides/mine] Error:', err);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to retrieve your rides.' }
    });
  }
});

/**
 * GET /api/v1/rides/search
 * Milestone 3: Rider Search & Detour Matching Engine
 * Runs: PostGIS detour proximity -> Mutual gender filter -> ML address similarity -> 50/50 fusion ranking
 */
router.get('/search', verifyAuth, async (req, res) => {
  try {
    const {
      pickup_lat,
      pickup_lng,
      pickup_address_text,
      departure_time,
      time_window_minutes = 180,
      max_detour_meters = 1500,
      gender_preference = 'no_preference',
      rider_gender,
      commute_direction = 'all',
      flexible_time = 'false',
      exclude_own = 'false'
    } = req.query;

    // Time window calculation:
    // If departure_time provided and not in flexible mode, check within window (+- 12 hours)
    // Otherwise, check all active upcoming rides from current time onwards
    let depWindowStart;
    let depWindowEnd;

    const isFlexible = flexible_time === 'true' || !departure_time;

    if (!isFlexible && departure_time) {
      const targetTime = new Date(departure_time);
      if (!isNaN(targetTime.getTime())) {
        // Broaden search to +- 12 hours of the selected departure day
        depWindowStart = new Date(targetTime.getTime() - 12 * 60 * 60 * 1000).toISOString();
        depWindowEnd = new Date(targetTime.getTime() + 12 * 60 * 60 * 1000).toISOString();
      }
    }

    if (!depWindowStart) {
      // Default: all active upcoming rides (from 30 mins ago up to 72 hours ahead)
      depWindowStart = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      depWindowEnd = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
    }

    // Step 1: Base database query for active rides
    let query = supabaseAdmin
      .from('rides')
      .select(`
        *,
        vehicles ( id, vehicle_type, vehicle_number, seat_capacity ),
        users!rides_driver_id_fkey ( id, name, branch, course, profile_photo_url, composite_rating, completed_rides_count )
      `)
      .eq('status', 'posted')
      .is('deleted_at', null)
      .gt('available_seats', 0)
      .gte('departure_time', depWindowStart)
      .lte('departure_time', depWindowEnd);

    // Only exclude rider's own rides if explicitly requested (in testing/driver view, we tag is_own_ride)
    if (exclude_own === 'true' && req.user?.id) {
      query = query.neq('driver_id', req.user.id);
    }

    let { data: rawRides, error: fetchErr } = await query;

    // Fallback: If no rides match the strict time window, expand to all upcoming rides
    if ((!rawRides || rawRides.length === 0) && !isFlexible) {
      const fallbackQuery = await supabaseAdmin
        .from('rides')
        .select(`
          *,
          vehicles ( id, vehicle_type, vehicle_number, seat_capacity ),
          users!rides_driver_id_fkey ( id, name, branch, course, profile_photo_url, composite_rating, completed_rides_count )
        `)
        .eq('status', 'posted')
        .is('deleted_at', null)
        .gt('available_seats', 0)
        .gte('departure_time', new Date(Date.now() - 30 * 60 * 1000).toISOString())
        .order('departure_time', { ascending: true });

      if (fallbackQuery.data && fallbackQuery.data.length > 0) {
        rawRides = fallbackQuery.data;
      }
    }

    if (fetchErr && (!rawRides || rawRides.length === 0)) {
      console.error('[GET /rides/search] DB query error:', fetchErr);
      return res.status(500).json({
        success: false,
        error: { code: 'SEARCH_FAILED', message: fetchErr.message }
      });
    }

    // Enrich driver gender so mutual gender compatibility filter accurately matches same_gender_only rides
    const safeRawRides = await Promise.all((rawRides || []).map(async (r) => {
      let driverGender = r.users?.gender || r.driver_gender;
      if (!driverGender) {
        if (req.user?.id && r.driver_id === req.user.id) {
          driverGender = req.user?.profile?.gender || req.user?.user_metadata?.gender || 'male';
        } else {
          try {
            const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(r.driver_id);
            driverGender = authUser?.user?.user_metadata?.gender || 'male';
          } catch {
            driverGender = 'male';
          }
        }
      }
      return {
        ...r,
        driver_gender: driverGender,
        users: {
          ...(r.users || {}),
          gender: driverGender
        }
      };
    }));

    // Step 2 & 3: Run through Matching Engine (Route Corridor Detour, Gender, ML similarity, 50/50 Fusion)
    const { rankedRides, excludedByGenderCount } = await rankCandidateRides(safeRawRides, {
      pickup_lat,
      pickup_lng,
      pickup_address_text: pickup_address_text || '',
      max_detour_meters: parseFloat(max_detour_meters) || 1500,
      gender_preference,
      rider_gender: rider_gender || req.user?.profile?.gender || req.user?.user_metadata?.gender || 'male',
      commute_direction,
      current_user_id: req.user?.id || null
    });

    return res.status(200).json({
      success: true,
      data: {
        results: rankedRides,
        total_matches: rankedRides.length,
        excluded_by_gender_count: excludedByGenderCount,
        query: {
          pickup_address_text: pickup_address_text || '',
          pickup_lat: pickup_lat ? parseFloat(pickup_lat) : null,
          pickup_lng: pickup_lng ? parseFloat(pickup_lng) : null,
          max_detour_meters: parseFloat(max_detour_meters) || 1500,
          gender_preference,
          commute_direction
        }
      }
    });
  } catch (err) {
    console.error('[GET /rides/search] Unexpected error:', err);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to execute ride search.' }
    });
  }
});


/**
 * GET /api/v1/rides/:id
 * Retrieve details of a specific ride
 */
router.get('/:id', verifyAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const { data: ride, error } = await supabaseAdmin
      .from('rides')
      .select(`
        *,
        vehicles ( id, vehicle_type, vehicle_number, seat_capacity ),
        users!rides_driver_id_fkey ( id, name, branch, course, profile_photo_url, composite_rating, completed_rides_count )
      `)
      .eq('id', id)
      .is('deleted_at', null)
      .single();

    if (error || !ride) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Ride not found.' }
      });
    }

    return res.status(200).json({
      success: true,
      data: { ride }
    });
  } catch (err) {
    console.error('[GET /rides/:id] Error:', err);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to fetch ride details.' }
    });
  }
});

/**
 * PATCH /api/v1/rides/:id/cancel
 * Driver cancels an ad-hoc posted ride
 */
router.patch('/:id/cancel', verifyAuth, async (req, res) => {
  try {
    const { id } = req.params;

    // Check ride ownership
    const { data: ride, error: fetchErr } = await supabaseAdmin
      .from('rides')
      .select('*')
      .eq('id', id)
      .eq('driver_id', req.user.id)
      .single();

    if (fetchErr || !ride) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Ride not found or unauthorized.' }
      });
    }

    if (ride.status === 'completed' || ride.status === 'cancelled') {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_STATUS', message: `Cannot cancel a ride that is already ${ride.status}.` }
      });
    }

    // Update ride to cancelled and soft delete
    const { data: updatedRide, error: updateErr } = await supabaseAdmin
      .from('rides')
      .update({
        status: 'cancelled',
        deleted_at: new Date().toISOString()
      })
      .eq('id', id)
      .select('*')
      .single();

    if (updateErr) {
      return res.status(500).json({
        success: false,
        error: { code: 'UPDATE_FAILED', message: updateErr.message }
      });
    }

    // Auto-cancel any active/pending requests
    await supabaseAdmin
      .from('ride_requests')
      .update({
        status: 'cancelled_by_driver',
        responded_at: new Date().toISOString()
      })
      .eq('ride_id', id)
      .in('status', ['pending', 'accepted']);

    return res.status(200).json({
      success: true,
      data: {
        ride: updatedRide,
        message: 'Ride cancelled successfully.'
      }
    });
  } catch (err) {
    console.error('[PATCH /rides/:id/cancel] Error:', err);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to cancel ride.' }
    });
  }
});

export default router;
