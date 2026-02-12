import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '../utils';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Vote, Loader2, AlertCircle } from 'lucide-react';

export default function AdminLogin() {
    const navigate = useNavigate();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        // Check if already logged in
        const sessionToken = localStorage.getItem('organotiki_session_token');
        if (sessionToken) {
            validateAndRedirect(sessionToken);
        }
    }, []);

    const validateAndRedirect = async (token) => {
        try {
            const { data } = await base44.functions.invoke('organotikiValidateSession', {
                session_token: token
            });

            if (data.valid) {
                localStorage.setItem('organotiki_user', JSON.stringify(data.user));
                navigate(createPageUrl('Dashboard'));
            } else {
                localStorage.removeItem('organotiki_session_token');
                localStorage.removeItem('organotiki_user');
            }
        } catch (e) {
            localStorage.removeItem('organotiki_session_token');
            localStorage.removeItem('organotiki_user');
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const { data } = await base44.functions.invoke('organotikiLogin', {
                email: email.trim(),
                password
            });

            if (data.success) {
                localStorage.setItem('organotiki_session_token', data.session_token);
                localStorage.setItem('organotiki_user', JSON.stringify(data.user));
                navigate(createPageUrl('Dashboard'));
            } else {
                setError(data.error || 'Σφάλμα σύνδεσης');
            }
        } catch (err) {
            setError(err.response?.data?.error || 'Σφάλμα σύνδεσης');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-blue-900 flex items-center justify-center p-4">
            <div className="w-full max-w-md">
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-16 h-16 bg-white rounded-2xl mb-4 shadow-lg">
                        <Vote className="h-8 w-8 text-blue-600" />
                    </div>
                    <h1 className="text-3xl font-bold text-white mb-2">Πύλη Διαχειριστή</h1>
                    <p className="text-blue-200">Σύστημα Διαχείρισης Εκλογών 2026</p>
                </div>

                <Card className="shadow-2xl">
                    <CardHeader>
                        <CardTitle>Σύνδεση</CardTitle>
                        <CardDescription>
                            Χρησιμοποιήστε τα στοιχεία σας για πρόσβαση
                        </CardDescription>
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
                                    placeholder="email@example.com"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                    disabled={loading}
                                    autoComplete="email"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="password">Κωδικός</Label>
                                <Input
                                    id="password"
                                    type="password"
                                    placeholder="••••••••"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                    disabled={loading}
                                    autoComplete="current-password"
                                />
                            </div>

                            <Button 
                                type="submit" 
                                className="w-full bg-blue-600 hover:bg-blue-700"
                                disabled={loading}
                            >
                                {loading ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Σύνδεση...
                                    </>
                                ) : (
                                    'Σύνδεση'
                                )}
                            </Button>
                        </form>

                        <div className="mt-6 text-center">
                            <button
                                onClick={() => navigate(createPageUrl('PortalLogin'))}
                                className="text-sm text-blue-600 hover:underline"
                            >
                                ← Επιστροφή στην κύρια πύλη
                            </button>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}