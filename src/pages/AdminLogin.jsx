import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '../utils';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Vote, Loader2, AlertCircle } from 'lucide-react';

export default function AdminLogin() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [checkingSession, setCheckingSession] = useState(true);

    useEffect(() => {
        checkExistingSession();
    }, []);

    const checkExistingSession = async () => {
        const sessionToken = localStorage.getItem('app_session_token');
        if (sessionToken) {
            try {
                const { data } = await base44.functions.invoke('validateAppSession', { session_token: sessionToken });
                if (data.valid) {
                    window.location.href = createPageUrl('Dashboard');
                    return;
                }
            } catch (e) {
                // Session invalid, continue to login
            }
        }
        setCheckingSession(false);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const { data } = await base44.functions.invoke('appLogin', {
                email: email.trim(),
                password
            });

            if (data.success && data.mfaRequired) {
                sessionStorage.setItem('mfa_preauth_token', data.preauthToken);
                window.location.href = createPageUrl('MfaVerify');
            } else if (data.success) {
                localStorage.setItem('app_session_token', data.session_token);
                localStorage.setItem('app_user', JSON.stringify(data.user));
                window.location.href = createPageUrl('Dashboard');
            } else {
                setError(data.error || 'Σφάλμα σύνδεσης');
            }
        } catch (error) {
            setError(error.response?.data?.error || 'Σφάλμα σύνδεσης');
        } finally {
            setLoading(false);
        }
    };

    if (checkingSession) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-blue-600 via-blue-700 to-blue-800 flex items-center justify-center">
                <Loader2 className="h-8 w-8 text-white animate-spin" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-600 via-blue-700 to-blue-800 flex items-center justify-center p-4">
            <Card className="w-full max-w-md">
                <CardHeader className="space-y-3 text-center">
                    <div className="mx-auto w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center">
                        <Vote className="h-8 w-8 text-white" />
                    </div>
                    <CardTitle className="text-2xl font-bold">
                        Σύνδεση Διαχειριστή & Οργανωτικού
                    </CardTitle>
                    <p className="text-sm text-slate-600 dark:text-slate-300">
                        Portal B - Admin & Organotiki Login
                    </p>
                </CardHeader>

                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        {error && (
                            <Alert variant="destructive">
                                <AlertCircle className="h-4 w-4" />
                                <AlertDescription>{error}</AlertDescription>
                            </Alert>
                        )}

                        <div className="space-y-2">
                            <Label htmlFor="email">Email</Label>
                            <Input
                                id="email"
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="Email"
                                required
                                autoFocus
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="password">Κωδικός</Label>
                            <Input
                                id="password"
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="Κωδικός"
                                required
                            />
                        </div>

                        <Button
                            type="submit"
                            className="w-full bg-blue-600 hover:bg-blue-700"
                            disabled={loading}
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                    Σύνδεση...
                                </>
                            ) : (
                                'Σύνδεση'
                            )}
                        </Button>
                    </form>

                    <p className="text-center text-slate-500 dark:text-slate-400 text-sm mt-6">
                        <button
                            onClick={() => window.location.href = createPageUrl('PortalLogin')}
                            className="text-blue-600 hover:underline"
                        >
                            ← Επιστροφή στην Κύρια Πύλη
                        </button>
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}