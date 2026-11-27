
import express from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { verifyAuth, requireVerified } from '../middleware/auth.js';
import { createAndEmitNotification } from '../services/notification.service.js';
import { getIO } from '../config/socket.js';

const router = express.Router();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NO_SHOW_PENALTY = 0.5; // rating points per no-show (floor of 1.0 is enforced in SQL)
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
      .select('id, name, email, branch, course, year, profile_photo_url, composite_rating, no_show_count')
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

// GET /api/v1/requests/mine
// Rider's own requests, enriched with ride + driver info (used to open chat).
router.get('/mine', verifyAuth, async (req, res) => {
  try {
    const riderId = req.user.id;

    const { data: requests, error: reqError } = await supabaseAdmin
      .from('ride_requests')
      .select('id, ride_id, status, requested_at, arrived_at')
      .eq('rider_id', riderId)
      .is('deleted_at', null)
      .order('requested_at', { ascending: false })
      .limit(50);

    if (reqError) throw reqError;

    if (!requests || requests.length === 0) {
      return res.status(200).json({ success: true, data: { requests: [] } });
    }

    const rideIds = [...new Set(requests.map(r => r.ride_id))];
    const { data: rides, error: ridesError } = await supabaseAdmin
      .from('rides')
      .select('id, driver_id, origin_address_text, departure_time, price_per_seat, status')
      .in('id', rideIds);

    if (ridesError) throw ridesError;

    const driverIds = [...new Set((rides || []).map(r => r.driver_id))];
    const { data: drivers, error: driversError } = await supabaseAdmin
      .from('users')
      .select('id, name')
      .in('id', driverIds);

    if (driversError) throw driversError;

    const enriched = requests.map(request => {
      const ride = (rides || []).find(r => r.id === request.ride_id) || null;
      const driver = ride ? (drivers || []).find(d => d.id === ride.driver_id) || null : null;
      return { ...request, ride, driver };
    });

    return res.status(200).json({ success: true, data: { requests: enriched } });
  } catch (error) {
    console.error('[GET My Requests]', error);
    return res.status(500).json({
      success: false,
      error: { message: error.message || 'Failed to fetch your requests.' }
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

    // 6. Create a notification for the driver changed to
    // 6. Save the notification, then emit it to the driver's socket room.
    try {
      await createAndEmitNotification({
        userId: ride.driver_id,
        type: 'general',
        title: 'New ride request',
        body: `${riderName} has requested a seat in your ride.`,
        relatedRideId: ride_id
      });
    } catch (notificationError) {
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

// GET /api/v1/requests/pickups?ride_id=<uuid>
// Driver's pickup list for a ride: accepted riders and already-flagged no-shows.
router.get('/pickups', verifyAuth, async (req, res) => {
  try {
    const driverId = req.user.id;
    const rideId = req.query.ride_id;

    if (typeof rideId !== 'string' || !UUID_RE.test(rideId)) {
      return res.status(400).json({
        success: false,
        error: { message: 'A valid ride_id is required.' }
      });
    }

    const { data: ride, error: rideError } = await supabaseAdmin
      .from('rides')
      .select('id, driver_id, status, origin_address_text')
      .eq('id', rideId)
      .is('deleted_at', null)
      .maybeSingle();

    if (rideError) throw rideError;

    if (!ride) {
      return res.status(404).json({ success: false, error: { message: 'Ride not found.' } });
    }

    if (ride.driver_id !== driverId) {
      return res.status(403).json({ success: false, error: { message: 'Only the driver can view pickups.' } });
    }

    const { data: requests, error: requestsError } = await supabaseAdmin
      .from('ride_requests')
      .select('id, rider_id, status, arrived_at, requested_at')
      .eq('ride_id', rideId)
      .in('status', ['accepted', 'no_show'])
      .is('deleted_at', null)
      .order('requested_at', { ascending: true });

    if (requestsError) throw requestsError;

    const list = requests || [];
    let nameMap = {};

    if (list.length > 0) {
      const { data: riders, error: ridersError } = await supabaseAdmin
        .from('users')
        .select('id, name')
        .in('id', [...new Set(list.map((r) => r.rider_id))]);

      if (ridersError) throw ridersError;
      nameMap = Object.fromEntries((riders || []).map((u) => [u.id, u.name]));
    }

    return res.status(200).json({
      success: true,
      data: {
        ride: {
          id: ride.id,
          status: ride.status,
          origin_address_text: ride.origin_address_text
        },
        pickups: list.map((rq) => ({
          request_id: rq.id,
          rider_id: rq.rider_id,
          name: nameMap[rq.rider_id] || 'Student',
          status: rq.status,
          arrived_at: rq.arrived_at
        })),
        // lets the client correct for a wrong phone clock when showing "waited N min"
        server_time: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('[GET Pickups]', error);
    return res.status(500).json({
      success: false,
      error: { message: error.message || 'Failed to load pickups.' }
    });
  }
});

// PATCH /api/v1/requests/:id/arrived
// Driver reports arriving at this rider's pickup point. Idempotent.
router.patch('/:id/arrived', verifyAuth, async (req, res) => {
  try {
    const driverId = req.user.id;
    const requestId = req.params.id;

    if (!UUID_RE.test(requestId)) {
      return res.status(400).json({ success: false, error: { message: 'Invalid request id.' } });
    }

    const { data: request, error: requestError } = await supabaseAdmin
      .from('ride_requests')
      .select('id, ride_id, rider_id, status, arrived_at')
      .eq('id', requestId)
      .is('deleted_at', null)
      .maybeSingle();

    if (requestError) throw requestError;

    if (!request) {
      return res.status(404).json({ success: false, error: { message: 'Request not found.' } });
    }

    const { data: ride, error: rideError } = await supabaseAdmin
      .from('rides')
      .select('id, driver_id, status')
      .eq('id', request.ride_id)
      .is('deleted_at', null)
      .maybeSingle();

    if (rideError) throw rideError;

    if (!ride) {
      return res.status(404).json({ success: false, error: { message: 'Ride not found.' } });
    }

    if (ride.driver_id !== driverId) {
      return res.status(403).json({
        success: false,
        error: { code: 'NOT_RIDE_DRIVER', message: 'Only the driver of this ride can mark arrival.' }
      });
    }

    if (ride.status !== 'departed') {
      return res.status(400).json({
        success: false,
        error: { code: 'RIDE_NOT_DEPARTED', message: 'Start the ride before marking arrival.' }
      });
    }

    if (request.status !== 'accepted') {
      return res.status(409).json({
        success: false,
        error: { code: 'REQUEST_NOT_ACCEPTED', message: 'This rider is not an accepted passenger.' }
      });
    }

    // Already marked: succeed without resetting the wait timer or re-notifying
    if (request.arrived_at) {
      return res.status(200).json({
        success: true,
        data: { request_id: request.id, arrived_at: request.arrived_at, already_marked: true }
      });
    }

    const { data: updated, error: updateError } = await supabaseAdmin
      .from('ride_requests')
      .update({ arrived_at: new Date().toISOString() })
      .eq('id', requestId)
      .eq('status', 'accepted')
      .is('arrived_at', null)
      .select('id, arrived_at')
      .maybeSingle();

    if (updateError) throw updateError;

    if (!updated) {
      return res.status(409).json({
        success: false,
        error: { message: 'This request just changed. Refresh and try again.' }
      });
    }

    // Notification failure must never undo the arrival
    try {
      await createAndEmitNotification({
        userId: request.rider_id,
        type: 'general',
        title: 'Your driver has arrived',
        body: 'Your driver is waiting at the pickup point. Please head there now.',
        relatedRideId: ride.id
      });
      getIO().to(`user_${request.rider_id}`).emit('driver_arrived', {
        rideId: ride.id,
        requestId: request.id,
        arrivedAt: updated.arrived_at
      });
    } catch (notifyError) {
      console.error('[Arrived] Notification failed:', notifyError.message);
    }

    return res.status(200).json({
      success: true,
      data: { request_id: updated.id, arrived_at: updated.arrived_at }
    });
  } catch (error) {
    console.error('[PATCH Arrived]', error);
    return res.status(500).json({
      success: false,
      error: { message: error.message || 'Failed to mark arrival.' }
    });
  }
});

// PATCH /api/v1/requests/:id/no-show
// Driver flags a rider who did not show up at the pickup point.
router.patch('/:id/no-show', verifyAuth, async (req, res) => {
  try {
    const driverId = req.user.id;
    const requestId = req.params.id;

    if (!UUID_RE.test(requestId)) {
      return res.status(400).json({ success: false, error: { message: 'Invalid request id.' } });
    }

    const { data, error } = await supabaseAdmin.rpc('flag_rider_no_show', {
      p_request_id: requestId,
      p_driver_id: driverId,
      p_penalty: NO_SHOW_PENALTY
    });

    if (error) {
      const known = [
        ['REQUEST_NOT_FOUND',     404, 'Request not found.'],
        ['RIDE_NOT_FOUND',        404, 'Ride not found.'],
        ['NOT_RIDE_DRIVER',       403, 'Only the driver of this ride can flag a no-show.'],
        ['RIDE_NOT_DEPARTED',     400, 'The ride must be in progress to flag a no-show.'],
        ['REQUEST_NOT_ACCEPTED',  409, 'This rider is no longer an accepted passenger.'],
        ['NOT_ARRIVED',           400, 'Mark that you have arrived at the pickup point first.']
      ];
      const hit = known.find(([code]) => (error.message || '').includes(code));

      if (hit) {
        return res.status(hit[1]).json({
          success: false,
          error: { code: hit[0], message: hit[2] }
        });
      }
      throw error;
    }

    const result = Array.isArray(data) ? data[0] : data;
    const rideId = result.ride_id;
    const riderId = result.rider_id;

    // Tell the rider, then cut them off from the live GPS room
    try {
      const io = getIO();
      io.to(`user_${riderId}`).emit('no_show_flagged', { rideId, requestId });
      io.in(`user_${riderId}`).socketsLeave(`ride_${rideId}`);
    } catch (socketError) {
      console.error('[NoShow] Socket cleanup failed:', socketError.message);
    }

    try {
      await createAndEmitNotification({
        userId: riderId,
        type: 'no_show_flagged',
        title: 'Marked as no-show',
        body: 'Your driver reported that you were not at the pickup point. This lowers your reliability rating.',
        relatedRideId: rideId
      });
    } catch (notifyError) {
      console.error('[NoShow] Notification failed:', notifyError.message);
    }

    // The driver gets confirmation only, not the rider's new score
    return res.status(200).json({
      success: true,
      data: {
        request_id: requestId,
        status: 'no_show',
        waited_seconds: result.waited_seconds,
        message: 'Rider marked as no-show.'
      }
    });
  } catch (error) {
    console.error('[PATCH No-Show]', error);
    return res.status(500).json({
      success: false,
      error: { message: error.message || 'Failed to flag no-show.' }
    });
  }
});

export default router;
