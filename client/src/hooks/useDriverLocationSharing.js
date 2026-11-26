import { useEffect, useRef, useState } from 'react';
import { socket } from '../socket';

export default function useDriverLocationSharing(rideId) {
  // idle | waiting | sharing | offline | denied | unsupported | error
  const [status, setStatus] = useState('idle');
  const lastEmitRef = useRef(0);
  const lastPayloadRef = useRef(null);

  useEffect(() => {
    if (!rideId) {
      setStatus('idle');
      return;
    }
    if (!('geolocation' in navigator)) {
      setStatus('unsupported');
      return;
    }

    lastPayloadRef.current = null;
    lastEmitRef.current = 0;
    setStatus(socket.connected ? 'waiting' : 'offline');

    const sendLocation = (payload) => {
      socket.volatile.emit('driver_location', payload);
      lastEmitRef.current = Date.now();
      setStatus('sharing');
    };

    const handleDisconnect = () => setStatus('offline');

    const handleConnect = () => {
      // Resume immediately with the last known position
      if (lastPayloadRef.current) {
        sendLocation(lastPayloadRef.current);
      } else {
        setStatus('waiting');
      }
    };

    socket.on('disconnect', handleDisconnect);
    socket.on('connect', handleConnect);

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, accuracy, speed, heading } = pos.coords;
        lastPayloadRef.current = {
          rideId, lat: latitude, lng: longitude, accuracy, speed, heading
        };

        // Nothing can reach riders while disconnected
        if (!socket.connected) {
          setStatus('offline');
          return;
        }

        if (Date.now() - lastEmitRef.current < 3000) return; // 1 update per 3s
        sendLocation(lastPayloadRef.current);
      },
      (err) => setStatus(err.code === 1 ? 'denied' : 'error'),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
      socket.off('disconnect', handleDisconnect);
      socket.off('connect', handleConnect);
    };
  }, [rideId]);

  return { status };
}