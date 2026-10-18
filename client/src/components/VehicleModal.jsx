import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { X, Car, Bike, Trash2, Plus, AlertCircle, CheckCircle2, Shield } from 'lucide-react';

export default function VehicleModal({ isOpen, onClose, onVehicleAdded }) {
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [formData, setFormData] = useState({
    vehicle_type: 'car',
    vehicle_number: '',
    seat_capacity: 4
  });

  const fetchVehicles = async () => {
    setLoading(true);
    try {
      const res = await api.get('/vehicles/mine');
      if (res.success) {
        setVehicles(res.data.vehicles || []);
        if (res.data.vehicles.length === 0) {
          setShowAddForm(true);
        }
      }
    } catch (err) {
      setError(err.message || 'Failed to load vehicles');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setError('');
      setSuccess('');
      fetchVehicles();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleTypeChange = (type) => {
    let defaultSeats = 1;
    if (type === 'car') defaultSeats = 4;
    setFormData(prev => ({
      ...prev,
      vehicle_type: type,
      seat_capacity: defaultSeats
    }));
  };

  const handleAddVehicle = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!formData.vehicle_number.trim()) {
      setError('Please provide your vehicle registration number.');
      return;
    }

    try {
      const res = await api.post('/vehicles', {
        vehicle_type: formData.vehicle_type,
        vehicle_number: formData.vehicle_number,
        seat_capacity: parseInt(formData.seat_capacity, 10)
      });

      if (res.success) {
        setSuccess('Vehicle registered successfully!');
        setFormData({ vehicle_type: 'car', vehicle_number: '', seat_capacity: 4 });
        setShowAddForm(false);
        await fetchVehicles();
        if (onVehicleAdded) onVehicleAdded(res.data.vehicle);
      }
    } catch (err) {
      setError(err.message || 'Failed to register vehicle.');
    }
  };

  const handleDeleteVehicle = async (vehicleId) => {
    if (!window.confirm('Are you sure you want to remove this vehicle?')) return;
    setError('');
    setSuccess('');

    try {
      const res = await api.delete(`/vehicles/${vehicleId}`);
      if (res.success) {
        setSuccess('Vehicle deleted successfully.');
        await fetchVehicles();
      }
    } catch (err) {
      setError(err.message || 'Failed to delete vehicle.');
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
        maxWidth: '520px',
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
          <h2 style={{ fontSize: '1.35rem', fontWeight: '800', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Car size={24} color="#2563eb" />
            My Registered Vehicles
          </h2>
          <p style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '4px' }}>
            Register your bike, scooty, or car to offer carpool rides to campus peers.
          </p>
        </div>

        {/* Alerts */}
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

        {/* Vehicle List */}
        {!showAddForm && (
          <div style={{ marginBottom: '20px' }}>
            {vehicles.length === 0 && !loading ? (
              <div style={{
                textAlign: 'center',
                padding: '32px 16px',
                background: '#f8fafc',
                borderRadius: '12px',
                border: '1px dashed #cbd5e1'
              }}>
                <Car size={36} color="#94a3b8" style={{ margin: '0 auto 8px auto' }} />
                <div style={{ fontWeight: '600', color: '#334155' }}>No vehicles registered yet</div>
                <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '4px' }}>
                  Add your vehicle below to start offering rides.
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {vehicles.map((v) => (
                  <div
                    key={v.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '14px',
                      background: '#f8fafc',
                      borderRadius: '10px',
                      border: '1px solid #e2e8f0'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: '8px',
                        background: '#eff6ff',
                        color: '#2563eb',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}>
                        {v.vehicle_type === 'car' ? <Car size={22} /> : <Bike size={22} />}
                      </div>
                      <div>
                        <div style={{ fontWeight: '700', fontSize: '0.95rem', color: '#0f172a' }}>
                          {v.vehicle_number}
                        </div>
                        <div style={{ fontSize: '0.78rem', color: '#64748b', textTransform: 'capitalize' }}>
                          {v.vehicle_type} • {v.seat_capacity} {v.seat_capacity === 1 ? 'passenger seat' : 'passenger seats'}
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => handleDeleteVehicle(v.id)}
                      title="Remove vehicle"
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#ef4444',
                        cursor: 'pointer',
                        padding: '6px',
                        borderRadius: '6px'
                      }}
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={() => { setShowAddForm(true); setError(''); }}
              style={{
                width: '100%',
                marginTop: '16px',
                padding: '12px',
                borderRadius: '8px',
                background: '#2563eb',
                color: '#ffffff',
                fontWeight: '700',
                fontSize: '0.9rem',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px'
              }}
            >
              <Plus size={18} /> Add New Vehicle
            </button>
          </div>
        )}

        {/* Add Vehicle Form */}
        {showAddForm && (
          <form onSubmit={handleAddVehicle} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', color: '#475569', marginBottom: '6px' }}>
                Vehicle Type
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                {[
                  { id: 'car', label: 'Car', icon: Car, defaultSeats: 4 },
                  { id: 'bike', label: 'Bike', icon: Bike, defaultSeats: 1 },
                  { id: 'scooty', label: 'Scooty', icon: Bike, defaultSeats: 1 }
                ].map((item) => {
                  const Icon = item.icon;
                  const isSelected = formData.vehicle_type === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleTypeChange(item.id)}
                      style={{
                        padding: '12px 8px',
                        borderRadius: '8px',
                        border: isSelected ? '2px solid #2563eb' : '1px solid #cbd5e1',
                        background: isSelected ? '#eff6ff' : '#ffffff',
                        color: isSelected ? '#1d4ed8' : '#475569',
                        fontWeight: '600',
                        fontSize: '0.85rem',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      <Icon size={20} />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', color: '#475569', marginBottom: '4px' }}>
                Vehicle Number Plate *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. UK 07 AB 1234"
                value={formData.vehicle_number}
                onChange={(e) => setFormData(prev => ({ ...prev, vehicle_number: e.target.value.toUpperCase() }))}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  fontSize: '0.9rem',
                  letterSpacing: '0.5px'
                }}
              />
            </div>

            {formData.vehicle_type === 'car' ? (
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', color: '#475569', marginBottom: '4px' }}>
                  Available Passenger Seats (Excluding Driver)
                </label>
                <input
                  type="number"
                  min="1"
                  max="8"
                  value={formData.seat_capacity}
                  onChange={(e) => setFormData(prev => ({ ...prev, seat_capacity: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.9rem'
                  }}
                />
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                  Standard cars offer 4 passenger seats (derived automatically, editable).
                </span>
              </div>
            ) : (
              <div style={{
                background: '#f1f5f9',
                padding: '10px 12px',
                borderRadius: '8px',
                fontSize: '0.78rem',
                color: '#475569'
              }}>
                Two-wheelers (Bikes/Scooties) automatically derive <strong>1 passenger seat</strong> in campus carpool safety standards.
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
              {vehicles.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  style={{
                    flex: 1,
                    padding: '12px',
                    borderRadius: '8px',
                    background: '#f1f5f9',
                    color: '#475569',
                    fontWeight: '600',
                    fontSize: '0.9rem',
                    border: 'none',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
              )}
              <button
                type="submit"
                style={{
                  flex: 2,
                  padding: '12px',
                  borderRadius: '8px',
                  background: '#2563eb',
                  color: '#ffffff',
                  fontWeight: '700',
                  fontSize: '0.9rem',
                  border: 'none',
                  cursor: 'pointer'
                }}
              >
                Save Vehicle
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
