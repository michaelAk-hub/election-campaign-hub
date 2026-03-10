import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '../utils';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Vote, Loader2, AlertCircle, ShieldCheck } from 'lucide-react';

export default function MfaVerify() {
    const [code, setCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [sending, setSending] = useState(false);
    const [error, setError] = useState('');
    const [maskedPhone, setMaskedPhone] = useState('');
    const [resendCountdown, setResendCountdown] = useState(0);
    const countdownRef = useRef(null);
    const inputRef = useRef(null);

    const preauthToken = sessionStorage.getItem('mfa_preauth_token');

    useEffect(() => {
        if (!preauthToken) {
            window.location.href = createPageUrl('AdminLogin');
            return;
        }
        sendOtp();
        inputRef.current?.focus();
    }, []);

    const startCountdown = (seconds) => {
        setResendCountdown(seconds);
        if (countdownRef.current) clearInterval(countdownRef.current);
        countdownRef.current = setInterval(() => {
            setResendCountdown(prev => {
                if (prev <= 1) {
                    clearInterval(countdownRef.current);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
    };

    const sendOtp = async () => {
        setSending(true);
        setError('');
        try {
            const { data } = await base44.functions.invoke('mfaSendOtp', { preauthToken });
            if (data.ok) {
                setMaskedPhone(data.maskedPhone || '');
                startCountdown(data.resendAfterSec || 30);
            } else {
                setError(data.error || 'Σφάλμα αποστολής OTP');
                if (data.resendAfterSec) startCountdown(data.resendAfterSec);
            }
        } catch (e) {
            setError(e.response?.data?.error || 'Σφάλμα αποστολής OTP');
        } finally {
            setSending(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            const { data } = await base44.functions.invoke('mfaVerifyOtp', { preauthToken, code });
            if (data.success) {
                sessionStorage.removeItem('mfa_preauth_token');
                localStorage.setItem('app_session_token', data.session_token);
                localStorage.setItem('app_user', JSON.stringify(data.user));
                window.location.href = createPageUrl('Dashboard');
            } else {
                setError(data.error || 'Λάθος κωδικός');
            }
        } catch (e) {
            setError(e.response?.data?.error || 'Λάθος κωδικός');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-600 via-blue-700 to-blue-800 flex items-center justify-center p-4">
            <Card className="w-full max-w-md">
                <CardHeader className="space-y-3 text-center">
                    <div className="mx-auto w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center">
                        <ShieldCheck className="h-8 w-8 text-white" />
                    </div>
                    <CardTitle className="text-2xl font-bold">Επαλήθευση 2FA</CardTitle>
                    <p className="text-sm text-slate-600 dark:text-slate-300">
                        Εισάγετε τον κωδικό που στάλθηκε στο{' '}
                        {maskedPhone ? <strong>{maskedPhone}</strong> : 'τηλέφωνό σας'}
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

                        <div className="flex justify-center">
                            <input
                                ref={inputRef}
                                inputMode="numeric"
                                autoComplete="one-time-code"
                                pattern="\d*"
                                maxLength={6}
                                value={code}
                                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                className="text-center text-3xl font-bold tracking-[0.5em] w-52 border-2 border-slate-300 dark:border-slate-600 rounded-lg py-4 px-2 focus:outline-none focus:border-blue-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                                placeholder="······"
                                required
                            />
                        </div>

                        <Button
                            type="submit"
                            className="w-full bg-blue-600 hover:bg-blue-700"
                            disabled={loading || code.length < 4}
                        >
                            {loading ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Επαλήθευση...</> : 'Επαλήθευση'}
                        </Button>

                        <div className="text-center">
                            {resendCountdown > 0 ? (
                                <p className="text-sm text-slate-500">
                                    Επαναποστολή σε {resendCountdown}δ
                                </p>
                            ) : (
                                <button
                                    type="button"
                                    onClick={sendOtp}
                                    disabled={sending}
                                    className="text-sm text-blue-600 hover:underline disabled:opacity-50"
                                >
                                    {sending ? 'Αποστολή...' : 'Επαναποστολή κωδικού'}
                                </button>
                            )}
                        </div>
                    </form>

                    <p className="text-center text-sm mt-6">
                        <button
                            onClick={() => {
                                sessionStorage.removeItem('mfa_preauth_token');
                                window.location.href = createPageUrl('AdminLogin');
                            }}
                            className="text-blue-600 hover:underline"
                        >
                            ← Επιστροφή στη σύνδεση
                        </button>
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}