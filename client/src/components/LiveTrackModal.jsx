import React, { useState, useEffect } from 'react';
import { socket } from '../socket';
import { X, MapPin, Navigation, AlertCircle, CheckCircle2 } from 'lucide-react';

export default function LiveTrackModal({ isOpen, onClose, rideId, driverName, rideLabel, arrivedAt }) {  const [location, setLocation] = useState(null); // includes receivedAt (client clock)
  const [ended, setEnded] = useState('');         // '' | 'completed' | 'cancelled'
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());
  const [arrived, setArrived] = useState(false);

  useEffect(() => {
    if (!isOpen || !rideId) return;

    setLocation(null);
    setEnded('');
    setError('');
    setArrived(Boolean(arrivedAt));

    const join = () => socket.emit('join_ride_room', rideId);
    const onLocation = (loc) => {
      if (loc.rideId === rideId) setLocation({ ...loc, receivedAt: Date.now() });
    };
    const onCompleted = (d) => { if (d.rideId === rideId) setEnded('completed'); };
    const onCancelled = (d) => { if (d.rideId === rideId) setEnded('cancelled'); };
    const onArrived = (d) => { if (d.rideId === rideId) setArrived(true); };
    const onNoShow = (d) => { if (d.rideId === rideId) setEnded('no_show'); };
    const onRoomError = (d) => setError(d?.message || 'Unable to join live tracking.');

    socket.on('connect', join); // rooms are lost on reconnect, so re-join
    socket.on('ride_location', onLocation);
    socket.on('ride_completed', onCompleted);
    socket.on('ride_cancelled', onCancelled);
    socket.on('driver_arrived', onArrived);
    socket.on('no_show_flagged', onNoShow);
    socket.on('room_error', onRoomError);

    if (socket.connected) join();

    const tick = setInterval(() => setNow(Date.now()), 1000);

    return () => {
      socket.off('connect', join);
      socket.off('ride_location', onLocation);
      socket.off('ride_completed', onCompleted);
      socket.off('ride_cancelled', onCancelled);
      socket.off('driver_arrived', onArrived);
      socket.off('no_show_flagged', onNoShow);
      socket.off('room_error', onRoomError);
      clearInterval(tick);
    };
  }, [isOpen, rideId]);

  if (!isOpen) return null;

  const secondsAgo = location ? Math.max(0, Math.round((now - location.receivedAt) / 1000)) : null;
  const isLive = secondsAgo !== null && secondsAgo < 15 && !ended;
  const speedKmh = location?.speed != null ? Math.round(location.speed * 3.6) : null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center',
        justifyContent: 'center', zIndex: 1100, padding: '16px'
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: '16px', width: '100%', maxWidth: '440px',
          padding: '22px', position: 'relative'
        }}
      >
        <button onClick={onClose} style={{ position: 'absolute', top: '16px', right: '16px', background: 'none', color: '#94a3b8' }}>
          <X size={20} />
        </button>

        <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Navigation size={20} color="#2563eb" /> Live Ride Tracking
        </h3>
        <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '4px 0 16px' }}>
          {driverName || 'Driver'} • {rideLabel}
        </p>

        {error && (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', padding: '10px 12px', borderRadius: '8px', background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: '0.82rem', marginBottom: '12px' }}>
            <AlertCircle size={16} /> <span>{error}</span>
          </div>
        )}

        {arrived && !ended && (
          <div style={{
            display: 'flex', gap: '8px', alignItems: 'center', padding: '10px 12px', borderRadius: '8px',
            background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e',
            fontSize: '0.82rem', fontWeight: 600, marginBottom: '12px'
          }}>
            <MapPin size={16} />
            <span>Your driver has arrived at the pickup point. Please head there now.</span>
          </div>
        )}

        {ended ? (
          <div style={{ padding: '20px', textAlign: 'center', borderRadius: '12px', background: ended === 'completed' ? '#ecfdf5' : '#fef2f2' }}>
            <CheckCircle2 size={34} color={ended === 'completed' ? '#059669' : '#b91c1c'} style={{ margin: '0 auto 8px' }} />
            <div style={{ fontWeight: 800, color: '#0f172a' }}>
              {ended === 'completed'
                ? 'Ride completed'
                : ended === 'no_show'
                  ? 'You were marked as a no-show'
                  : 'Ride cancelled by driver'}
            </div>
            <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '4px' }}>Live tracking has stopped.</div>
          </div>
        ) : !location ? (
          <div style={{ padding: '28px', textAlign: 'center', background: '#f8fafc', borderRadius: '12px', color: '#64748b', fontSize: '0.85rem' }}>
            Waiting for the driver's first location update...
          </div>
        ) : (
          <div style={{ background: '#f8fafc', borderRadius: '12px', padding: '16px' }}>
            <span style={{
              display: 'inline-block', padding: '3px 10px', borderRadius: '9999px', fontSize: '0.72rem',
              fontWeight: 800, background: isLive ? '#dcfce7' : '#fef3c7', color: isLive ? '#15803d' : '#92400e'
            }}>
              {isLive ? 'LIVE' : 'SIGNAL LOST?'}
            </span>
            <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '6px' }}>
              Last update {secondsAgo}s ago
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', margin: '12px 0 4px', fontWeight: 700, color: '#0f172a', fontSize: '0.9rem' }}>
              <MapPin size={15} color="#2563eb" />
              {location.lat.toFixed(5)}, {location.lng.toFixed(5)}
            </div>
            <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
              {speedKmh !== null && <>Speed ≈ {speedKmh} km/h • </>}
              {location.accuracy != null && <>Accuracy ±{Math.round(location.accuracy)} m</>}
            </div>

            <a
              href={`https://www.google.com/maps?q=${location.lat},${location.lng}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'block', marginTop: '14px', textAlign: 'center', padding: '10px',
                borderRadius: '8px', background: '#2563eb', color: '#fff', fontWeight: 700,
                fontSize: '0.85rem', textDecoration: 'none'
              }}
            >
              Open in Google Maps
            </a>
          </div>
        )}
      </div>
    </div>
  );
}