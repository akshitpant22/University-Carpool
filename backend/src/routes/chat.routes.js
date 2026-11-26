
import express from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { verifyAuth } from '../middleware/auth.js';
import { getIO } from '../config/socket.js';

const router = express.Router();

async function getRideAndCheckParticipant(rideId, userId) {
  const { data: ride, error: rideError } = await supabaseAdmin
    .from('rides')
    .select('id, driver_id, status')
    .eq('id', rideId)
    .is('deleted_at', null)
    .maybeSingle();

  if (rideError) throw rideError;
  if (!ride) return { ride: null, isParticipant: false };

  if (ride.driver_id === userId) {
    return { ride, isParticipant: true };
  }

  const { data: acceptedRequest, error: requestError } =
    await supabaseAdmin
      .from('ride_requests')
      .select('id')
      .eq('ride_id', rideId)
      .eq('rider_id', userId)
      .eq('status', 'accepted')
      .is('deleted_at', null)
      .maybeSingle();

  if (requestError) throw requestError;

  return {
    ride,
    isParticipant: Boolean(acceptedRequest)
  };
}

async function getAcceptedRider(rideId, riderId) {
  const { data, error } = await supabaseAdmin
    .from('ride_requests')
    .select('id')
    .eq('ride_id', rideId)
    .eq('rider_id', riderId)
    .eq('status', 'accepted')
    .is('deleted_at', null)
    .maybeSingle();

  if (error) throw error;
  return Boolean(data);
}

// GET /api/v1/chat/:rideId/messages?partner_id=<userId>
router.get('/:rideId/messages', verifyAuth, async (req, res) => {
  try {
    const { rideId } = req.params;
    const userId = req.user.id;
    const { partner_id: partnerId } = req.query;

    const { ride, isParticipant } =
      await getRideAndCheckParticipant(rideId, userId);

    if (!ride) {
      return res.status(404).json({
        success: false,
        error: { message: 'Ride not found.' }
      });
    }

    if (!isParticipant) {
      return res.status(403).json({
        success: false,
        error: { message: 'You are not a participant in this ride.' }
      });
    }

    let otherUserId;

    if (userId === ride.driver_id) {
      if (!partnerId || !(await getAcceptedRider(rideId, partnerId))) {
        return res.status(403).json({
          success: false,
          error: { message: 'Select an accepted rider to open this chat.' }
        });
      }

      otherUserId = partnerId;
    } else {
      otherUserId = ride.driver_id;

      if (partnerId && partnerId !== otherUserId) {
        return res.status(403).json({
          success: false,
          error: { message: 'Invalid chat participant.' }
        });
      }
    }

    const { data, error } = await supabaseAdmin
      .from('messages')
      .select('id, ride_id, sender_id, receiver_id, content, sent_at')
      .eq('ride_id', rideId)
      .or(
        `and(sender_id.eq.${userId},receiver_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},receiver_id.eq.${userId})`
      )
      .order('sent_at', { ascending: true })
      .limit(100);

    if (error) throw error;

    return res.status(200).json({
      success: true,
      data: { messages: data || [] }
    });
  } catch (error) {
    console.error('[GET Ride Messages]', error);
    return res.status(500).json({
      success: false,
      error: { message: 'Failed to fetch ride messages.' }
    });
  }
});

// POST /api/v1/chat/:rideId/messages
router.post('/:rideId/messages', verifyAuth, async (req, res) => {
  try {
    const { rideId } = req.params;
    const senderId = req.user.id;
    const { receiver_id: receiverId, content } = req.body;

    if (
      typeof content !== 'string' ||
      !content.trim() ||
      content.trim().length > 1000
    ) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Message must contain 1 to 1000 characters.'
        }
      });
    }

    if (!receiverId) {
      return res.status(400).json({
        success: false,
        error: { message: 'receiver_id is required.' }
      });
    }

    const { ride, isParticipant } =
      await getRideAndCheckParticipant(rideId, senderId);

    if (!ride) {
      return res.status(404).json({
        success: false,
        error: { message: 'Ride not found.' }
      });
    }

    if (!isParticipant) {
      return res.status(403).json({
        success: false,
        error: { message: 'You are not a participant in this ride.' }
      });
    }

    if (ride.status !== 'posted') {
      return res.status(403).json({
        success: false,
        error: { message: 'Chat is available only before departure.' }
      });
    }

    const isDriver = senderId === ride.driver_id;

    if (isDriver) {
      if (!(await getAcceptedRider(rideId, receiverId))) {
        return res.status(403).json({
          success: false,
          error: { message: 'You can only message an accepted rider.' }
        });
      }
    } else if (receiverId !== ride.driver_id) {
      return res.status(403).json({
        success: false,
        error: { message: 'You can only message the driver of this ride.' }
      });
    }

    // Save the message before attempting live delivery.
    const { data: message, error: insertError } =
      await supabaseAdmin
        .from('messages')
        .insert({
          ride_id: rideId,
          sender_id: senderId,
          receiver_id: receiverId,
          content: content.trim()
        })
        .select('id, ride_id, sender_id, receiver_id, content, sent_at')
        .single();

    if (insertError) throw insertError;

    // Both users already join their own authenticated user rooms.
    // This prevents other accepted riders from seeing this conversation.
    try {
      getIO()
        .to(`user_${senderId}`)
        .to(`user_${receiverId}`)
        .emit('new_message', message);
    } catch (socketError) {
      console.error(
        '[Chat] Message saved, but live delivery failed:',
        socketError.message
      );
    }

    return res.status(201).json({
      success: true,
      data: { message }
    });
  } catch (error) {
    console.error('[POST Ride Message]', error);
    return res.status(500).json({
      success: false,
      error: { message: 'Failed to send ride message.' }
    });
  }
});

export default router;