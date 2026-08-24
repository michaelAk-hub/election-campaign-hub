import React, { createContext, useContext, useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '../../utils';
import { Loader2 } from 'lucide-react';

const AdminAuthContext = createContext(null);

export const useAdminAuth = () => {
    const context = useContext(AdminAuthContext);
    if (!context) {
        throw new Error('useAdminAuth must be used within AdminAuthProvider');
    }
    return context;
};

export function AdminAuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        validateSession();
        
        // Check session every 30 seconds
        const interval = setInterval(validateSession, 30000);
        return () => clearInterval(interval);
    }, []);

    const validateSession = async () => {
        const sessionToken = localStorage.getItem('app_session_token');
        
        if (!sessionToken) {
            setUser(null);
            setLoading(false);
            return;
        }

        try {
            const { data } = await base44.functions.invoke('validateAppSession', {
                session_token: sessionToken
            });

            if (data.valid) {
                setUser(data.user);
                localStorage.setItem('app_user', JSON.stringify(data.user));
            } else {
                if (data.force_logout) {
                    alert('Η συνεδρία σας έληξε. Παρακαλώ συνδεθείτε ξανά.');
                }
                logout();
            }
        } catch (error) {
            logout();
        } finally {
            setLoading(false);
        }
    };

    const logout = async () => {
        const sessionToken = localStorage.getItem('app_session_token');
        
        if (sessionToken) {
            try {
                await base44.functions.invoke('appLogout', { session_token: sessionToken });
            } catch (e) {
                // Ignore errors on logout
            }
        }

        localStorage.removeItem('app_session_token');
        localStorage.removeItem('app_user');
        setUser(null);
        window.location.href = createPageUrl('AdminLogin');
    };

    const isAdmin = user?.role === 'ADMIN';
    const isOrganotiki = user?.role === 'ORGANOTIKI';

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-50 dark:bg-slate-800 flex items-center justify-center">
                <Loader2 className="h-8 w-8 text-blue-600 animate-spin" />
            </div>
        );
    }

    return (
        <AdminAuthContext.Provider value={{ user, loading, logout, isAdmin, isOrganotiki, validateSession }}>
            {children}
        </AdminAuthContext.Provider>
    );
}