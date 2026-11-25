import { supabaseAdmin } from '../config/supabase.js';
import { getIO } from '../config/socket.js';

/**
 * Persist the notification first, then emit it to the user's private room.
 * A notification remains available in the database even if the user is offline.
 */
export async function createAndEmitNotification({
  userId,
  type = 'general',
  title,
  body,
  relatedRideId = null
}) {
  const { data: notification, error } = await supabaseAdmin
    .from('notifications')
    .insert({
      user_id: userId,
      type,
      title,
      body,
      related_ride_id: relatedRideId,
      is_read: false
    })
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  // Database write has succeeded. Now notify the connected user, if online.
  try {
    getIO().to(`user_${userId}`).emit('new_notification', notification);
  } catch (socketError) {
    console.error(
      '[Notification] Saved, but live delivery was unavailable:',
      socketError.message
    );
  }

  return notification;
}