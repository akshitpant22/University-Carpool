import React, { useState, useEffect, useRef } from 'react';
import { api } from '../services/api';
import { socket } from '../socket';
import { useAuth } from '../context/AuthContext';
import { X, Send, AlertCircle, MessageCircle } from 'lucide-react';

function mergeMessages(existing, incoming) {
  const byId = new Map(existing.map((m) => [m.id, m]));
  incoming.forEach((m) => byId.set(m.id, m));
  return [...byId.values()].sort(
    (a, b) => new Date(a.sent_at) - new Date(b.sent_at)
  );
}

export default function ChatModal({ isOpen, onClose, rideId, partnerId, partnerName, rideLabel }) {
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const bottomRef = useRef(null);

  // Load history + subscribe to live messages
  useEffect(() => {
    if (!isOpen || !rideId || !partnerId || !user?.id) return;

    let cancelled = false;
    setMessages([]);
    setError('');
    setLoading(true);

    api.get(`/chat/${rideId}/messages?partner_id=${partnerId}`)
      .then((res) => { if (!cancelled) setMessages((prev) => mergeMessages(prev, res.data?.messages || [])); })
      .catch((err) => { if (!cancelled) setError(err.message || 'Failed to load messages.'); })
      .finally(() => { if (!cancelled) setLoading(false); });

    const handleNewMessage = (msg) => {
      if (msg.ride_id !== rideId) return;
      const belongsToThisChat =
        (msg.sender_id === user.id && msg.receiver_id === partnerId) ||
        (msg.sender_id === partnerId && msg.receiver_id === user.id);
      if (!belongsToThisChat) return;

      // Dedupe: sender gets the message from both the POST response and the socket
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
    };

    // Catch up on anything missed while the socket was reconnecting
    const handleReconnect = () => {
      api.get(`/chat/${rideId}/messages?partner_id=${partnerId}`)
        .then((res) => { if (!cancelled) setMessages((prev) => mergeMessages(prev, res.data?.messages || [])); })
        .catch(() => {});
    };

    socket.on('new_message', handleNewMessage);
    socket.io.on('reconnect', handleReconnect);

    return () => {
      cancelled = true;
      socket.off('new_message', handleNewMessage);
      socket.io.off('reconnect', handleReconnect);
    };
  }, [isOpen, rideId, partnerId, user?.id]);

  // Auto-scroll to newest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (!isOpen) return null;

  const handleSend = async (e) => {
    e.preventDefault();
    const content = text.trim();
    if (!content || sending) return;

    setSending(true);
    setError('');
    try {
      const res = await api.post(`/chat/${rideId}/messages`, {
        receiver_id: partnerId,
        content
      });
      const saved = res.data?.message;
      if (saved) {
        setMessages((prev) => (prev.some((m) => m.id === saved.id) ? prev : [...prev, saved]));
      }
      setText('');
    } catch (err) {
      setError(err.message || 'Failed to send message.');
    } finally {
      setSending(false);
    }
  };

  const formatTime = (iso) =>
    new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center',
        justifyContent: 'center', zIndex: 1100, padding: '16px'
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#ffffff', borderRadius: '16px', width: '100%', maxWidth: '480px',
          height: '600px', maxHeight: '90vh', display: 'flex', flexDirection: 'column',
          overflow: 'hidden', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.15)'
        }}
      >
        {/* Header */}
        <div style={{
          padding: '14px 18px', borderBottom: '1px solid #e2e8f0',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
            <div style={{
              width: '38px', height: '38px', borderRadius: '50%', background: '#2563eb',
              color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 800, flexShrink: 0
            }}>
              {(partnerName || 'U').charAt(0).toUpperCase()}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#0f172a' }}>
                {partnerName || 'Campus Peer'}
              </div>
              <div style={{
                fontSize: '0.72rem', color: '#64748b', whiteSpace: 'nowrap',
                overflow: 'hidden', textOverflow: 'ellipsis'
              }}>
                {rideLabel || 'Ride coordination'}
              </div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: '#f1f5f9', borderRadius: '8px', padding: '7px', display: 'flex' }}>
            <X size={18} color="#475569" />
          </button>
        </div>

        {/* Messages */}
        <div style={{
          flex: 1, overflowY: 'auto', padding: '16px', background: '#f8fafc',
          display: 'flex', flexDirection: 'column', gap: '8px'
        }}>
          {loading && <div style={{ textAlign: 'center', color: '#64748b', fontSize: '0.85rem' }}>Loading messages...</div>}

          {!loading && messages.length === 0 && !error && (
            <div style={{ textAlign: 'center', color: '#94a3b8', marginTop: '40px' }}>
              <MessageCircle size={34} style={{ margin: '0 auto 8px' }} />
              <div style={{ fontSize: '0.85rem' }}>
                No messages yet. Clarify the pickup landmark before the ride!
              </div>
            </div>
          )}

          {messages.map((m) => {
            const mine = m.sender_id === user?.id;
            return (
              <div key={m.id} style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  maxWidth: '78%', padding: '8px 12px',
                  borderRadius: mine ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                  background: mine ? '#2563eb' : '#ffffff',
                  color: mine ? '#ffffff' : '#0f172a',
                  border: mine ? 'none' : '1px solid #e2e8f0',
                  fontSize: '0.875rem', wordBreak: 'break-word'
                }}>
                  <div>{m.content}</div>
                  <div style={{
                    fontSize: '0.65rem', marginTop: '3px', textAlign: 'right',
                    color: mine ? 'rgba(255,255,255,0.75)' : '#94a3b8'
                  }}>
                    {formatTime(m.sent_at)}
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        {/* Error */}
        {error && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 14px',
            background: '#fef2f2', borderTop: '1px solid #fecaca', color: '#b91c1c', fontSize: '0.8rem'
          }}>
            <AlertCircle size={15} /> <span>{error}</span>
          </div>
        )}

        {/* Input */}
        <form onSubmit={handleSend} style={{
          display: 'flex', gap: '8px', padding: '12px', borderTop: '1px solid #e2e8f0', background: '#fff'
        }}>
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={1000}
            placeholder="Type a message..."
            style={{
              flex: 1, padding: '10px 12px', borderRadius: '10px',
              border: '1px solid #cbd5e1', fontSize: '0.875rem'
            }}
          />
          <button
            type="submit"
            disabled={sending || !text.trim()}
            style={{
              padding: '0 16px', borderRadius: '10px', background: '#2563eb', color: '#fff',
              display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700,
              opacity: sending || !text.trim() ? 0.6 : 1
            }}
          >
            <Send size={16} />
          </button>
        </form>
      </div>
    </div>
  );
}