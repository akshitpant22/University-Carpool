import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import Navbar from './components/Navbar';
import AuthModal from './components/AuthModal';
import IdCardModal from './components/IdCardModal';
import { Search, PlusCircle, ShieldCheck, AlertTriangle, ArrowRight, MapPin, Users, HeartHandshake } from 'lucide-react';

function Dashboard() {
  const { user, profile } = useAuth();
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isIdUploadOpen, setIsIdUploadOpen] = useState(false);

  const handleAction = (actionType) => {
    if (!user) {
      setIsAuthOpen(true);
      return;
    }

    if (profile?.verification_status !== 'verified') {
      setIsIdUploadOpen(true);
      return;
    }

    alert(`Action: ${actionType} - Module ready for Milestone 2 & 3!`);
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#f8fafc' }}>
      <Navbar
        onOpenAuth={() => setIsAuthOpen(true)}
        onOpenIdUpload={() => setIsIdUploadOpen(true)}
      />

      <main style={{ flex: 1, maxWidth: '1000px', width: '100%', margin: '0 auto', padding: '32px 20px' }}>
        {/* Verification Status Warning Banners */}
        {user && profile?.verification_status === 'pending' && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 18px',
            borderRadius: '12px',
            background: '#fffbeb',
            border: '1px solid #fde68a',
            marginBottom: '28px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <AlertTriangle size={22} color="#b45309" />
              <div>
                <div style={{ fontWeight: '700', fontSize: '0.925rem', color: '#92400e' }}>
                  Student Verification Under Review
                </div>
                <div style={{ fontSize: '0.825rem', color: '#b45309' }}>
                  {profile?.id_card_image_url
                    ? 'Your ID card is being verified by campus administration. You currently have read-only access.'
                    : 'Action required: Upload your Student ID card to unlock ride posting and booking.'}
                </div>
              </div>
            </div>
            {!profile?.id_card_image_url && (
              <button
                onClick={() => setIsIdUploadOpen(true)}
                style={{
                  padding: '8px 14px',
                  borderRadius: '8px',
                  background: '#d97706',
                  color: '#ffffff',
                  fontWeight: '600',
                  fontSize: '0.825rem',
                  border: 'none',
                  cursor: 'pointer'
                }}
              >
                Upload ID Card
              </button>
            )}
          </div>
        )}

        {/* Hero Section */}
        <section style={{ textAlign: 'center', marginBottom: '40px' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 14px',
            borderRadius: '9999px',
            background: '#eff6ff',
            border: '1px solid #bfdbfe',
            color: '#1d4ed8',
            fontSize: '0.8rem',
            fontWeight: '600',
            marginBottom: '16px'
          }}>
            <ShieldCheck size={14} /> Exclusively for Graphic Era Hill University (GEHU)
          </div>
          <h1 style={{
            fontSize: '2.4rem',
            fontWeight: '800',
            color: '#0f172a',
            letterSpacing: '-0.8px',
            lineHeight: 1.2,
            marginBottom: '12px'
          }}>
            Smart Campus Carpool & Ride Sharing
          </h1>
          <p style={{
            fontSize: '1.05rem',
            color: '#64748b',
            maxWidth: '620px',
            margin: '0 auto',
            lineHeight: 1.5
          }}>
            Connect safely with verified classmates and faculty for your daily college commute. 
            Reduce campus traffic, cut travel costs, and travel together.
          </p>
        </section>

        {/* Primary Equal-Weight Action Cards (As specified in SRS) */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '20px',
          marginBottom: '48px'
        }}>
          {/* Card 1: Find a Ride */}
          <div style={{
            background: '#ffffff',
            borderRadius: '16px',
            padding: '28px',
            border: '1px solid #e2e8f0',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            transition: 'transform 0.2s, box-shadow 0.2s'
          }}>
            <div>
              <div style={{
                width: '48px',
                height: '48px',
                borderRadius: '12px',
                background: '#eff6ff',
                color: '#2563eb',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '16px'
              }}>
                <Search size={24} />
              </div>
              <h2 style={{ fontSize: '1.4rem', fontWeight: '800', color: '#0f172a', marginBottom: '8px' }}>
                Find a Ride
              </h2>
              <p style={{ fontSize: '0.925rem', color: '#64748b', lineHeight: 1.5, marginBottom: '24px' }}>
                Need to reach campus for exams or single-period classes? Discover peers traveling along your route with empty seats.
              </p>
            </div>
            <button
              onClick={() => handleAction('find_ride')}
              style={{
                width: '100%',
                padding: '14px',
                borderRadius: '10px',
                background: '#2563eb',
                color: '#ffffff',
                fontWeight: '700',
                fontSize: '1rem',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px'
              }}
            >
              <span>Search Rides</span>
              <ArrowRight size={18} />
            </button>
          </div>

          {/* Card 2: Offer a Ride */}
          <div style={{
            background: '#ffffff',
            borderRadius: '16px',
            padding: '28px',
            border: '1px solid #e2e8f0',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between'
          }}>
            <div>
              <div style={{
                width: '48px',
                height: '48px',
                borderRadius: '12px',
                background: '#f8fafc',
                color: '#0f172a',
                border: '1px solid #e2e8f0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '16px'
              }}>
                <PlusCircle size={24} />
              </div>
              <h2 style={{ fontSize: '1.4rem', fontWeight: '800', color: '#0f172a', marginBottom: '8px' }}>
                Offer a Ride
              </h2>
              <p style={{ fontSize: '0.925rem', color: '#64748b', lineHeight: 1.5, marginBottom: '24px' }}>
                Driving to GEHU by scooty, bike, or car today? Post your ad-hoc route, share fuel costs, and help reduce campus congestion.
              </p>
            </div>
            <button
              onClick={() => handleAction('offer_ride')}
              style={{
                width: '100%',
                padding: '14px',
                borderRadius: '10px',
                background: '#0f172a',
                color: '#ffffff',
                fontWeight: '700',
                fontSize: '1rem',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px'
              }}
            >
              <span>Post Your Ride</span>
              <ArrowRight size={18} />
            </button>
          </div>
        </div>

        {/* Community Trust Features */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: '16px',
          background: '#ffffff',
          padding: '24px',
          borderRadius: '14px',
          border: '1px solid #e2e8f0'
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
            <MapPin size={22} color="#2563eb" style={{ marginTop: '2px', flexShrink: 0 }} />
            <div>
              <div style={{ fontWeight: '700', fontSize: '0.9rem', color: '#0f172a' }}>College &harr; Home Only</div>
              <div style={{ fontSize: '0.8rem', color: '#64748b' }}>Restricted to campus commute corridors, not commercial ride-hailing.</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
            <Users size={22} color="#2563eb" style={{ marginTop: '2px', flexShrink: 0 }} />
            <div>
              <div style={{ fontWeight: '700', fontSize: '0.9rem', color: '#0f172a' }}>Unified Profiles</div>
              <div style={{ fontSize: '0.8rem', color: '#64748b' }}>Drive one day, ride another. No rigid driver or rider account types.</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
            <HeartHandshake size={22} color="#2563eb" style={{ marginTop: '2px', flexShrink: 0 }} />
            <div>
              <div style={{ fontWeight: '700', fontSize: '0.9rem', color: '#0f172a' }}>Direct Peer UPI</div>
              <div style={{ fontSize: '0.8rem', color: '#64748b' }}>Settled directly bank-to-bank after completion with zero platform cut.</div>
            </div>
          </div>
        </div>
      </main>

      {/* Modals */}
      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        onSignupSuccess={() => setIsIdUploadOpen(true)}
      />

      <IdCardModal
        isOpen={isIdUploadOpen}
        onClose={() => setIsIdUploadOpen(false)}
      />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Dashboard />
    </AuthProvider>
  );
}
