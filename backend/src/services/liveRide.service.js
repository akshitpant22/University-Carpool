// In-memory only. Nothing here touches the database (Phase-1: GPS is ephemeral).
const activeRides = new Map();  // rideId -> { driverId, lastLocation, lastEmitAt }
const stoppedRides = new Map(); // rideId -> stoppedAt (blocks fallback reactivation)

const STOPPED_TTL_MS = 60 * 60 * 1000; // markers are only needed briefly

function pruneStopped() {
  const cutoff = Date.now() - STOPPED_TTL_MS;
  for (const [id, at] of stoppedRides) {
    if (at < cutoff) stoppedRides.delete(id);
  }
}

// Explicit departure (depart route). Clears any stopped marker.
export function activateRide(rideId, driverId) {
  stoppedRides.delete(rideId);
  const existing = activeRides.get(rideId);
  activeRides.set(rideId, {
    driverId,
    lastLocation: existing?.lastLocation || null,
    lastEmitAt: 0
  });
}

// Fallback after a server restart. Refuses if the ride was completed/cancelled.
export function restoreRide(rideId, driverId) {
  if (stoppedRides.has(rideId)) return false;
  activeRides.set(rideId, { driverId, lastLocation: null, lastEmitAt: 0 });
  return true;
}

export function deactivateRide(rideId) {
  activeRides.delete(rideId);
  stoppedRides.set(rideId, Date.now());
  pruneStopped();
}

export function isRideStopped(rideId) {
  return stoppedRides.has(rideId);
}

export function getActiveRide(rideId) {
  return activeRides.get(rideId) || null;
}