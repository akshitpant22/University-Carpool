import React from 'react';

export default function App() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      textAlign: 'center'
    }}>
      <header style={{ maxWidth: '640px', width: '100%' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: '700', marginBottom: '8px', color: '#1e293b' }}>
          Campus Carpool Platform
        </h1>
        <p style={{ color: '#64748b', fontSize: '1rem', marginBottom: '32px' }}>
          Graphic Era Hill University, Dehradun
        </p>
        
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '16px',
          marginBottom: '32px'
        }}>
          <button style={{
            padding: '20px',
            borderRadius: '12px',
            backgroundColor: '#2563eb',
            color: '#ffffff',
            fontWeight: '600',
            fontSize: '1.1rem',
            boxShadow: '0 4px 12px rgba(37, 99, 235, 0.2)'
          }}>
            Find a Ride
          </button>
          <button style={{
            padding: '20px',
            borderRadius: '12px',
            backgroundColor: '#0f172a',
            color: '#ffffff',
            fontWeight: '600',
            fontSize: '1.1rem',
            boxShadow: '0 4px 12px rgba(15, 23, 42, 0.2)'
          }}>
            Offer a Ride
          </button>
        </div>

        <div style={{
          padding: '16px',
          background: '#e2e8f0',
          borderRadius: '8px',
          fontSize: '0.875rem',
          color: '#475569'
        }}>
          System initialized: Monorepo configured for 4-person engineering team.
        </div>
      </header>
    </div>
  );
}
