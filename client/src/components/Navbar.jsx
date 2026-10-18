import React from 'react';
import { useAuth } from '../context/AuthContext';
import { Car, ShieldCheck, Clock, User, LogOut, PlusCircle, Compass } from 'lucide-react';

export default function Navbar({ onOpenAuth, onOpenIdUpload, onOpenVehicles, onOpenMyRides }) {
  const { user, profile, logout } = useAuth();

  return (
    <nav style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '14px 24px',
      background: '#ffffff',
      borderBottom: '1px solid #e2e8f0',
      position: 'sticky',
      top: 0,
      zIndex: 40
    }}>
      {/* Brand */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{
          width: '40px',
          height: '40px',
          borderRadius: '10px',
          background: 'linear-gradient(135deg, #2563eb 0%, #1e40af 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#ffffff'
        }}>
          <Car size={22} />
        </div>
        <div>
          <div style={{ fontWeight: '800', fontSize: '1.15rem', color: '#0f172a', letterSpacing: '-0.3px' }}>
            Campus Carpool
          </div>
          <div style={{ fontSize: '0.75rem', fontWeight: '600', color: '#64748b' }}>
            GEHU Dehradun
          </div>
        </div>
      </div>

      {/* Nav Actions & Auth Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {user ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {/* Quick Navigation Links */}
            <button
              onClick={onOpenVehicles}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '6px 12px',
                borderRadius: '8px',
                fontSize: '0.825rem',
                fontWeight: '600',
                background: '#f8fafc',
                border: '1px solid #cbd5e1',
                color: '#334155',
                cursor: 'pointer'
              }}
            >
              <Car size={15} color="#2563eb" />
              <span>My Vehicles</span>
            </button>

            <button
              onClick={onOpenMyRides}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '6px 12px',
                borderRadius: '8px',
                fontSize: '0.825rem',
                fontWeight: '600',
                background: '#f8fafc',
                border: '1px solid #cbd5e1',
                color: '#334155',
                cursor: 'pointer'
              }}
            >
              <Compass size={15} color="#2563eb" />
              <span>My Rides</span>
            </button>

            {/* Verification Status Badge */}
            {profile?.verification_status === 'verified' ? (
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '5px 10px',
                borderRadius: '9999px',
                fontSize: '0.75rem',
                fontWeight: '600',
                background: '#ecfdf5',
                color: '#065f46',
                border: '1px solid #a7f3d0'
              }}>
                <ShieldCheck size={14} /> Verified Student
              </span>
            ) : (
              <button
                onClick={onOpenIdUpload}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '5px 10px',
                  borderRadius: '9999px',
                  fontSize: '0.75rem',
                  fontWeight: '600',
                  background: '#fffbeb',
                  color: '#92400e',
                  border: '1px solid #fde68a',
                  cursor: 'pointer'
                }}
              >
                <Clock size={14} /> ID Pending Review
              </button>
            )}

            {/* User Details */}
            <div style={{ textAlign: 'right', marginLeft: '4px' }}>
              <div style={{ fontWeight: '700', fontSize: '0.875rem', color: '#0f172a' }}>
                {profile?.name || user.email.split('@')[0]}
              </div>
              <div style={{ fontSize: '0.725rem', color: '#64748b' }}>
                {profile?.branch ? `${profile.course || 'Student'} • ${profile.branch}` : user.email}
              </div>
            </div>

            {/* Logout Button */}
            <button
              onClick={logout}
              title="Sign Out"
              style={{
                background: '#f1f5f9',
                border: 'none',
                padding: '8px',
                borderRadius: '8px',
                color: '#475569',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center'
              }}
            >
              <LogOut size={16} />
            </button>
          </div>
        ) : (
          <button
            onClick={onOpenAuth}
            style={{
              padding: '8px 18px',
              borderRadius: '8px',
              background: '#2563eb',
              color: '#ffffff',
              fontWeight: '600',
              fontSize: '0.9rem',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <User size={16} /> Sign In / Register
          </button>
        )}
      </div>
    </nav>
  );
}
