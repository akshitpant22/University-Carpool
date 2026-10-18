import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import {
  X,
  Car,
  Bike,
  Calendar,
  Clock,
  MapPin,
  Users,
  IndianRupee,
  AlertCircle,
  CheckCircle2,
  XCircle
} from 'lucide-react';

export default function MyRidesModal({ isOpen, onClose }) {
  const [rides, setRides] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [cancellingId, setCancellingId] = useState(null);

  const fetchMyRides = async () => {
    setLoading(true);
    try {
      const res = await api.get('/rides/mine');
      if (res.success) {
        setRides(res.data.rides || []);
      }
    } catch (err) {
      setError(err.message || 'Failed to load rides.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setError('');
      fetchMyRides();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCancelRide = async (rideId) => {
    if (!window.confirm('Are you sure you want to cancel this posted ride? Any pending rider requests will be automatically notified.')) {
      return;
    }

    setCancellingId(rideId);
    setError('');

    try {
      const res = await api.patch(`/rides/${rideId}/cancel`);
      if (res.success) {
        await fetchMyRides();
      }
    } catch (err) {
      setError(err.message || 'Failed to cancel ride.');
    } finally {
      setCancellingId(null);
    }
  };

  const formatDateTime = (isoString) => {
    const d = new Date(isoString);
    return d.toLocaleString('en-IN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'posted':
        return { label: 'Active / Open', bg: '#ecfdf5', color: '#065f46', border: '#a7f3d0' };
      case 'departed':
        return { label: 'In Transit', bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' };
      case 'completed':
        return { label: 'Completed', bg: '#f1f5f9', color: '#475569', border: '#cbd5e1' };
      case 'cancelled':
        return { label: 'Cancelled', bg: '#fef2f2', color: '#b91c1c', border: '#fecaca' };
      default:
        return { label: status, bg: '#f8fafc', color: '#64748b', border: '#e2e8f0' };
    }
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(15, 23, 42, 0.65)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 50,
      padding: '16px'
    }}>
      <div style={{
        background: '#ffffff',
        borderRadius: '16px',
        width: '100%',
        maxWidth: '620px',
        maxHeight: '90vh',
        overflowY: 'auto',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
        position: 'relative',
        padding: '24px'
      }}>
        {/* Close Button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '18px',
            right: '18px',
            background: 'none',
            border: 'none',
            color: '#94a3b8',
            cursor: 'pointer'
          }}
        >
          <X size={20} />
        </button>

        {/* Modal Header */}
        <div style={{ marginBottom: '20px' }}>
          <h2 style={{ fontSize: '1.35rem', fontWeight: '800', color: '#0f172a' }}>
            My Offered Rides
          </h2>
          <p style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '4px' }}>
            Rides you have scheduled and posted as a driver to GEHU campus.
          </p>
        </div>

        {error && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 12px',
            borderRadius: '8px',
            background: '#fef2f2',
            border: '1px solid #fecaca',
            color: '#b91c1c',
            fontSize: '0.825rem',
            marginBottom: '16px'
          }}>
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        {rides.length === 0 && !loading ? (
          <div style={{
            textAlign: 'center',
            padding: '36px 16px',
            background: '#f8fafc',
            borderRadius: '12px',
            border: '1px dashed #cbd5e1'
          }}>
            <Car size={36} color="#94a3b8" style={{ margin: '0 auto 8px auto' }} />
            <div style={{ fontWeight: '600', color: '#334155' }}>No rides offered yet</div>
            <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '4px' }}>
              Whenever you plan to drive to college, tap "Offer a Ride" to share your route!
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {rides.map((r) => {
              const badge = getStatusBadge(r.status);
              const isTwoWheeler = r.vehicles?.vehicle_type !== 'car';
              const Icon = isTwoWheeler ? Bike : Car;
              const isPast = new Date(r.departure_time) < new Date();

              return (
                <div
                  key={r.id}
                  style={{
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '12px',
                    padding: '16px',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.03)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <span style={{
                        display: 'inline-block',
                        padding: '3px 8px',
                        borderRadius: '6px',
                        fontSize: '0.725rem',
                        fontWeight: '700',
                        background: badge.bg,
                        color: badge.color,
                        border: `1px solid ${badge.border}`,
                        marginBottom: '6px'
                      }}>
                        {badge.label}
                      </span>
                      <div style={{ fontWeight: '700', fontSize: '1rem', color: '#0f172a' }}>
                        {r.origin_address_text} &rarr; GEHU Campus
                      </div>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: '800', fontSize: '1.05rem', color: '#2563eb' }}>
                        {r.price_per_seat !== null ? `₹${r.price_per_seat}` : 'Free'}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>per seat</div>
                    </div>
                  </div>

                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                    gap: '8px',
                    padding: '10px 12px',
                    background: '#f8fafc',
                    borderRadius: '8px',
                    fontSize: '0.8rem',
                    color: '#475569'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Clock size={15} color="#2563eb" />
                      <span>{formatDateTime(r.departure_time)}</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Icon size={15} color="#2563eb" />
                      <span>{r.vehicles?.vehicle_number}</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Users size={15} color="#2563eb" />
                      <span>{r.available_seats} {r.available_seats === 1 ? 'seat' : 'seats'}</span>
                    </div>
                  </div>

                  {r.status === 'posted' && !isPast && (
                    <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid #f1f5f9', paddingTop: '8px' }}>
                      <button
                        onClick={() => handleCancelRide(r.id)}
                        disabled={cancellingId === r.id}
                        style={{
                          background: '#fef2f2',
                          color: '#b91c1c',
                          border: '1px solid #fecaca',
                          borderRadius: '6px',
                          padding: '6px 12px',
                          fontSize: '0.8rem',
                          fontWeight: '600',
                          cursor: cancellingId === r.id ? 'not-allowed' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '5px'
                        }}
                      >
                        <XCircle size={14} />
                        {cancellingId === r.id ? 'Cancelling...' : 'Cancel Ride'}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
