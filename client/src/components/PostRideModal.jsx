import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import {
  X,
  Car,
  Bike,
  MapPin,
  Calendar,
  Clock,
  IndianRupee,
  Shield,
  Users,
  AlertCircle,
  CheckCircle2,
  Plus
} from 'lucide-react';

// Popular commute origins for GEHU Dehradun students with verified coordinates
const POPULAR_DEHRADUN_HUBS = [
  { name: 'Clement Town / Subhash Nagar', lat: 30.2676, lng: 78.0062 },
  { name: 'ISBT Dehradun', lat: 30.2882, lng: 78.0074 },
  { name: 'Clock Tower (Ghanta Ghar)', lat: 30.3244, lng: 78.0418 },
  { name: 'Ballupur Chowk', lat: 30.3404, lng: 78.0163 },
  { name: 'Prem Nagar', lat: 30.3342, lng: 77.9620 },
  { name: 'Rispana Pul / Haridwar Bypass', lat: 30.2921, lng: 78.0531 },
  { name: 'Jakhan / Rajpur Road', lat: 30.3702, lng: 78.0772 },
  { name: 'Dharampur / Dalanwala', lat: 30.3090, lng: 78.0480 }
];

export default function PostRideModal({ isOpen, onClose, onOpenVehicleModal, onRidePosted }) {
  const { profile, refreshProfile } = useAuth();
  const [vehicles, setVehicles] = useState([]);
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Form states
  const [commuteDirection, setCommuteDirection] = useState('to_campus'); // 'to_campus' | 'from_campus'
  const [originType, setOriginType] = useState('hub'); // 'hub' | 'custom'
  const [selectedHub, setSelectedHub] = useState(POPULAR_DEHRADUN_HUBS[0].name);
  const [customOrigin, setCustomOrigin] = useState('');
  const [departureTime, setDepartureTime] = useState('');
  const [availableSeats, setAvailableSeats] = useState(1);
  const [isFreeRide, setIsFreeRide] = useState(false);
  const [pricePerSeat, setPricePerSeat] = useState('30');
  const [genderPreference, setGenderPreference] = useState('no_preference');
  const [dlNumber, setDlNumber] = useState('');


  // Initialize minimum departure time (10 mins from now)
  const getMinDateTime = () => {
    const now = new Date(Date.now() + 10 * 60 * 1000);
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    return now.toISOString().slice(0, 16);
  };

  const loadVehicles = async () => {
    setLoading(true);
    try {
      const res = await api.get('/vehicles/mine');
      if (res.success) {
        const vList = res.data.vehicles || [];
        setVehicles(vList);
        if (vList.length > 0) {
          setSelectedVehicle(vList[0]);
          setAvailableSeats(vList[0].seat_capacity);
        }
      }
    } catch (err) {
      console.warn('Error loading vehicles:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setError('');
      setSuccess('');
      setDepartureTime(getMinDateTime());
      if (profile?.dl_number) {
        setDlNumber(profile.dl_number);
      }
      loadVehicles();
    }
  }, [isOpen, profile]);

  if (!isOpen) return null;

  const handleVehicleChange = (vId) => {
    const found = vehicles.find(v => v.id === vId);
    if (found) {
      setSelectedVehicle(found);
      setAvailableSeats(found.seat_capacity);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    // Check verification status
    if (profile?.verification_status !== 'verified') {
      setError('Your student verification is currently under review. Only verified students may offer rides.');
      return;
    }

    // Check driving license
    const activeDl = profile?.dl_number || dlNumber.trim();
    if (!activeDl) {
      setError('Driving License number is required before offering a ride.');
      return;
    }

    if (!selectedVehicle) {
      setError('Please select a registered vehicle for this ride.');
      return;
    }

    let originText = '';
    let originLat = 30.2704;
    let originLng = 77.9944;

    if (originType === 'hub') {
      const hub = POPULAR_DEHRADUN_HUBS.find(h => h.name === selectedHub);
      originText = hub ? hub.name : selectedHub;
      if (hub) {
        originLat = hub.lat;
        originLng = hub.lng;
      }
    } else {
      if (!customOrigin.trim()) {
        setError('Please enter your pickup origin location.');
        return;
      }
      originText = customOrigin.trim();
    }

    setSubmitting(true);

    try {
      const payload = {
        vehicle_id: selectedVehicle.id,
        commute_direction: commuteDirection,
        origin_address_text: originText,
        origin_lat: originLat,
        origin_lng: originLng,
        departure_time: new Date(departureTime).toISOString(),
        available_seats: parseInt(availableSeats, 10),
        price_per_seat: isFreeRide ? null : (pricePerSeat ? parseFloat(pricePerSeat) : null),
        gender_preference: genderPreference,
        dl_number: activeDl
      };

      const res = await api.post('/rides', payload);

      if (res.success) {

        setSuccess('Ride posted successfully! Peers can now discover your ride.');
        if (refreshProfile) refreshProfile();
        setTimeout(() => {
          onClose();
          if (onRidePosted) onRidePosted(res.data.ride);
        }, 1800);
      }
    } catch (err) {
      setError(err.message || 'Failed to post ride.');
    } finally {
      setSubmitting(false);
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
        maxWidth: '560px',
        maxHeight: '92vh',
        overflowY: 'auto',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
        position: 'relative',
        padding: '26px'
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
          <h2 style={{ fontSize: '1.4rem', fontWeight: '800', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Car size={26} color="#0f172a" />
            Offer a Campus Ride
          </h2>
          <p style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '4px' }}>
            Driving to Graphic Era Hill University today? Share your empty seats with verified peers.
          </p>
        </div>

        {/* Feedback alerts */}
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

        {success && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 12px',
            borderRadius: '8px',
            background: '#ecfdf5',
            border: '1px solid #a7f3d0',
            color: '#065f46',
            fontSize: '0.825rem',
            marginBottom: '16px'
          }}>
            <CheckCircle2 size={16} />
            <span>{success}</span>
          </div>
        )}

        {/* Vehicle check prompt if user has no vehicles */}
        {vehicles.length === 0 && !loading ? (
          <div style={{
            background: '#fffbeb',
            border: '1px solid #fde68a',
            padding: '20px',
            borderRadius: '12px',
            textAlign: 'center'
          }}>
            <Car size={36} color="#d97706" style={{ margin: '0 auto 8px auto' }} />
            <h3 style={{ fontSize: '1.05rem', fontWeight: '700', color: '#92400e' }}>
              No Vehicles Registered
            </h3>
            <p style={{ fontSize: '0.85rem', color: '#b45309', margin: '6px 0 16px 0' }}>
              Before offering a ride, please register the vehicle (Bike, Scooty, or Car) you plan to commute with.
            </p>
            <button
              onClick={() => {
                onClose();
                if (onOpenVehicleModal) onOpenVehicleModal();
              }}
              style={{
                padding: '10px 20px',
                borderRadius: '8px',
                background: '#2563eb',
                color: '#ffffff',
                fontWeight: '700',
                fontSize: '0.9rem',
                border: 'none',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <Plus size={16} /> Register Vehicle Now
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Driving License Input if missing */}
            {!profile?.dl_number && (
              <div style={{
                background: '#eff6ff',
                border: '1px solid #bfdbfe',
                padding: '12px 14px',
                borderRadius: '10px'
              }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#1e40af', marginBottom: '4px' }}>
                  Driving License (DL) Number *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. UK0720210001234"
                  value={dlNumber}
                  onChange={(e) => setDlNumber(e.target.value.toUpperCase())}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    border: '1px solid #93c5fd',
                    fontSize: '0.875rem'
                  }}
                />
                <span style={{ fontSize: '0.725rem', color: '#3b82f6', marginTop: '3px', display: 'block' }}>
                  Per university safety guidelines, DL is required the first time you offer a ride as a driver.
                </span>
              </div>
            )}

            {/* Vehicle Selection */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: '600', color: '#475569' }}>
                  Vehicle for this Ride *
                </label>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    if (onOpenVehicleModal) onOpenVehicleModal();
                  }}
                  style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: '0.75rem', fontWeight: '600', cursor: 'pointer' }}
                >
                  + Add or Change Vehicles
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px' }}>
                {vehicles.map((v) => {
                  const isSel = selectedVehicle?.id === v.id;
                  const Icon = v.vehicle_type === 'car' ? Car : Bike;
                  return (
                    <div
                      key={v.id}
                      onClick={() => handleVehicleChange(v.id)}
                      style={{
                        padding: '10px',
                        borderRadius: '8px',
                        border: isSel ? '2px solid #2563eb' : '1px solid #cbd5e1',
                        background: isSel ? '#eff6ff' : '#ffffff',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                      }}
                    >
                      <Icon size={18} color={isSel ? '#2563eb' : '#64748b'} />
                      <div>
                        <div style={{ fontSize: '0.85rem', fontWeight: '700', color: isSel ? '#1d4ed8' : '#0f172a' }}>
                          {v.vehicle_number}
                        </div>
                        <div style={{ fontSize: '0.725rem', color: '#64748b', textTransform: 'capitalize' }}>
                          {v.vehicle_type} ({v.seat_capacity} max)
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Commute Direction Toggle (Anchored strictly to GEHU Campus) */}
            <div style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              padding: '12px 14px',
              borderRadius: '10px'
            }}>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#1e293b', marginBottom: '8px' }}>
                Commute Direction (Campus Centric) *
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setCommuteDirection('to_campus')}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: commuteDirection === 'to_campus' ? '2px solid #2563eb' : '1px solid #cbd5e1',
                    background: commuteDirection === 'to_campus' ? '#eff6ff' : '#ffffff',
                    color: commuteDirection === 'to_campus' ? '#1d4ed8' : '#475569',
                    fontWeight: '700',
                    fontSize: '0.8rem',
                    cursor: 'pointer'
                  }}
                >
                  Towards GEHU Campus
                </button>
                <button
                  type="button"
                  onClick={() => setCommuteDirection('from_campus')}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: commuteDirection === 'from_campus' ? '2px solid #2563eb' : '1px solid #cbd5e1',
                    background: commuteDirection === 'from_campus' ? '#eff6ff' : '#ffffff',
                    color: commuteDirection === 'from_campus' ? '#1d4ed8' : '#475569',
                    fontWeight: '700',
                    fontSize: '0.8rem',
                    cursor: 'pointer'
                  }}
                >
                  From GEHU Campus
                </button>
              </div>
            </div>

            {/* If commute is From Campus: Origin is GEHU */}
            {commuteDirection === 'from_campus' ? (
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', color: '#475569', marginBottom: '4px' }}>
                  Departure Point (Fixed Campus Origin)
                </label>
                <div style={{
                  padding: '10px 12px',
                  borderRadius: '8px',
                  background: '#f1f5f9',
                  border: '1px solid #e2e8f0',
                  fontSize: '0.85rem',
                  color: '#334155',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <MapPin size={16} color="#059669" />
                  <span><strong>Graphic Era Hill University (GEHU Campus)</strong>, Bell Road</span>
                </div>
              </div>
            ) : null}

            {/* Landmark Selection (Pickup if to_campus, Dropoff corridor if from_campus) */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: '600', color: '#475569', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <MapPin size={15} color="#2563eb" />
                  {commuteDirection === 'to_campus' ? 'Origin / Departure Point *' : 'Dropoff Corridor / Destination *'}
                </label>
                <div style={{ fontSize: '0.75rem', display: 'flex', gap: '8px' }}>
                  <span
                    onClick={() => setOriginType('hub')}
                    style={{
                      cursor: 'pointer',
                      fontWeight: originType === 'hub' ? '700' : 'normal',
                      color: originType === 'hub' ? '#2563eb' : '#64748b'
                    }}
                  >
                    Local Transit Hub
                  </span>
                  <span>|</span>
                  <span
                    onClick={() => setOriginType('custom')}
                    style={{
                      cursor: 'pointer',
                      fontWeight: originType === 'custom' ? '700' : 'normal',
                      color: originType === 'custom' ? '#2563eb' : '#64748b'
                    }}
                  >
                    Custom Landmark
                  </span>
                </div>
              </div>

              {originType === 'hub' ? (
                <select
                  value={selectedHub}
                  onChange={(e) => setSelectedHub(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.875rem'
                  }}
                >
                  {POPULAR_DEHRADUN_HUBS.map(hub => (
                    <option key={hub.name} value={hub.name}>{hub.name}</option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  placeholder={commuteDirection === 'to_campus' ? "e.g. Near Tea Stall, Ballupur Flyover" : "e.g. Prem Nagar Market, Chakrata Road"}
                  value={customOrigin}
                  onChange={(e) => setCustomOrigin(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.875rem'
                  }}
                />
              )}
            </div>

            {/* If commute is To Campus: Destination is GEHU */}
            {commuteDirection === 'to_campus' ? (
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', color: '#475569', marginBottom: '4px' }}>
                  Destination (Fixed Campus Commute)
                </label>
                <div style={{
                  padding: '10px 12px',
                  borderRadius: '8px',
                  background: '#f1f5f9',
                  border: '1px solid #e2e8f0',
                  fontSize: '0.85rem',
                  color: '#334155',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <MapPin size={16} color="#059669" />
                  <span><strong>Graphic Era Hill University (GEHU Campus)</strong>, Clement Town</span>
                </div>
              </div>
            ) : null}


            {/* Departure Time & Seats */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', color: '#475569', marginBottom: '4px' }}>
                  Departure Time *
                </label>
                <input
                  type="datetime-local"
                  required
                  min={getMinDateTime()}
                  value={departureTime}
                  onChange={(e) => setDepartureTime(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '9px 10px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.85rem'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', color: '#475569', marginBottom: '4px' }}>
                  Available Seats *
                </label>
                <select
                  value={availableSeats}
                  onChange={(e) => setAvailableSeats(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '9px 10px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.85rem'
                  }}
                >
                  {Array.from({ length: selectedVehicle?.seat_capacity || 1 }, (_, i) => i + 1).map(n => (
                    <option key={n} value={n}>{n} {n === 1 ? 'Seat' : 'Seats'}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Fuel Contribution & Gender Preference */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: '600', color: '#475569' }}>
                    Fuel Share / Seat
                  </label>
                  <label style={{ fontSize: '0.725rem', color: '#2563eb', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px' }}>
                    <input
                      type="checkbox"
                      checked={isFreeRide}
                      onChange={(e) => setIsFreeRide(e.target.checked)}
                    />
                    Free Ride
                  </label>
                </div>
                {!isFreeRide ? (
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: '10px', top: '10px', color: '#64748b', fontSize: '0.85rem' }}>₹</span>
                    <input
                      type="number"
                      min="0"
                      max="200"
                      step="5"
                      placeholder="e.g. 30"
                      value={pricePerSeat}
                      onChange={(e) => setPricePerSeat(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '9px 10px 9px 24px',
                        borderRadius: '8px',
                        border: '1px solid #cbd5e1',
                        fontSize: '0.85rem'
                      }}
                    />
                  </div>
                ) : (
                  <div style={{ padding: '9px 10px', background: '#ecfdf5', borderRadius: '8px', fontSize: '0.8rem', color: '#065f46', fontWeight: '600' }}>
                    Favor / Free Ride (₹0)
                  </div>
                )}
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', color: '#475569', marginBottom: '4px' }}>
                  Mutual Gender Filter
                </label>
                <select
                  value={genderPreference}
                  onChange={(e) => setGenderPreference(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '9px 10px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.85rem'
                  }}
                >
                  <option value="no_preference">No Preference (Open to all)</option>
                  <option value="same_gender_only">Same Gender Only</option>
                </select>
              </div>
            </div>

            {/* SRS Transparency Note */}
            <div style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              padding: '10px 12px',
              borderRadius: '8px',
              fontSize: '0.75rem',
              color: '#64748b',
              lineHeight: 1.4
            }}>
              💡 <strong>Early Posting Hint:</strong> Your ride will transparently display its posting time (e.g. <em>"Posted 45 min ago"</em>) to encourage peers to plan and request ahead of peak traffic.
            </div>

            <button
              type="submit"
              disabled={submitting}
              style={{
                width: '100%',
                padding: '13px',
                borderRadius: '8px',
                background: '#0f172a',
                color: '#ffffff',
                fontWeight: '700',
                fontSize: '0.95rem',
                border: 'none',
                cursor: submitting ? 'not-allowed' : 'pointer',
                opacity: submitting ? 0.7 : 1
              }}
            >
              {submitting ? 'Publishing Ride...' : 'Publish Campus Ride'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
