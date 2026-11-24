
import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import {
  X,
  Users,
  MapPin,
  Clock,
  IndianRupee,
  Mail,
  GraduationCap,
  RefreshCw,
  Inbox,
  AlertCircle,
  CheckCircle,
  XCircle
} from 'lucide-react';

export default function IncomingRequestsModal({ isOpen, onClose }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [respondingId, setRespondingId] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');

  const fetchIncomingRequests = async () => {
    setLoading(true);
    setError('');

    try {
      const res = await api.get('/requests/incoming');
      setRequests(res.data?.requests || []);
    } catch (err) {
      console.error('Failed to fetch incoming requests:', err);
      setError(err.message || 'Unable to load incoming requests.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setSuccessMessage('');
      fetchIncomingRequests();
    }
  }, [isOpen]);

  const handleRespond = async (requestId, decision) => {
    const action = decision === 'accepted' ? 'accept' : 'decline';

    const confirmed = window.confirm(
      `Are you sure you want to ${action} this ride request?`
    );

    if (!confirmed) return;

    setRespondingId(requestId);
    setError('');
    setSuccessMessage('');

    try {
      await api.patch(`/requests/${requestId}/respond`, {
        decision
      });

      setSuccessMessage(
        decision === 'accepted'
          ? 'Ride request accepted successfully!'
          : 'Ride request declined successfully!'
      );

      await fetchIncomingRequests();
    } catch (err) {
      console.error('Failed to respond to ride request:', err);
      setError(err.message || 'Unable to process this request.');
    } finally {
      setRespondingId(null);
    }
  };

  if (!isOpen) return null;

  const formatDateTime = (date) => {
    if (!date) return 'Not available';

    return new Date(date).toLocaleString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(5px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '16px'
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#ffffff',
          width: '100%',
          maxWidth: '650px',
          maxHeight: '90vh',
          overflowY: 'auto',
          borderRadius: '20px',
          padding: '24px',
          boxShadow: '0 25px 60px rgba(0,0,0,0.2)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '22px'
          }}
        >
          <div>
            <h2 style={{
              margin: 0,
              fontSize: '23px',
              fontWeight: 800,
              color: '#0f172a'
            }}>
              Incoming Ride Requests
            </h2>

            <p style={{
              margin: '6px 0 0',
              color: '#64748b',
              fontSize: '14px'
            }}>
              Students requesting seats in your rides
            </p>
          </div>

          <button
            onClick={onClose}
            style={{
              border: 'none',
              background: '#f1f5f9',
              borderRadius: '10px',
              padding: '9px',
              cursor: 'pointer',
              display: 'flex'
            }}
          >
            <X size={20} color="#475569" />
          </button>
        </div>

        {/* Success message */}
        {successMessage && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '9px',
            padding: '12px',
            background: '#f0fdf4',
            border: '1px solid #bbf7d0',
            borderRadius: '10px',
            color: '#166534',
            fontSize: '14px',
            marginBottom: '15px'
          }}>
            <CheckCircle size={18} />
            {successMessage}
          </div>
        )}

        {/* Error message */}
        {error && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '13px',
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '10px',
            color: '#b91c1c',
            marginBottom: '16px',
            fontSize: '14px'
          }}>
            <AlertCircle size={18} />
            {error}
          </div>
        )}

        {/* Refresh button */}
        <div style={{
          display: 'flex',
          justifyContent: 'flex-end',
          marginBottom: '16px'
        }}>
          <button
            onClick={fetchIncomingRequests}
            disabled={loading || respondingId !== null}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '7px',
              padding: '8px 13px',
              border: '1px solid #e2e8f0',
              borderRadius: '9px',
              background: '#ffffff',
              color: '#334155',
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer'
            }}
          >
            <RefreshCw size={15} />
            Refresh
          </button>
        </div>

        {/* Loading */}
        {loading && (
          <div style={{
            textAlign: 'center',
            padding: '40px 15px',
            color: '#64748b'
          }}>
            <RefreshCw size={28} style={{ marginBottom: '10px' }} />
            <p>Loading incoming requests...</p>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && requests.length === 0 && (
          <div style={{
            textAlign: 'center',
            padding: '45px 20px',
            background: '#f8fafc',
            borderRadius: '14px'
          }}>
            <Inbox size={42} color="#94a3b8" />

            <h3 style={{
              margin: '12px 0 7px',
              color: '#1e293b'
            }}>
              No pending requests
            </h3>

            <p style={{
              margin: 0,
              color: '#64748b',
              fontSize: '14px'
            }}>
              New ride requests from students will appear here.
            </p>
          </div>
        )}

        {/* Request cards */}
        {!loading && requests.length > 0 && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '15px'
          }}>
            {requests.map((request) => {
              const rider = request.rider;
              const ride = request.ride;
              const isResponding = respondingId === request.id;

              return (
                <div
                  key={request.id}
                  style={{
                    border: '1px solid #e2e8f0',
                    borderRadius: '15px',
                    padding: '17px',
                    background: '#ffffff'
                  }}
                >
                  {/* Rider details */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '13px',
                    marginBottom: '15px'
                  }}>
                    {rider?.profile_photo_url ? (
                      <img
                        src={rider.profile_photo_url}
                        alt={rider.name || 'Rider'}
                        style={{
                          width: '48px',
                          height: '48px',
                          borderRadius: '50%',
                          objectFit: 'cover'
                        }}
                      />
                    ) : (
                      <div style={{
                        width: '48px',
                        height: '48px',
                        borderRadius: '50%',
                        background: '#e0e7ff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}>
                        <Users size={22} color="#4338ca" />
                      </div>
                    )}

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <h3 style={{
                        margin: 0,
                        fontSize: '16px',
                        fontWeight: 750,
                        color: '#0f172a'
                      }}>
                        {rider?.name || 'Student'}
                      </h3>

                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        color: '#64748b',
                        fontSize: '13px',
                        marginTop: '4px'
                      }}>
                        <Mail size={13} />
                        {rider?.email || 'Email unavailable'}
                      </div>
                    </div>

                    <span style={{
                      background: '#fff7ed',
                      color: '#c2410c',
                      padding: '6px 10px',
                      borderRadius: '20px',
                      fontSize: '11px',
                      fontWeight: 700
                    }}>
                      PENDING
                    </span>
                  </div>

                  {/* Academic details */}
                  {(rider?.branch || rider?.course || rider?.year) && (
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '7px',
                      color: '#475569',
                      fontSize: '13px',
                      marginBottom: '15px'
                    }}>
                      <GraduationCap size={16} />
                      {[
                        rider?.branch,
                        rider?.course,
                        rider?.year ? `Year ${rider.year}` : null
                      ].filter(Boolean).join(' • ')}
                    </div>
                  )}

                  {/* Ride details */}
                  <div style={{
                    background: '#f8fafc',
                    borderRadius: '11px',
                    padding: '13px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px'
                  }}>
                    <div style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '9px'
                    }}>
                      <MapPin size={17} color="#4f46e5" />
                      <div>
                        <div style={{
                          fontSize: '11px',
                          color: '#64748b',
                          marginBottom: '3px'
                        }}>
                          RIDE ORIGIN
                        </div>
                        <div style={{
                          fontSize: '13px',
                          color: '#1e293b',
                          fontWeight: 600
                        }}>
                          {ride?.origin_address_text || 'Location unavailable'}
                        </div>
                      </div>
                    </div>

                    <div style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: '18px'
                    }}>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '7px'
                      }}>
                        <Clock size={15} color="#64748b" />
                        <span style={{
                          fontSize: '12px',
                          color: '#475569'
                        }}>
                          {formatDateTime(ride?.departure_time)}
                        </span>
                      </div>

                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}>
                        <IndianRupee size={15} color="#64748b" />
                        <span style={{
                          fontSize: '12px',
                          color: '#475569'
                        }}>
                          {ride?.price_per_seat ?? 0} / seat
                        </span>
                      </div>

                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}>
                        <Users size={15} color="#64748b" />
                        <span style={{
                          fontSize: '12px',
                          color: '#475569'
                        }}>
                          {ride?.available_seats ?? 0} seats available
                        </span>
                      </div>
                    </div>
                  </div>

                  <p style={{
                    margin: '13px 0',
                    color: '#94a3b8',
                    fontSize: '12px'
                  }}>
                    Requested on {formatDateTime(request.requested_at)}
                  </p>

                  {/* Accept / Decline buttons */}
                  <div style={{
                    display: 'flex',
                    gap: '10px'
                  }}>
                    <button
                      onClick={() => handleRespond(request.id, 'accepted')}
                      disabled={respondingId !== null}
                      style={{
                        flex: 1,
                        padding: '11px',
                        border: 'none',
                        borderRadius: '9px',
                        background: '#16a34a',
                        color: '#ffffff',
                        fontWeight: 700,
                        fontSize: '14px',
                        cursor: respondingId !== null ? 'not-allowed' : 'pointer',
                        opacity: respondingId !== null ? 0.6 : 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '7px'
                      }}
                    >
                      <CheckCircle size={17} />
                      {isResponding ? 'Processing...' : 'Accept'}
                    </button>

                    <button
                      onClick={() => handleRespond(request.id, 'declined')}
                      disabled={respondingId !== null}
                      style={{
                        flex: 1,
                        padding: '11px',
                        border: '1px solid #fecaca',
                        borderRadius: '9px',
                        background: '#fff1f2',
                        color: '#dc2626',
                        fontWeight: 700,
                        fontSize: '14px',
                        cursor: respondingId !== null ? 'not-allowed' : 'pointer',
                        opacity: respondingId !== null ? 0.6 : 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '7px'
                      }}
                    >
                      <XCircle size={17} />
                      {isResponding ? 'Processing...' : 'Decline'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
