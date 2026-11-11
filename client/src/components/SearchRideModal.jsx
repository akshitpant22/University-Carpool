import React, { useState } from 'react';
import {
  X,
  Search,
  MapPin,
  Clock,
  Sliders,
  Shield,
  Compass,
  AlertCircle,
  Loader2,
  Sparkles
} from 'lucide-react';
import { api } from '../services/api';

// Popular commute origins in Dehradun connecting to GEHU Campus (Bell Road, Clement Town)
const DEHRADUN_HUBS = [
  { name: 'Clock Tower (Ghanta Ghar)', lat: 30.3165, lng: 78.0322, hint: 'Central Dehradun (~6.2 km to GEHU)' },
  { name: 'ISBT Dehradun', lat: 30.2870, lng: 78.0050, hint: 'Haridwar Bypass corridor (~3.8 km to GEHU)' },
  { name: 'Prem Nagar Market', lat: 30.3340, lng: 77.9620, hint: 'Chakrata Road hub (~7.7 km to GEHU)' },
  { name: 'Ballupur Chowk', lat: 30.3390, lng: 78.0120, hint: 'GMS Road junction (~5.4 km to GEHU)' },
  { name: 'Clement Town / Subhash Nagar', lat: 30.2640, lng: 77.9990, hint: 'Campus neighborhood (~1.1 km to GEHU)' },
  { name: 'Rajpur Road (Jakhan)', lat: 30.3650, lng: 78.0720, hint: 'North corridor (~10.5 km to GEHU)' }
];

