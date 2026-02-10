import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Vote, Lock, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

export default function SetPassword() {
  const navigate = useNavigate();
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [tokenValid, setTokenValid] = useState(false);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const tokenParam = urlParams.get('token');
    
    if (!tokenParam) {
      setError('Μη έγκυρος σύνδεσμος πρόσκλησης');
      setValidating(false);
      return;
    }

    setToken(tokenParam);
    validateToken(tokenParam);
  }, []);

  const validateToken = async (tokenValue) => {
    try {
      const tokens = await base44.entities.InvitationToken.filter({ token: tokenValue });
      
      if (tokens.length === 0) {
        setError('Μη έγκυρος σύνδεσμος πρόσκλησης');
        setTokenValid(false);
      } else {
        const invitation = tokens[0];
        
        if (invitation.used) {
          setError('Ο σύνδεσμος έχει ήδη χρησιμοποιηθεί');
          setTokenValid(false);
        } else if (new Date(invitation.expires_at) < new Date()) {
          setError('Ο σύνδεσμος έχει λήξει. Παρακαλώ ζητήστε νέα πρόσκληση.');
          setTokenValid(false);
        } else {
          setTokenValid(true);
        }
      }
    } catch (err) {
      setError('Σφάλμα επαλήθευσης συνδέσμου');
      setTokenValid(false);
    } finally {
      setValidating(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Οι κωδικοί δεν ταιριάζουν');
      return;
    }

    if (password.length < 8) {
      setError('Ο κωδικός πρέπει να έχει τουλάχιστον 8 χαρακτήρες');
      return;
    }

    setLoading(true);

    try {
      const response = await base44.functions.invoke('validateAndSetPassword', {
        token,
        password
      });

      if (response.data.success) {
        setSuccess(true);
        setTimeout(() => {
          base44.auth.redirectToLogin();
        }, 2000);
      } else {
        setError(response.data.error || 'Παρουσιάστηκε σφάλμα');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Παρουσιάστηκε σφάλμα');
    } finally {
      setLoading(false);
    }
  };

  if (validating) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-4">
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 text-center max-w-md w-full border border-white/20">
          <Loader2 className="h-12 w-12 animate-spin text-white mx-auto mb-4" />
          <p className="text-white">Επαλήθευση συνδέσμου...</p>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-4">
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 text-center max-w-md w-full border border-white/20">
          <CheckCircle2 className="h-16 w-16 text-green-400 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-white mb-2">Επιτυχία!</h1>
          <p className="text-blue-200">Ο λογαριασμός σας δημιουργήθηκε. Ανακατεύθυνση στη σύνδεση...</p>
        </div>
      </div>
    );
  }

  if (!tokenValid) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-4">
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 text-center max-w-md w-full border border-white/20">
          <AlertCircle className="h-16 w-16 text-red-400 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-white mb-2">Μη Έγκυρος Σύνδεσμος</h1>
          <p className="text-blue-200 mb-6">{error}</p>
          <Button 
            onClick={() => base44.auth.redirectToLogin()}
            className="w-full bg-blue-600 hover:bg-blue-700"
          >
            Επιστροφή στη Σύνδεση
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-4">
      <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 max-w-md w-full border border-white/20">
        <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <Vote className="h-8 w-8 text-white" />
        </div>
        
        <h1 className="text-2xl font-bold text-white text-center mb-2">Ορισμός Κωδικού</h1>
        <p className="text-blue-200 text-center mb-6">Ορίστε τον κωδικό πρόσβασής σας</p>

        {error && (
          <Alert className="mb-4 bg-red-500/10 border-red-500/20">
            <AlertCircle className="h-4 w-4 text-red-400" />
            <AlertDescription className="text-red-200">{error}</AlertDescription>
          </Alert>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="password" className="text-white">Κωδικός Πρόσβασης</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-300" />
              <Input
                id="password"
                type="password"
                placeholder="Τουλάχιστον 8 χαρακτήρες"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pl-10 bg-white/10 border-white/20 text-white placeholder:text-blue-300"
                required
                disabled={loading}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword" className="text-white">Επιβεβαίωση Κωδικού</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-300" />
              <Input
                id="confirmPassword"
                type="password"
                placeholder="Επαναλάβετε τον κωδικό"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="pl-10 bg-white/10 border-white/20 text-white placeholder:text-blue-300"
                required
                disabled={loading}
              />
            </div>
          </div>

          <Button 
            type="submit" 
            className="w-full bg-blue-600 hover:bg-blue-700"
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Επεξεργασία...
              </>
            ) : (
              'Ολοκλήρωση Εγγραφής'
            )}
          </Button>
        </form>

        <p className="text-blue-200 text-xs text-center mt-6">
          Ο σύνδεσμος λήγει σε 5 λεπτά από την αποστολή
        </p>
      </div>
    </div>
  );
}