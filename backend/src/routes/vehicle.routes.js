import express from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { verifyAuth, requireVerified } from '../middleware/auth.js';

const router = express.Router();

/**
 * GET /api/v1/vehicles/mine
 * List all vehicles registered by the authenticated user
 */
router.get('/mine', verifyAuth, async (req, res) => {
  try {
    const { data: vehicles, error } = await supabaseAdmin
      .from('vehicles')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(400).json({
        success: false,
        error: { code: 'FETCH_FAILED', message: error.message }
      });
    }

    return res.status(200).json({
      success: true,
      data: { vehicles: vehicles || [] }
    });
  } catch (err) {
    console.error('[GET /vehicles/mine] Error:', err);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to retrieve vehicles.' }
    });
  }
});

/**
 * POST /api/v1/vehicles
 * Register a new vehicle with auto-derived seat capacity
 */
router.post('/', verifyAuth, async (req, res) => {
  try {
    const { vehicle_type, vehicle_number, seat_capacity } = req.body;

    if (!vehicle_type || !['bike', 'scooty', 'car'].includes(vehicle_type)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_VEHICLE_TYPE',
          message: 'Vehicle type must be one of: bike, scooty, car.'
        }
      });
    }

    if (!vehicle_number || typeof vehicle_number !== 'string' || !vehicle_number.trim()) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_VEHICLE_NUMBER', message: 'Vehicle registration number is required.' }
      });
    }

    // Auto-derive seat capacity if not explicitly provided or validated
    let derivedSeats = 1;
    if (vehicle_type === 'car') {
      derivedSeats = seat_capacity ? Math.max(1, Math.min(8, parseInt(seat_capacity, 10))) : 4;
    } else {
      derivedSeats = 1; // 2-wheelers take 1 passenger seat in carpool context
    }

    const { data: newVehicle, error } = await supabaseAdmin
      .from('vehicles')
      .insert({
        user_id: req.user.id,
        vehicle_type,
        seat_capacity: derivedSeats,
        vehicle_number: vehicle_number.trim().toUpperCase()
      })
      .select('*')
      .single();

    if (error) {
      return res.status(400).json({
        success: false,
        error: { code: 'INSERT_FAILED', message: error.message }
      });
    }

    return res.status(201).json({
      success: true,
      data: {
        vehicle: newVehicle,
        message: 'Vehicle registered successfully.'
      }
    });
  } catch (err) {
    console.error('[POST /vehicles] Error:', err);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to register vehicle.' }
    });
  }
});

/**
 * PATCH /api/v1/vehicles/:id
 * Update details of a registered vehicle
 */
router.patch('/:id', verifyAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { vehicle_number, seat_capacity } = req.body;

    // Check ownership
    const { data: vehicle, error: checkErr } = await supabaseAdmin
      .from('vehicles')
      .select('*')
      .eq('id', id)
      .eq('user_id', req.user.id)
      .single();

    if (checkErr || !vehicle) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Vehicle not found or unauthorized.' }
      });
    }

    const updates = {};
    if (vehicle_number) updates.vehicle_number = vehicle_number.trim().toUpperCase();
    if (seat_capacity) {
      updates.seat_capacity = vehicle.vehicle_type === 'car'
        ? Math.max(1, Math.min(8, parseInt(seat_capacity, 10)))
        : 1;
    }

    const { data: updatedVehicle, error: updateErr } = await supabaseAdmin
      .from('vehicles')
      .update(updates)
      .eq('id', id)
      .select('*')
      .single();

    if (updateErr) {
      return res.status(400).json({
        success: false,
        error: { code: 'UPDATE_FAILED', message: updateErr.message }
      });
    }

    return res.status(200).json({
      success: true,
      data: { vehicle: updatedVehicle }
    });
  } catch (err) {
    console.error('[PATCH /vehicles/:id] Error:', err);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to update vehicle.' }
    });
  }
});

/**
 * DELETE /api/v1/vehicles/:id
 * Deletion Guard: Blocked if vehicle is associated with any ride where status IN ('posted', 'departed')
 */
router.delete('/:id', verifyAuth, async (req, res) => {
  try {
    const { id } = req.params;

    // 1. Verify ownership
    const { data: vehicle, error: fetchErr } = await supabaseAdmin
      .from('vehicles')
      .select('id, user_id')
      .eq('id', id)
      .eq('user_id', req.user.id)
      .single();

    if (fetchErr || !vehicle) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Vehicle not found or unauthorized.' }
      });
    }

    // 2. SRS Deletion Guard: Check active rides
    const { data: activeRides, error: rideCheckErr } = await supabaseAdmin
      .from('rides')
      .select('id, status, departure_time')
      .eq('vehicle_id', id)
      .in('status', ['posted', 'departed'])
      .limit(1);

    if (activeRides && activeRides.length > 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VEHICLE_IN_USE',
          message: 'Cannot delete a vehicle that is currently assigned to an active or upcoming ride. Please cancel or complete the ride first.'
        }
      });
    }

    // 3. Delete vehicle
    const { error: deleteErr } = await supabaseAdmin
      .from('vehicles')
      .delete()
      .eq('id', id);

    if (deleteErr) {
      return res.status(400).json({
        success: false,
        error: { code: 'DELETE_FAILED', message: deleteErr.message }
      });
    }

    return res.status(200).json({
      success: true,
      data: { message: 'Vehicle deleted successfully.' }
    });
  } catch (err) {
    console.error('[DELETE /vehicles/:id] Error:', err);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to delete vehicle.' }
    });
  }
});

export default router;
