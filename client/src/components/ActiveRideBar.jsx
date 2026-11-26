/*It is a slim bar fixed to the bottom of the screen 
with one big button and no map, so the driver isn't tempted 
to look at the phone while driving.*/ 

import React, { useState } from 'react';
import { api } from '../services/api';
import useDriverLocationSharing from '../hooks/useDriverLocationSharing';
import { Navigation, CheckCircle2 } from 'lucide-react';

const STATUS_TEXT = {
  waiting: 'Getting GPS signal...',
  sharing: 'Sharing live location with your riders',
  offline: 'Connection lost. Riders are NOT receiving your location. Reconnecting...',
  denied: 'Location permission blocked. Enable it in browser settings.',
  unsupported: 'This device does not support GPS sharing.',
  error: 'GPS signal weak, retrying...'
};

export default function ActiveRideBar({ rideId, onCompleted }) {
  const { status } = useDriverLocationSharing(rideId);
  const [completing, setCompleting] = useState(false);
  const [error, setError] = useState('');

  if (!rideId) return null;

  const handleComplete = async () => {
    if (!window.confirm('Mark this ride as completed? Live location sharing will stop.')) return;
    setCompleting(true);
    setError('');
    try {
      await api.patch(`/rides/${rideId}/complete`);
      onCompleted();
    } catch (err) {
      setError(err.message || 'Failed to complete ride.');
    } finally {
      setCompleting(false);
    }
  };

  const healthy = status === 'sharing';

  return (
    <div style={{
      position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 900,
      background: '#0f172a', color: '#fff', padding: '12px 16px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: '12px', flexWrap: 'wrap', boxShadow: '0 -4px 12px rgba(0,0,0,0.25)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
        <span style={{
          width: '10px', height: '10px', borderRadius: '50%', flexShrink: 0,
          background: healthy ? '#22c55e' : '#f59e0b'
        }} />
        <div>
          <div style={{ fontWeight: 800, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Navigation size={15} /> Ride in progress
          </div>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
            {error || STATUS_TEXT[status] || ''}
          </div>
        </div>
      </div>

      <button
        onClick={handleComplete}
        disabled={completing}
        style={{
          padding: '12px 22px', borderRadius: '10px', background: '#16a34a', color: '#fff',
          fontWeight: 800, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '8px',
          opacity: completing ? 0.6 : 1
        }}
      >
        <CheckCircle2 size={18} /> {completing ? 'Completing...' : 'Complete Ride'}
      </button>
    </div>
  );
}