import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { X, UploadCloud, Shield, CheckCircle2, AlertCircle } from 'lucide-react';

export default function IdCardModal({ isOpen, onClose }) {
  const { uploadIdCard, profile } = useAuth();
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  if (!isOpen) return null;

  const handleFileChange = (e) => {
    const selected = e.target.files[0];
    if (!selected) return;

    if (!['image/jpeg', 'image/png'].includes(selected.type)) {
      setError('Only JPG or PNG images are supported.');
      return;
    }

    if (selected.size > 5 * 1024 * 1024) {
      setError('File size must be under 5MB.');
      return;
    }

    setFile(selected);
    setError('');
    setPreview(URL.createObjectURL(selected));
  };

  const handleUpload = async () => {
    if (!file) {
      setError('Please select an ID card image.');
      return;
    }

    setUploading(true);
    setError('');

    try {
      await uploadIdCard(file);
      setSuccess(true);
      setTimeout(() => {
        onClose();
        setSuccess(false);
        setFile(null);
        setPreview(null);
      }, 2000);
    } catch (err) {
      setError(err.message || 'Failed to upload ID card.');
    } finally {
      setUploading(false);
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
        maxWidth: '460px',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
        position: 'relative',
        padding: '24px'
      }}>
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

        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '12px',
            background: '#eff6ff',
            color: '#2563eb',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 12px auto'
          }}>
            <Shield size={26} />
          </div>
          <h2 style={{ fontSize: '1.3rem', fontWeight: '800', color: '#0f172a' }}>
            Upload Student ID Card
          </h2>
          <p style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '4px' }}>
            Required for community trust & safety before offering or booking rides.
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

        {success ? (
          <div style={{
            padding: '24px',
            textAlign: 'center',
            background: '#ecfdf5',
            borderRadius: '12px',
            border: '1px solid #a7f3d0'
          }}>
            <CheckCircle2 size={36} color="#059669" style={{ margin: '0 auto 10px auto' }} />
            <h3 style={{ fontSize: '1.05rem', fontWeight: '700', color: '#065f46' }}>
              ID Card Submitted!
            </h3>
            <p style={{ fontSize: '0.85rem', color: '#047857', marginTop: '4px' }}>
              Your document is safely stored and queued for admin review.
            </p>
          </div>
        ) : (
          <div>
            <label style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '28px 16px',
              borderRadius: '12px',
              border: '2px dashed #cbd5e1',
              background: '#f8fafc',
              cursor: 'pointer',
              marginBottom: '18px'
            }}>
              <input
                type="file"
                accept="image/png, image/jpeg"
                onChange={handleFileChange}
                style={{ display: 'none' }}
              />
              {preview ? (
                <div style={{ textAlign: 'center' }}>
                  <img
                    src={preview}
                    alt="ID Preview"
                    style={{
                      maxHeight: '160px',
                      borderRadius: '8px',
                      boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
                      marginBottom: '8px'
                    }}
                  />
                  <div style={{ fontSize: '0.78rem', color: '#2563eb', fontWeight: '600' }}>
                    Click to choose a different photo
                  </div>
                </div>
              ) : (
                <>
                  <UploadCloud size={38} color="#94a3b8" style={{ marginBottom: '8px' }} />
                  <div style={{ fontSize: '0.9rem', fontWeight: '600', color: '#1e293b' }}>
                    Upload Student ID Photo
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>
                    PNG or JPG (Max 5MB)
                  </div>
                </>
              )}
            </label>

            <button
              onClick={handleUpload}
              disabled={uploading || !file}
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '8px',
                background: '#2563eb',
                color: '#ffffff',
                fontWeight: '700',
                fontSize: '0.95rem',
                border: 'none',
                cursor: uploading || !file ? 'not-allowed' : 'pointer',
                opacity: uploading || !file ? 0.6 : 1
              }}
            >
              {uploading ? 'Uploading to Private Vault...' : 'Submit for Verification'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
