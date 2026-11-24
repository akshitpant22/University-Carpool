
import express from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { verifyAuth, requireVerified } from '../middleware/auth.js';

const router = express.Router();

// GET /api/v1/requests/incoming
// Fetch pending requests for rides posted by the logged-in driver.
router.get('/incoming', verifyAuth, async (req, res) => {
  try {
    const driverId = req.user.id;

    // 1. Find rides posted by this driver.
    const { data: rides, error: ridesError } = await supabaseAdmin
      .from('rides')
      .select('id, origin_address_text, departure_time, available_seats, price_per_seat, status')
      .eq('driver_id', driverId)
      .is('deleted_at', null);

    if (ridesError) throw ridesError;

    if (!rides || rides.length === 0) {
      return res.status(200).json({
        success: true,
        data: { requests: [] }
      });
    }

    const rideIds = rides.map(ride => ride.id);

    // 2. Find pending requests for those rides.
    const { data: requests, error: requestsError } = await supabaseAdmin
      .from('ride_requests')
      .select('*')
      .in('ride_id', rideIds)
      .eq('status', 'pending')
      .is('deleted_at', null)
      .order('requested_at', { ascending: false });

    if (requestsError) throw requestsError;

    if (!requests || requests.length === 0) {
      return res.status(200).json({
        success: true,
        data: { requests: [] }
      });
    }

    // 3. Fetch rider profiles.
    const riderIds = [...new Set(requests.map(request => request.rider_id))];

    const { data: riders, error: ridersError } = await supabaseAdmin
      .from('users')
      .select('id, name, email, branch, course, year, profile_photo_url')
      .in('id', riderIds);

    if (ridersError) throw ridersError;

    // 4. Combine request, ride and rider details.
    const enrichedRequests = requests.map(request => ({
      ...request,
      ride: rides.find(ride => ride.id === request.ride_id),
      rider: riders.find(rider => rider.id === request.rider_id) || null
    }));

    return res.status(200).json({
      success: true,
      data: { requests: enrichedRequests }
    });

  } catch (error) {
    console.error('[GET Incoming Requests]', error);

    return res.status(500).json({
      success: false,
      error: {
        message: error.message || 'Failed to fetch incoming requests.'
      }
    });
  }
});

// POST /api/v1/requests
// Create a ride request and notify the driver.
router.post('/', verifyAuth, requireVerified, async (req, res) => {
  try {
    const riderId = req.user.id;
    const { ride_id } = req.body;

    if (!ride_id) {
      return res.status(400).json({
        success: false,
        error: { message: 'ride_id is required.' }
      });
    }

    // 1. Fetch the ride.
    const { data: ride, error: rideError } = await supabaseAdmin
      .from('rides')
      .select('id, driver_id, status, departure_time, available_seats')
      .eq('id', ride_id)
      .is('deleted_at', null)
      .maybeSingle();

    if (rideError) throw rideError;

    if (!ride) {
      return res.status(404).json({
        success: false,
        error: { message: 'Ride not found.' }
      });
    }

    // 2. Check whether the ride can receive requests.
    if (ride.status !== 'posted') {
      return res.status(400).json({
        success: false,
        error: { message: 'This ride is no longer accepting requests.' }
      });
    }

    if (new Date(ride.departure_time) <= new Date()) {
      return res.status(400).json({
        success: false,
        error: { message: 'This ride has already reached its departure time.' }
      });
    }

    if (ride.available_seats <= 0) {
      return res.status(400).json({
        success: false,
        error: { message: 'No seats are available for this ride.' }
      });
    }

    if (ride.driver_id === riderId) {
      return res.status(400).json({
        success: false,
        error: { message: 'You cannot request your own ride.' }
      });
    }

    // 3. Create the request through the database RPC.
    // The RPC enforces the maximum of 5 active requests per rider.
    const { data: newRequest, error: insertError } =
      await supabaseAdmin.rpc('create_ride_request', {
        p_ride_id: ride_id,
        p_rider_id: riderId
      });

    if (insertError) {
      if (insertError.code === '23505') {
        return res.status(409).json({
          success: false,
          error: { message: 'An active request for this ride already exists.' }
        });
      }

      if (insertError.message?.includes('MAX_ACTIVE_REQUESTS_REACHED')) {
        return res.status(409).json({
          success: false,
          error: { message: 'You can have a maximum of 5 active ride requests at a time.' }
        });
      }

      if (insertError.message?.includes('RIDE_NOT_FOUND')) {
        return res.status(404).json({
          success: false,
          error: { message: 'Ride not found.' }
        });
      }

      if (insertError.message?.includes('RIDE_NOT_AVAILABLE')) {
        return res.status(400).json({
          success: false,
          error: { message: 'This ride is no longer available for requests.' }
        });
      }

      throw insertError;
    }

    const createdRequest = Array.isArray(newRequest)
      ? newRequest[0]
      : newRequest;

    // 5. Get the rider's name.
    const { data: riderProfile, error: profileError } =
      await supabaseAdmin
        .from('users')
        .select('name')
        .eq('id', riderId)
        .maybeSingle();

    if (profileError) {
      // Remove the request if notification preparation fails.
      await supabaseAdmin
        .from('ride_requests')
        .delete()
        .eq('id', createdRequest.id);

      throw profileError;
    }

    const riderName = riderProfile?.name || 'A student';

    // 6. Create a notification for the driver.
    const { error: notificationError } = await supabaseAdmin
      .from('notifications')
      .insert({
        user_id: ride.driver_id,
        type: 'general',
        title: 'New ride request',
        body: `${riderName} has requested a seat in your ride.`,
        related_ride_id: ride_id,
        is_read: false
      });

    if (notificationError) {
      // Avoid leaving a request without its corresponding notification.
      await supabaseAdmin
        .from('ride_requests')
        .delete()
        .eq('id', createdRequest.id);

      throw notificationError;
    }

    // 7. Return success.
    return res.status(201).json({
      success: true,
      message: 'Ride request submitted successfully.',
      data: createdRequest
    });

  } catch (error) {
    console.error('[Create Ride Request]', error);

    return res.status(500).json({
      success: false,
      error: {
        message: error.message || 'Failed to create ride request.'
      }
    });
  }
});

// PATCH /api/v1/requests/:id/respond
// Allow the ride's driver to accept or decline a pending request.
router.patch('/:id/respond', verifyAuth, async (req, res) => {
  try {
    const driverId = req.user.id;
    const requestId = req.params.id;
    const { decision } = req.body;

    if (!['accepted', 'declined'].includes(decision)) {
      return res.status(400).json({
        success: false,
        error: {
          message: "Invalid decision. Use 'accepted' or 'declined'."
        }
      });
    }

    const { data, error } = await supabaseAdmin.rpc(
      'respond_to_ride_request',
      {
        p_request_id: requestId,
        p_driver_id: driverId,
        p_decision: decision
      }
    );

    if (error) {
      console.error('[Respond to Ride Request]', error);

      const message = error.message || 'Failed to respond to request.';

      const statusCode =
        message.includes('not found') ? 404 :
        message.includes('not authorized') ? 403 :
        message.includes('already been responded') ? 409 :
        message.includes('No seats') ||
        message.includes('no longer available') ? 400 :
        500;

      return res.status(statusCode).json({
        success: false,
        error: { message }
      });
    }

    return res.status(200).json({
      success: true,
      message: `Ride request ${decision} successfully.`,
      data
    });

  } catch (error) {
    console.error('[Respond to Ride Request]', error);

    return res.status(500).json({
      success: false,
      error: {
        message: error.message || 'Failed to respond to request.'
      }
    });
  }
});

export default router;
