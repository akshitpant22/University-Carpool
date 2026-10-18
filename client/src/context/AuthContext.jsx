import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../services/supabase.js';
import { api } from '../services/api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  // Load user profile from backend
  const fetchProfile = async () => {
    try {
      const res = await api.get('/users/me');
      if (res.success && res.data?.user) {
        setProfile(res.data.user);
      }
    } catch (err) {
      console.warn('[AuthContext] Unable to fetch profile:', err.message);
    }
  };

  useEffect(() => {
    // 1. Initial session check
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user || null);
      if (session?.user) {
        fetchProfile();
      }
      setLoading(false);
    });

    // 2. Auth listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      setUser(session?.user || null);
      if (session?.user) {
        await fetchProfile();
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Signup method via Backend API
  const signup = async (formData) => {
    const res = await api.post('/auth/signup', formData);
    if (res.success) {
      // Auto login with credentials after creation
      const { data, error } = await supabase.auth.signInWithPassword({
        email: formData.email,
        password: formData.password
      });
      if (error) throw error;
      return res.data;
    }
    throw new Error(res.error?.message || 'Signup failed');
  };

  // Login method via Supabase Auth
  const login = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });
    if (error) throw error;
    await fetchProfile();
    return data;
  };

  // Logout method
  const logout = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setProfile(null);
  };

  // Upload student ID card directly to Supabase storage (with backend fallback)
  const uploadIdCard = async (file) => {
    if (!user) throw new Error('Must be logged in to upload ID card.');

    const fileExt = file.name.split('.').pop();
    const filePath = `${user.id}/student_id_${Date.now()}.${fileExt}`;

    try {
      // 1. Try direct upload to 'id_cards'
      let uploadResult = await supabase.storage
        .from('id_cards')
        .upload(filePath, file, { upsert: true });

      // If 'id_cards' not found, try 'id-cards'
      if (uploadResult.error && uploadResult.error.message?.includes('Bucket not found')) {
        uploadResult = await supabase.storage
          .from('id-cards')
          .upload(filePath, file, { upsert: true });
      }

      if (uploadResult.error) {
        throw uploadResult.error;
      }

      // Save reference in backend
      const res = await api.post('/users/me/id-card', { storage_path: filePath });
      await fetchProfile();
      return res;
    } catch (clientUploadErr) {
      console.warn('[uploadIdCard] Direct storage upload failed, using secure backend fallback:', clientUploadErr.message);

      // 2. Fallback: Convert file to base64 and upload via backend admin client
      const toBase64 = (f) => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(f);
        reader.onload = () => resolve(reader.result);
        reader.onerror = (err) => reject(err);
      });

      const base64Data = await toBase64(file);
      const res = await api.post('/users/me/id-card', {
        file_base64: base64Data,
        file_ext: fileExt
      });

      await fetchProfile();
      return res;
    }
  };

  const value = {
    session,
    user,
    profile,
    loading,
    signup,
    login,
    logout,
    uploadIdCard,
    refreshProfile: fetchProfile
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
