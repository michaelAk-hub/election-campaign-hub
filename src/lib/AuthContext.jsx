import React, { createContext, useContext } from 'react';

// Auth is handled per-page via custom session tokens (localStorage) validated by
// Supabase Edge Functions — there is no global Base44 bootstrap. This provider just
// satisfies the useAuth() contract App.jsx expects, so the app renders immediately.
const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const value = {
    user: null,
    isAuthenticated: false,
    isLoadingAuth: false,
    isLoadingPublicSettings: false,
    authError: null,
    appPublicSettings: null,
    logout: () => {},
    navigateToLogin: () => {},
    checkAppState: () => {},
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
