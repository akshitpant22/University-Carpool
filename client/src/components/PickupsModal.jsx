import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import { X, MapPin, UserX, AlertCircle, Clock } from 'lucide-react';

const SUGGESTED_WAIT_MIN = 5;

// Soft guidance only. Nothing here disables a button.
function hintFor(waitedMin) {
  if (waitedMin < 2) {
    return { text: 'Give your rider a minute to reach you.', ready: false };
  }
  if (waitedMin < SUGGESTED_WAIT_MIN) {
    return { text: 'Riders often need a few minutes. Consider waiting a little longer.', ready: false };
  }
  return {
    text: `You have waited ${waitedMin} min. If your rider has not appeared, you can mark a no-show.`,
    ready: true
  };
}

export default function PickupsModal({ isOpen, onClose, rideId }) {
  const [pickups, setPickups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [skewMs, setSkewMs] = useState(0); // server clock minus this device's clock
  const [, setTick] = useState(0);

  const load = useCallback(async (showSpinner = false) => {
    if (!rideId) return;
    if (showSpinner) setLoading(true);
    try {
      const res = await api.get(`/requests/pickups?ride_id=${rideId}`);
      setPickups(res.data?.pickups || []);
      if (res.data?.server_time) {
        setSkewMs(new Date(res.data.server_time).getTime() - Date.now());
      }
      setError('');
    } catch (err) {
      setError(err.message || 'Failed to load pickups.');
    } finally {
      if (showSpinner) setLoading(false);
    }
  }, [rideId]);

  useEffect(() => {
    if (!isOpen) return;
    load(true);
    // Re-render every 20s so the hint can advance. No per-second countdown on purpose.
    const t = setInterval(() => setTick((n) => n + 1), 20000);
    return () => clearInterval(t);
  }, [isOpen, load]);

  if (!isOpen) return null;

  const waitedSeconds = (arrivedAt) =>
    Math.max(0, Math.round((Date.now() + skewMs - new Date(arrivedAt).getTime()) / 1000));

  const handleArrived = async (p) => {
    setBusyId(p.request_id);
    setError('');
    try {
      await api.patch(`/requests/${p.request_id}/arrived`);
      await load();
    } catch (err) {
      setError(err.message || 'Failed to mark arrival.');
    } finally {
      setBusyId(null);
    }
  };

  const handleNoShow = async (p) => {
    const waitedMin = Math.floor(waitedSeconds(p.arrived_at) / 60);
    const tooEarly = waitedMin < SUGGESTED_WAIT_MIN;

    const message =
      `Mark ${p.name} as a no-show?\n\n` +
      (tooEarly
        ? `You have only waited about ${waitedMin} min (we suggest ${SUGGESTED_WAIT_MIN}).\n\n`
        : '') +
      'This cannot be undone and lowers their reliability rating.';

    if (!window.confirm(message)) return;

    setBusyId(p.request_id);
    setError('');
    try {
      await api.patch(`/requests/${p.request_id}/no-show`);
      await load();
    } catch (err) {
      setError(err.message || 'Failed to flag no-show.');
      await load();
    } finally {
      setBusyId(null);
    }
  };

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
          background: '#fff', borderRadius: '16px', width: '100%', maxWidth: '480px',
          maxHeight: '88vh', overflowY: 'auto', padding: '22px', position: 'relative'
        }}
      >
        <button onClick={onClose} style={{ position: 'absolute', top: '16px', right: '16px', background: 'none', color: '#94a3b8' }}>
          <X size={20} />
        </button>

        <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <MapPin size={20} color="#2563eb" /> Pickups
        </h3>
        <p style={{ fontSize: '0.78rem', color: '#64748b', margin: '4px 0 14px' }}>
          Use this screen only while your vehicle is stopped.
        </p>

        {error && (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', padding: '10px 12px', borderRadius: '8px', background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: '0.82rem', marginBottom: '12px' }}>
            <AlertCircle size={16} /> <span>{error}</span>
          </div>
        )}

        {loading && <div style={{ textAlign: 'center', color: '#64748b', padding: '20px' }}>Loading...</div>}

        {!loading && pickups.length === 0 && !error && (
          <div style={{ textAlign: 'center', color: '#64748b', padding: '24px', background: '#f8fafc', borderRadius: '12px', fontSize: '0.85rem' }}>
            No accepted riders on this ride.
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {pickups.map((p) => {
            const isBusy = busyId === p.request_id;
            const waitedMin = p.arrived_at ? Math.floor(waitedSeconds(p.arrived_at) / 60) : 0;
            const hint = p.arrived_at ? hintFor(waitedMin) : null;

            return (
              <div key={p.request_id} style={{ border: '1px solid #e2e8f0', borderRadius: '12px', padding: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                      width: '36px', height: '36px', borderRadius: '50%', background: '#2563eb',
                      color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800
                    }}>
                      {(p.name || 'S').charAt(0).toUpperCase()}
                    </div>
                    <div style={{ fontWeight: 800, color: '#0f172a' }}>{p.name}</div>
                  </div>

                  {p.status === 'no_show' && (
                    <span style={{ padding: '3px 10px', borderRadius: '9999px', background: '#fef2f2', color: '#b91c1c', fontSize: '0.72rem', fontWeight: 700 }}>
                      No-show
                    </span>
                  )}
                </div>

                {p.status === 'no_show' ? (
                  <div style={{ marginTop: '10px', fontSize: '0.8rem', color: '#64748b' }}>
                    Marked as a no-show. You can continue your ride.
                  </div>
                ) : !p.arrived_at ? (
                  <button
                    onClick={() => handleArrived(p)}
                    disabled={isBusy}
                    style={{
                      marginTop: '12px', width: '100%', padding: '12px', borderRadius: '10px',
                      background: '#2563eb', color: '#fff', fontWeight: 800, fontSize: '0.9rem',
                      opacity: isBusy ? 0.6 : 1
                    }}
                  >
                    {isBusy ? 'Notifying rider...' : "I've arrived at pickup"}
                  </button>
                ) : (
                  <>
                    <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: '#475569', fontWeight: 600 }}>
                      <Clock size={14} />
                      Arrived {waitedMin < 1 ? 'just now' : `${waitedMin} min ago`}
                    </div>

                    <div style={{
                      marginTop: '8px', padding: '9px 11px', borderRadius: '8px', fontSize: '0.78rem',
                      background: hint.ready ? '#fffbeb' : '#f8fafc',
                      border: `1px solid ${hint.ready ? '#fde68a' : '#e2e8f0'}`,
                      color: hint.ready ? '#92400e' : '#64748b'
                    }}>
                      {hint.text}
                    </div>

                    {/* Always enabled. The hint only changes emphasis. */}
                    <button
                      onClick={() => handleNoShow(p)}
                      disabled={isBusy}
                      style={{
                        marginTop: '10px', width: '100%', padding: '11px', borderRadius: '10px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                        fontWeight: 800, fontSize: '0.88rem',
                        background: hint.ready ? '#dc2626' : '#fff',
                        color: hint.ready ? '#fff' : '#b91c1c',
                        border: hint.ready ? 'none' : '1px solid #fecaca',
                        opacity: isBusy ? 0.6 : 1
                      }}
                    >
                      <UserX size={16} />
                      {isBusy ? 'Saving...' : "Rider didn't show up"}
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}