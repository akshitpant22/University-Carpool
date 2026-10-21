import React, { useState } from 'react';
import {
  X,
  Star,
  ShieldCheck,
  MapPin,
  Clock,
  Car,
  Compass,
  ArrowRight,
  Sparkles,
  Info,
  CheckCircle,
  AlertTriangle,
  RotateCcw
} from 'lucide-react';

export default function SearchResultsModal({
  isOpen,
  onClose,
  searchData,
  searchMeta,
  onModifySearch
}) {
  const [requestedRides, setRequestedRides] = useState(new Set());
  const [requestSuccessMessage, setRequestSuccessMessage] = useState('');

  if (!isOpen || !searchData) return null;

  const results = searchData.results || [];
  const excludedByGender = searchData.excluded_by_gender_count || 0;

  const handleRequestRide = (rideId, driverName) => {
    // In Milestone 3, we validate ride selection and provide instant feedback.
    // In Milestone 4, this connects to POST /api/v1/requests with atomic acceptance.
    setRequestedRides((prev) => new Set(prev).add(rideId));
    setRequestSuccessMessage(
      `Ride request submitted to ${driverName}! In Milestone 4, this triggers real-time driver notification and Socket.IO accept flow.`
    );
    setTimeout(() => {
      setRequestSuccessMessage('');
    }, 6000);
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(15, 23, 42, 0.75)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '16px'
    }}>
      <div style={{
        background: '#ffffff',
        borderRadius: '20px',
        maxWidth: '680px',
        width: '100%',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        border: '1px solid #e2e8f0',
        overflow: 'hidden'
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px',
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
          color: '#ffffff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '3px 10px',
              borderRadius: '9999px',
              background: 'rgba(37, 99, 235, 0.2)',
              border: '1px solid rgba(147, 197, 253, 0.3)',
              color: '#93c5fd',
              fontSize: '0.725rem',
              fontWeight: '700',
              marginBottom: '6px'
            }}>
              <Sparkles size={12} /> PostGIS & ML Fusion Ranked (50/50 Rating & Price)
            </div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: '800', margin: 0, letterSpacing: '-0.3px' }}>
              Commute Matches to GEHU Campus
            </h3>
            <p style={{ fontSize: '0.8rem', color: '#94a3b8', margin: '4px 0 0 0' }}>
              Pickup near <strong style={{ color: '#f8fafc' }}>{searchMeta?.pickup_address_text || 'Dehradun'}</strong> • Max Detour: <strong style={{ color: '#f8fafc' }}>{searchMeta?.max_detour_km || 5} km</strong>
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255, 255, 255, 0.1)',
              border: 'none',
              borderRadius: '8px',
              padding: '8px',
              color: '#ffffff',
              cursor: 'pointer'
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Success feedback toast */}
        {requestSuccessMessage && (
          <div style={{
            background: '#ecfdf5',
            borderBottom: '1px solid #a7f3d0',
            padding: '12px 20px',
            color: '#065f46',
            fontSize: '0.825rem',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <CheckCircle size={16} color="#059669" />
            <span>{requestSuccessMessage}</span>
          </div>
        )}

        {/* Transparent Fallback Banner (As mandated in SRS PRD Section 5.3) */}
        {excludedByGender > 0 && (
          <div style={{
            background: '#fffbeb',
            borderBottom: '1px solid #fef3c7',
            padding: '12px 20px',
            color: '#92400e',
            fontSize: '0.825rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertTriangle size={16} color="#d97706" />
              <span>
                <strong>Transparent Safety Notice:</strong> {excludedByGender} ride{excludedByGender > 1 ? 's' : ''} on this route {excludedByGender > 1 ? 'were' : 'was'} excluded by mutual gender filtering.
              </span>
            </div>
            <button
              onClick={() => {
                onClose();
                onModifySearch && onModifySearch();
              }}
              style={{
                background: 'none',
                border: 'none',
                color: '#b45309',
                fontWeight: '700',
                fontSize: '0.75rem',
                cursor: 'pointer',
                textDecoration: 'underline',
                whiteSpace: 'nowrap'
              }}
            >
              Adjust Filter
            </button>
          </div>
        )}

        {/* Results List */}
        <div style={{
          padding: '20px',
          overflowY: 'auto',
          flex: 1,
          background: '#f8fafc'
        }}>
          {results.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: '48px 24px',
              background: '#ffffff',
              borderRadius: '16px',
              border: '1px solid #e2e8f0'
            }}>
              <div style={{
                width: '56px',
                height: '56px',
                borderRadius: '50%',
                background: '#eff6ff',
                color: '#2563eb',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px'
              }}>
                <Compass size={28} />
              </div>
              <h4 style={{ fontSize: '1.1rem', fontWeight: '800', color: '#0f172a', marginBottom: '8px' }}>
                No Active Rides Found for this Corridor
              </h4>
              <p style={{ fontSize: '0.85rem', color: '#64748b', maxWidth: '420px', margin: '0 auto 20px', lineHeight: 1.5 }}>
                No verified peers have currently posted a ride departing from or passing within {searchMeta?.max_detour_km || 5} km of your pickup landmark.
              </p>
              <div style={{ display: 'flex', justifyContent: 'center', gap: '10px' }}>
                <button
                  onClick={() => {
                    onClose();
                    onModifySearch && onModifySearch();
                  }}
                  style={{
                    padding: '10px 18px',
                    borderRadius: '10px',
                    background: '#2563eb',
                    color: '#ffffff',
                    fontWeight: '700',
                    fontSize: '0.85rem',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <RotateCcw size={15} />
                  <span>Broaden Detour Range</span>
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {results.map((ride, index) => {
                const isRequested = requestedRides.has(ride.id);
                const isRankOne = index === 0;

                const depDate = new Date(ride.departure_time);
                const timeString = depDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                const dateString = depDate.toLocaleDateString([], { month: 'short', day: 'numeric' });

                return (
                  <div
                    key={ride.id}
                    style={{
                      background: '#ffffff',
                      borderRadius: '16px',
                      border: isRankOne ? '2px solid #3b82f6' : '1px solid #e2e8f0',
                      boxShadow: isRankOne
                        ? '0 10px 25px -5px rgba(59, 130, 246, 0.15)'
                        : '0 2px 6px -1px rgba(0, 0, 0, 0.05)',
                      padding: '20px',
                      position: 'relative'
                    }}
                  >
                    {/* Rank Badge */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: '14px',
                      flexWrap: 'wrap',
                      gap: '8px'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{
                          padding: '4px 10px',
                          borderRadius: '8px',
                          background: isRankOne ? '#2563eb' : '#0f172a',
                          color: '#ffffff',
                          fontWeight: '800',
                          fontSize: '0.75rem',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}>
                          {isRankOne && <Sparkles size={12} />}
                          #{index + 1} Best Match
                        </span>

                        <span style={{
                          padding: '3px 8px',
                          borderRadius: '6px',
                          background: '#f1f5f9',
                          border: '1px solid #cbd5e1',
                          color: '#475569',
                          fontWeight: '700',
                          fontSize: '0.725rem'
                        }}>
                          Score: {Math.round(ride.final_score * 100)}% ({ride.match_quality})
                        </span>

                        <span style={{
                          padding: '3px 8px',
                          borderRadius: '6px',
                          background: ride.commute_direction === 'from_campus' ? '#fdf4ff' : '#ecfdf5',
                          border: ride.commute_direction === 'from_campus' ? '1px solid #f0abfc' : '1px solid #a7f3d0',
                          color: ride.commute_direction === 'from_campus' ? '#a21caf' : '#047857',
                          fontWeight: '700',
                          fontSize: '0.725rem'
                        }}>
                          {ride.commute_direction === 'from_campus' ? 'From Campus → Home' : 'Towards GEHU Campus'}
                        </span>

                        {ride.is_own_ride && (
                          <span style={{
                            padding: '3px 8px',
                            borderRadius: '6px',
                            background: '#eff6ff',
                            border: '1px solid #93c5fd',
                            color: '#1d4ed8',
                            fontWeight: '800',
                            fontSize: '0.725rem'
                          }}>
                            Your Offered Ride (Driver Preview)
                          </span>
                        )}
                      </div>


                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {ride.is_free ? (
                          <span style={{
                            padding: '4px 10px',
                            borderRadius: '9999px',
                            background: '#dcfce7',
                            border: '1px solid #86efac',
                            color: '#15803d',
                            fontWeight: '800',
                            fontSize: '0.8rem'
                          }}>
                            FREE COMMUTE
                          </span>
                        ) : (
                          <span style={{
                            padding: '4px 10px',
                            borderRadius: '9999px',
                            background: '#eff6ff',
                            border: '1px solid #bfdbfe',
                            color: '#1d4ed8',
                            fontWeight: '800',
                            fontSize: '0.85rem'
                          }}>
                            ₹{ride.price_per_seat} / seat
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Driver Profile Bar */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      paddingBottom: '14px',
                      borderBottom: '1px solid #f1f5f9',
                      marginBottom: '14px'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{
                          width: '42px',
                          height: '42px',
                          borderRadius: '50%',
                          background: 'linear-gradient(135deg, #2563eb 0%, #1e40af 100%)',
                          color: '#ffffff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: '800',
                          fontSize: '1rem',
                          flexShrink: 0
                        }}>
                          {ride.driver.name ? ride.driver.name.charAt(0).toUpperCase() : 'U'}
                        </div>
                        <div>
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            fontWeight: '800',
                            fontSize: '0.95rem',
                            color: '#0f172a'
                          }}>
                            <span>{ride.driver.name}</span>
                            <ShieldCheck size={16} color="#2563eb" title="Verified GEHU Student" />
                          </div>
                          <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
                            {ride.driver.branch} • {ride.driver.course}
                          </div>
                        </div>
                      </div>

                      <div style={{ textAlign: 'right' }}>
                        <div style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '3px 8px',
                          borderRadius: '6px',
                          background: '#fef3c7',
                          border: '1px solid #fde68a',
                          color: '#92400e',
                          fontWeight: '800',
                          fontSize: '0.8rem'
                        }}>
                          <Star size={13} fill="#f59e0b" color="#f59e0b" />
                          <span>{parseFloat(ride.driver.composite_rating).toFixed(1)}</span>
                        </div>
                        <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '2px' }}>
                          {ride.driver.completed_rides_count} rides completed
                        </div>
                      </div>
                    </div>

                    {/* Route Details */}
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                      gap: '12px',
                      marginBottom: '16px'
                    }}>
                      <div>
                        <div style={{ fontSize: '0.7rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>
                          Pickup Origin & Detour
                        </div>
                        <div style={{
                          fontSize: '0.875rem',
                          fontWeight: '700',
                          color: '#0f172a',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          marginTop: '2px'
                        }}>
                          <MapPin size={14} color="#2563eb" />
                          <span>{ride.origin_address_text}</span>
                        </div>
                        <div style={{
                          fontSize: '0.725rem',
                          color: '#059669',
                          fontWeight: '600',
                          marginTop: '2px'
                        }}>
                          ≈ {ride.detour_distance_km} detour from your pickup
                        </div>
                      </div>

                      <div>
                        <div style={{ fontSize: '0.7rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>
                          Departure Time
                        </div>
                        <div style={{
                          fontSize: '0.875rem',
                          fontWeight: '700',
                          color: '#0f172a',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          marginTop: '2px'
                        }}>
                          <Clock size={14} color="#2563eb" />
                          <span>{dateString} at {timeString}</span>
                        </div>
                        <div style={{ fontSize: '0.725rem', color: '#64748b', marginTop: '2px' }}>
                          {ride.available_seats} seat{ride.available_seats > 1 ? 's' : ''} available
                        </div>
                      </div>
                    </div>

                    {/* Vehicle & Footer Bar */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      paddingTop: '12px',
                      borderTop: '1px solid #f1f5f9',
                      flexWrap: 'wrap',
                      gap: '12px'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '3px 8px',
                          borderRadius: '6px',
                          background: '#f8fafc',
                          border: '1px solid #e2e8f0',
                          color: '#334155',
                          fontSize: '0.75rem',
                          fontWeight: '600',
                          textTransform: 'capitalize'
                        }}>
                          <Car size={13} color="#64748b" />
                          <span>{ride.vehicle.vehicle_type}</span>
                        </span>

                        <span style={{
                          fontSize: '0.75rem',
                          color: '#64748b',
                          fontFamily: 'monospace',
                          fontWeight: '700'
                        }}>
                          {ride.vehicle.vehicle_number}
                        </span>
                      </div>

                      {ride.is_own_ride ? (
                        <div style={{
                          padding: '8px 14px',
                          borderRadius: '10px',
                          background: '#f1f5f9',
                          border: '1px solid #cbd5e1',
                          color: '#475569',
                          fontWeight: '700',
                          fontSize: '0.825rem',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}>
                          <span>Your Offered Ride</span>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleRequestRide(ride.id, ride.driver.name)}
                          disabled={isRequested}
                          style={{
                            padding: '9px 18px',
                            borderRadius: '10px',
                            background: isRequested ? '#10b981' : '#2563eb',
                            color: '#ffffff',
                            fontWeight: '700',
                            fontSize: '0.85rem',
                            border: 'none',
                            cursor: isRequested ? 'default' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            boxShadow: isRequested ? 'none' : '0 2px 8px rgba(37, 99, 235, 0.25)',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          {isRequested ? (
                            <>
                              <CheckCircle size={15} />
                              <span>Request Sent</span>
                            </>
                          ) : (
                            <>
                              <span>Request Seat</span>
                              <ArrowRight size={15} />
                            </>
                          )}
                        </button>
                      )}
                    </div>

                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer info bar */}
        <div style={{
          padding: '14px 24px',
          background: '#ffffff',
          borderTop: '1px solid #e2e8f0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '0.78rem',
          color: '#64748b'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Info size={14} color="#2563eb" />
            <span>Multi-criteria ranking combines 50% driver reliability rating and 50% fuel cost score.</span>
          </div>
          <button
            onClick={() => {
              onClose();
              onModifySearch && onModifySearch();
            }}
            style={{
              background: 'none',
              border: 'none',
              color: '#2563eb',
              fontWeight: '700',
              cursor: 'pointer',
              textDecoration: 'underline'
            }}
          >
            Modify Search
          </button>
        </div>
      </div>
    </div>
  );
}
