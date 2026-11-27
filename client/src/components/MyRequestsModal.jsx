import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import ChatModal from './ChatModal';
import { X, MessageCircle, Clock, MapPin, AlertCircle, Inbox, Navigation } from 'lucide-react';
import { socket } from '../socket';
import LiveTrackModal from './LiveTrackModal';

const STATUS_STYLES = {
  pending:             { label: 'Pending',           bg: '#fff7ed', color: '#c2410c' },
  accepted:            { label: 'Accepted',          bg: '#ecfdf5', color: '#065f46' },
  declined:            { label: 'Declined',          bg: '#fef2f2', color: '#b91c1c' },
  expired:             { label: 'Expired',           bg: '#f1f5f9', color: '#475569' },
  cancelled_by_rider:  { label: 'Cancelled by you',  bg: '#f1f5f9', color: '#475569' },
  cancelled_by_driver: { label: 'Cancelled by driver', bg: '#fef2f2', color: '#b91c1c' },
  no_show:             { label: 'No show',           bg: '#fef2f2', color: '#b91c1c' }
};

export default function MyRequestsModal({ isOpen, onClose }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [chatTarget, setChatTarget] = useState(null);
  const [trackTarget, setTrackTarget] = useState(null);

  useEffect(() => {
    if (!isOpen) return;

    setError('');
    setLoading(true);
    api.get('/requests/mine')
      .then((res) => setRequests(res.data?.requests || []))
      .catch((err) => setError(err.message || 'Failed to load your requests.'))
      .finally(() => setLoading(false));

    const refresh = () => {
      api.get('/requests/mine')
        .then((res) => setRequests(res.data?.requests || []))
        .catch(() => {});
    };

    socket.on('ride_departed', refresh);
    socket.on('ride_completed', refresh);
    socket.on('ride_cancelled', refresh);
    socket.on('driver_arrived', refresh);
    socket.on('no_show_flagged', refresh);

    return () => {
      socket.off('ride_departed', refresh);
      socket.off('ride_completed', refresh);
      socket.off('ride_cancelled', refresh);
      socket.off('driver_arrived', refresh);
      socket.off('no_show_flagged', refresh);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const fmt = (iso) =>
    iso ? new Date(iso).toLocaleString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.65)',
      backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center',
      justifyContent: 'center', zIndex: 50, padding: '16px'
    }}>
      <div style={{
        background: '#fff', borderRadius: '16px', width: '100%', maxWidth: '620px',
        maxHeight: '90vh', overflowY: 'auto', position: 'relative', padding: '24px'
      }}>
        <button onClick={onClose} style={{ position: 'absolute', top: '18px', right: '18px', background: 'none', color: '#94a3b8' }}>
          <X size={20} />
        </button>

        <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0f172a' }}>My Ride Requests</h2>
        <p style={{ fontSize: '0.85rem', color: '#64748b', margin: '4px 0 18px' }}>
          Once a driver accepts, you can chat with them before departure.
        </p>

        {error && (
          <div style={{
            display: 'flex', gap: '8px', alignItems: 'center', padding: '10px 12px', borderRadius: '8px',
            background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: '0.825rem', marginBottom: '14px'
          }}>
            <AlertCircle size={16} /> <span>{error}</span>
          </div>
        )}

        {loading && <div style={{ color: '#64748b', textAlign: 'center' }}>Loading...</div>}

        {!loading && !error && requests.length === 0 && (
          <div style={{ textAlign: 'center', padding: '36px', background: '#f8fafc', borderRadius: '12px' }}>
            <Inbox size={36} color="#94a3b8" style={{ margin: '0 auto 8px' }} />
            <div style={{ fontWeight: 600, color: '#334155' }}>No requests yet</div>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {requests.map((rq) => {
            const st = STATUS_STYLES[rq.status] || { label: rq.status, bg: '#f1f5f9', color: '#475569' };
            const canChat = rq.status === 'accepted' && rq.ride?.status === 'posted';
            const canTrack = rq.status === 'accepted' && rq.ride?.status === 'departed';
            // Show ride progress instead of a plain "Accepted"
            let badge = st;
            if (rq.status === 'accepted' && rq.ride?.status === 'departed') {
              badge = rq.arrived_at
                ? { label: 'Driver arrived', bg: '#fef3c7', color: '#92400e' }
                : { label: 'In transit', bg: '#eff6ff', color: '#1d4ed8' };
            } else if (rq.status === 'accepted' && rq.ride?.status === 'completed') {
              badge = { label: 'Completed', bg: '#f1f5f9', color: '#475569' };
            }
            return (
              <div key={rq.id} style={{ border: '1px solid #e2e8f0', borderRadius: '12px', padding: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                  <div>
                    <div style={{ fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <MapPin size={15} color="#2563eb" /> {rq.ride?.origin_address_text || 'Ride unavailable'}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '4px' }}>
                      Driver: {rq.driver?.name || 'Campus Peer'}
                    </div>
                    <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <Clock size={13} /> {fmt(rq.ride?.departure_time)}
                    </div>
                  </div>
                  <span style={{
                    padding: '4px 10px', borderRadius: '9999px', fontSize: '0.72rem',
                    fontWeight: 700, background: badge.bg, color: badge.color, whiteSpace: 'nowrap'
                  }}>
                    {badge.label}
                  </span>
                </div>
                
                {rq.status === 'accepted' && rq.ride?.status === 'departed' && rq.arrived_at && (
                  <div style={{
                    marginTop: '12px', padding: '9px 11px', borderRadius: '8px', background: '#fffbeb',
                    border: '1px solid #fde68a', color: '#92400e', fontSize: '0.8rem', fontWeight: 600
                  }}>
                    Your driver is waiting at the pickup point. Please head there now.
                  </div>
                )}

                {rq.status === 'no_show' && (
                  <div style={{
                    marginTop: '12px', padding: '9px 11px', borderRadius: '8px', background: '#fef2f2',
                    border: '1px solid #fecaca', color: '#b91c1c', fontSize: '0.8rem', fontWeight: 600
                  }}>
                    You were marked as a no-show. This lowers your reliability rating.
                  </div>
                )}

                {canChat && (
                  <button
                    onClick={() => setChatTarget({
                      rideId: rq.ride_id,
                      partnerId: rq.ride.driver_id,
                      partnerName: rq.driver?.name,
                      rideLabel: rq.ride.origin_address_text
                    })}
                    style={{
                      marginTop: '12px', display: 'flex', alignItems: 'center', gap: '6px',
                      padding: '8px 14px', borderRadius: '8px', background: '#2563eb',
                      color: '#fff', fontWeight: 700, fontSize: '0.82rem'
                    }}
                  >
                    <MessageCircle size={15} /> Chat with driver
                  </button>
                )}

                {canTrack && (
                  <button
                    onClick={() => setTrackTarget({
                      rideId: rq.ride_id,
                      driverName: rq.driver?.name,
                      rideLabel: rq.ride.origin_address_text,
                      arrivedAt: rq.arrived_at
                    })}
                    style={{
                      marginTop: '12px', display: 'flex', alignItems: 'center', gap: '6px',
                      padding: '8px 14px', borderRadius: '8px', background: '#16a34a',
                      color: '#fff', fontWeight: 700, fontSize: '0.82rem'
                    }}
                  >
                    <Navigation size={15} /> Track ride live
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <ChatModal
        isOpen={!!chatTarget}
        onClose={() => setChatTarget(null)}
        rideId={chatTarget?.rideId}
        partnerId={chatTarget?.partnerId}
        partnerName={chatTarget?.partnerName}
        rideLabel={chatTarget?.rideLabel}
      />
      <LiveTrackModal
        isOpen={!!trackTarget}
        onClose={() => setTrackTarget(null)}
        rideId={trackTarget?.rideId}
        driverName={trackTarget?.driverName}
        rideLabel={trackTarget?.rideLabel}
        arrivedAt={trackTarget?.arrivedAt}
      />
    </div>
  );
}