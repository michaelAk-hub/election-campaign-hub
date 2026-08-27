import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '../utils';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, AlertCircle, ShieldCheck, Smartphone } from 'lucide-react';

export default function MfaVerify() {
    const [code, setCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [sending, setSending] = useState(false);
    const [error, setError] = useState('');
    const [maskedPhone, setMaskedPhone] = useState('');
    const [qrImg, setQrImg] = useState('');
    const [resendCountdown, setResendCountdown] = useState(0);
    const countdownRef = useRef(null);
    const inputRef = useRef(null);

    const preauthToken = sessionStorage.getItem('mfa_preauth_token');
    const method = sessionStorage.getItem('mfa_method') || 'sms';
    const isTotp = method === 'totp';
    let enroll = null;
    try { enroll = JSON.parse(sessionStorage.getItem('mfa_enroll') || 'null'); } catch { enroll = null; }

    useEffect(() => {
        if (!preauthToken) {
            window.location.href = createPageUrl('AdminLogin');
            return;
        }
        if (!isTotp) sendOtp(); // SMS: send on arrival. TOTP: nothing to send.
        if (isTotp && enroll) fetchQr(); // enrollment: load the QR image.
        inputRef.current?.focus();
    }, []);

    const fetchQr = async () => {
        try {
            const { data } = await base44.functions.invoke('mfaEnrollQr', { preauthToken });
            if (data?.qr) setQrImg(data.qr);
        } catch { /* fall back to the manual key */ }
    };

    const startCountdown = (seconds) => {
        setResendCountdown(seconds);
        if (countdownRef.current) clearInterval(countdownRef.current);
        countdownRef.current = setInterval(() => {
            setResendCountdown(prev => {
                if (prev <= 1) { clearInterval(countdownRef.current); return 0; }
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
                sessionStorage.removeItem('mfa_method');
                sessionStorage.removeItem('mfa_enroll');
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
                        {isTotp ? <Smartphone className="h-8 w-8 text-white" /> : <ShieldCheck className="h-8 w-8 text-white" />}
                    </div>
                    <CardTitle className="text-2xl font-bold">
                        {isTotp && enroll ? 'Ρύθμιση Authenticator' : 'Επαλήθευση 2FA'}
                    </CardTitle>
                    <p className="text-sm text-slate-600 dark:text-slate-300">
                        {isTotp
                            ? (enroll
                                ? 'Σαρώστε τον κωδικό QR με την εφαρμογή authenticator και εισάγετε τον 6ψήφιο κωδικό.'
                                : 'Εισάγετε τον 6ψήφιο κωδικό από την εφαρμογή authenticator.')
                            : <>Εισάγετε τον κωδικό που στάλθηκε στο{' '}{maskedPhone ? <strong>{maskedPhone}</strong> : 'τηλέφωνό σας'}</>}
                    </p>
                </CardHeader>

                <CardContent>
                    {isTotp && enroll && (
                        <div className="mb-4 flex flex-col items-center gap-2">
                            {qrImg
                                ? <img src={qrImg} alt="QR" className="w-52 h-52 rounded-lg border border-slate-200 dark:border-slate-700" />
                                : <div className="w-52 h-52 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-400"><Loader2 className="h-6 w-6 animate-spin" /></div>}
                            {enroll.secret && (
                                <p className="text-xs text-slate-500 dark:text-slate-400 text-center">
                                    Ή εισάγετε χειροκίνητα το κλειδί:<br />
                                    <span className="font-mono break-all text-slate-700 dark:text-slate-200">{enroll.secret}</span>
                                </p>
                            )}
                        </div>
                    )}

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
                            disabled={loading || code.length < 6}
                        >
                            {loading ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Επαλήθευση...</> : 'Επαλήθευση'}
                        </Button>

                        {!isTotp && (
                            <div className="text-center">
                                {resendCountdown > 0 ? (
                                    <p className="text-sm text-slate-500 dark:text-slate-400">
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
                        )}
                    </form>

                    <p className="text-center text-sm mt-6">
                        <button
                            onClick={() => {
                                sessionStorage.removeItem('mfa_preauth_token');
                                sessionStorage.removeItem('mfa_method');
                                sessionStorage.removeItem('mfa_enroll');
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