export default function SearchRideModal({
  isOpen,
  onClose,
  onSearchResults
}) {
  const [commuteDirection, setCommuteDirection] = useState('to_campus'); // 'to_campus' | 'from_campus' | 'all'
  const [selectedHub, setSelectedHub] = useState(DEHRADUN_HUBS[0]);
  const [customOrigin, setCustomOrigin] = useState('');
  const [isCustom, setIsCustom] = useState(false);
  const [isFlexibleTime, setIsFlexibleTime] = useState(true);
  const [departureTime, setDepartureTime] = useState(() => {
    const now = new Date(Date.now() + 30 * 60 * 1000);
    now.setMinutes(Math.ceil(now.getMinutes() / 5) * 5);
    return now.toISOString().slice(0, 16);
  });
  const [maxDetourKm, setMaxDetourKm] = useState(1.5); // Realistic student corridor detour (1.5 km)
  const [genderPref, setGenderPref] = useState('no_preference');
  const [riderGender, setRiderGender] = useState('male');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSelectHub = (hub) => {
    setSelectedHub(hub);
    setIsCustom(false);
    setCustomOrigin('');
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const pickupAddress = isCustom && customOrigin.trim()
        ? customOrigin.trim()
        : selectedHub.name;

      const pickupLat = isCustom ? 30.3165 : selectedHub.lat;
      const pickupLng = isCustom ? 78.0322 : selectedHub.lng;

      const queryParams = new URLSearchParams({
        pickup_address_text: pickupAddress,
        pickup_lat: pickupLat.toString(),
        pickup_lng: pickupLng.toString(),
        max_detour_meters: Math.round(maxDetourKm * 1000).toString(),
        gender_preference: genderPref,
        rider_gender: riderGender,
        commute_direction: commuteDirection,
        flexible_time: isFlexibleTime ? 'true' : 'false'
      });

      if (!isFlexibleTime && departureTime) {
        queryParams.append('departure_time', new Date(departureTime).toISOString());
      }

      const res = await api.get(`/rides/search?${queryParams.toString()}`);

      if (res.success && res.data) {
        onSearchResults(res.data, {
          pickup_address_text: pickupAddress,
          max_detour_km: maxDetourKm,
          gender_preference: genderPref,
          departure_time: isFlexibleTime ? 'Any upcoming ride' : departureTime,
          commute_direction: commuteDirection
        });
        onClose();
      } else {
        throw new Error(res.error?.message || 'Search failed');
      }
    } catch (err) {
      console.error('[SearchRideModal] Error:', err);
      setError(err.message || 'Failed to search rides. Please try again.');
    } finally {
      setLoading(false);
    }
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
        maxWidth: '560px',
        width: '100%',
        maxHeight: '90vh',
        overflowY: 'auto',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        border: '1px solid #e2e8f0'
      }}>
        {/* Modal Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '20px 24px',
          borderBottom: '1px solid #f1f5f9',
          background: 'linear-gradient(135deg, #f8fafc 0%, #eff6ff 100%)',
          borderTopLeftRadius: '20px',
          borderTopRightRadius: '20px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              background: '#2563eb',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Search size={18} />
            </div>
            <div>
              <h3 style={{ fontSize: '1.15rem', fontWeight: '800', color: '#0f172a', margin: 0 }}>
                Find a Campus Commute Ride
              </h3>
              <p style={{ fontSize: '0.78rem', color: '#64748b', margin: 0 }}>
                PostGIS detour search & ML semantic matching to GEHU Campus
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              padding: '6px',
              cursor: 'pointer',
              color: '#64748b',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <X size={18} />
          </button>
        </div>

        {error && (
          <div style={{
            margin: '16px 24px 0',
            padding: '12px 14px',
            borderRadius: '10px',
            background: '#fef2f2',
            border: '1px solid #fecaca',
            color: '#b91c1c',
            fontSize: '0.825rem',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSearch} style={{ padding: '24px' }}>
          {/* Commute Direction Selector (Campus Anchor) */}
          <div style={{
            marginBottom: '20px',
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            padding: '12px 14px',
            borderRadius: '12px'
          }}>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#1e293b', marginBottom: '8px' }}>
              Commute Direction *
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px' }}>
              <button
                type="button"
                onClick={() => setCommuteDirection('to_campus')}
                style={{
                  padding: '7px 8px',
                  borderRadius: '8px',
                  border: commuteDirection === 'to_campus' ? '2px solid #2563eb' : '1px solid #cbd5e1',
                  background: commuteDirection === 'to_campus' ? '#eff6ff' : '#ffffff',
                  color: commuteDirection === 'to_campus' ? '#1d4ed8' : '#475569',
                  fontWeight: '700',
                  fontSize: '0.75rem',
                  cursor: 'pointer'
                }}
              >
                To Campus
              </button>
              <button
                type="button"
                onClick={() => setCommuteDirection('from_campus')}
                style={{
                  padding: '7px 8px',
                  borderRadius: '8px',
                  border: commuteDirection === 'from_campus' ? '2px solid #2563eb' : '1px solid #cbd5e1',
                  background: commuteDirection === 'from_campus' ? '#eff6ff' : '#ffffff',
                  color: commuteDirection === 'from_campus' ? '#1d4ed8' : '#475569',
                  fontWeight: '700',
                  fontSize: '0.75rem',
                  cursor: 'pointer'
                }}
              >
                From Campus
              </button>
              <button
                type="button"
                onClick={() => setCommuteDirection('all')}
                style={{
                  padding: '7px 8px',
                  borderRadius: '8px',
                  border: commuteDirection === 'all' ? '2px solid #2563eb' : '1px solid #cbd5e1',
                  background: commuteDirection === 'all' ? '#eff6ff' : '#ffffff',
                  color: commuteDirection === 'all' ? '#1d4ed8' : '#475569',
                  fontWeight: '700',
                  fontSize: '0.75rem',
                  cursor: 'pointer'
                }}
              >
                Any Direction
              </button>
            </div>
          </div>

          {/* Section 1: Pickup / Dropoff Location */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '0.85rem',
              fontWeight: '700',
              color: '#1e293b',
              marginBottom: '8px'
            }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <MapPin size={15} color="#2563eb" />
                {commuteDirection === 'from_campus' ? 'Your Dropoff Corridor Landmark' : 'Your Pickup Landmark (Dehradun)'}
              </span>
              <button
                type="button"
                onClick={() => setIsCustom(!isCustom)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#2563eb',
                  fontSize: '0.75rem',
                  fontWeight: '600',
                  cursor: 'pointer',
                  textDecoration: 'underline'
                }}
              >
                {isCustom ? 'Use Presets' : '+ Custom Landmark'}
              </button>
            </label>

            {isCustom ? (
              <input
                type="text"
                value={customOrigin}
                onChange={(e) => setCustomOrigin(e.target.value)}
                placeholder="e.g. Saharanpur Chowk, IT Park, Patel Nagar..."
                required
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  border: '1.5px solid #2563eb',
                  fontSize: '0.9rem',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            ) : (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: '8px'
              }}>
                {DEHRADUN_HUBS.map((hub) => {
                  const isSelected = selectedHub.name === hub.name;
                  return (
                    <button
                      key={hub.name}
                      type="button"
                      onClick={() => handleSelectHub(hub)}
                      style={{
                        padding: '10px 12px',
                        borderRadius: '10px',
                        border: isSelected ? '2px solid #2563eb' : '1px solid #e2e8f0',
                        background: isSelected ? '#eff6ff' : '#f8fafc',
                        color: isSelected ? '#1d4ed8' : '#334155',
                        textAlign: 'left',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        boxSizing: 'border-box'
                      }}
                    >
                      <div style={{ fontWeight: '700', fontSize: '0.825rem' }}>
                        {hub.name}
                      </div>
                      <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '2px' }}>
                        {hub.hint}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Campus Anchor Notice */}
          <div style={{
            padding: '9px 12px',
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: '10px',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <Compass size={16} color="#059669" />
            <div style={{ fontSize: '0.78rem', color: '#475569' }}>
              <span style={{ fontWeight: '700', color: '#0f172a' }}>Fixed Campus Route:</span> Strictly restricted to Graphic Era Hill University (GEHU Campus), Dehradun commutes.
            </div>
          </div>

          {/* Section 2: Departure Time & Flexible Option */}
          <div style={{ marginBottom: '20px' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '6px'
            }}>
              <label style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '0.85rem',
                fontWeight: '700',
                color: '#1e293b'
              }}>
                <Clock size={15} color="#2563eb" />
                Departure Timing
              </label>
              <label style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '0.75rem',
                color: '#2563eb',
                cursor: 'pointer',
                fontWeight: '600'
              }}>
                <input
                  type="checkbox"
                  checked={isFlexibleTime}
                  onChange={(e) => setIsFlexibleTime(e.target.checked)}
                />
                Show all upcoming rides
              </label>
            </div>

            {!isFlexibleTime ? (
              <input
                type="datetime-local"
                value={departureTime}
                onChange={(e) => setDepartureTime(e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '10px',
                  border: '1px solid #cbd5e1',
                  fontSize: '0.875rem',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            ) : (
              <div style={{
                padding: '8px 12px',
                borderRadius: '8px',
                background: '#eff6ff',
                border: '1px solid #bfdbfe',
                color: '#1d4ed8',
                fontSize: '0.78rem',
                fontWeight: '600'
              }}>
                Searching all active posted rides departing today & upcoming days
              </div>
            )}
          </div>

          {/* Section 3: Detour Tolerance Slider (0.5 km to 3.0 km - Realistic student corridor detour) */}
          <div style={{ marginBottom: '20px' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '6px'
            }}>
              <label style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '0.85rem',
                fontWeight: '700',
                color: '#1e293b'
              }}>
                <Sliders size={15} color="#2563eb" />
                Route Corridor Detour Tolerance
              </label>
              <span style={{
                fontWeight: '800',
                fontSize: '0.85rem',
                color: '#2563eb',
                background: '#eff6ff',
                padding: '2px 8px',
                borderRadius: '6px',
                border: '1px solid #bfdbfe'
              }}>
                {maxDetourKm.toFixed(1)} km
              </span>
            </div>
            <input
              type="range"
              min="0.5"
              max="3.0"
              step="0.5"
              value={maxDetourKm}
              onChange={(e) => setMaxDetourKm(parseFloat(e.target.value))}
              style={{ width: '100%', accentColor: '#2563eb', cursor: 'pointer' }}
            />
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '0.7rem',
              color: '#94a3b8',
              marginTop: '4px'
            }}>
              <span>0.5 km (Strict corridor)</span>
              <span>1.5 km (Standard walk/pickup)</span>
              <span>3.0 km (Max detour)</span>
            </div>
          </div>


          {/* Section 4: Mutual Gender Safety Preference */}
          <div style={{
            marginBottom: '26px',
            padding: '14px',
            borderRadius: '12px',
            background: '#faf5ff',
            border: '1px solid #e9d5ff'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '0.85rem',
              fontWeight: '700',
              color: '#6b21a8',
              marginBottom: '8px'
            }}>
              <Shield size={16} color="#9333ea" />
              Mutual Gender Safety Preference
            </div>
            <p style={{ fontSize: '0.75rem', color: '#7e22ce', margin: '0 0 10px 0' }}>
              Enforces bidirectional safety: rides are matched only if both your preference and the driver's preference are mutually satisfied.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setGenderPref('no_preference')}
                style={{
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: genderPref === 'no_preference' ? '2px solid #9333ea' : '1px solid #e9d5ff',
                  background: genderPref === 'no_preference' ? '#f3e8ff' : '#ffffff',
                  color: genderPref === 'no_preference' ? '#581c87' : '#6b21a8',
                  fontWeight: '700',
                  fontSize: '0.8rem',
                  cursor: 'pointer'
                }}
              >
                Any Gender
              </button>

              <button
                type="button"
                onClick={() => setGenderPref('same_gender_only')}
                style={{
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: genderPref === 'same_gender_only' ? '2px solid #9333ea' : '1px solid #e9d5ff',
                  background: genderPref === 'same_gender_only' ? '#f3e8ff' : '#ffffff',
                  color: genderPref === 'same_gender_only' ? '#581c87' : '#6b21a8',
                  fontWeight: '700',
                  fontSize: '0.8rem',
                  cursor: 'pointer'
                }}
              >
                Same Gender Only
              </button>
            </div>

            {genderPref === 'same_gender_only' && (
              <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: '600', color: '#6b21a8' }}>Your Gender:</span>
                <select
                  value={riderGender}
                  onChange={(e) => setRiderGender(e.target.value)}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '6px',
                    border: '1px solid #d8b4fe',
                    background: '#ffffff',
                    fontSize: '0.8rem',
                    color: '#581c87'
                  }}
                >
                  <option value="female">Female</option>
                  <option value="male">Male</option>
                </select>
              </div>
            )}
          </div>

          {/* Submit Search Button */}
          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '14px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
              color: '#ffffff',
              fontWeight: '800',
              fontSize: '1rem',
              border: 'none',
              cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)'
            }}
          >
            {loading ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                <span>Running PostGIS & ML Matching Engine...</span>
              </>
            ) : (
              <>
                <Sparkles size={18} />
                <span>Find Ranked Rides</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
