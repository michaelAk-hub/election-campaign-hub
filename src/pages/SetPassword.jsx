import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Vote, Lock, User, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function SetPassword() {
  const [token, setToken] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tokenParam = params.get('token');
    if (tokenParam) {
      setToken(tokenParam);
    } else {
      setError('Μη έγκυρος σύνδεσμος πρόσκλησης');
    }
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!fullName.trim()) {
      setError('Εισάγετε το ονοματεπώνυμό σας');
      return;
    }

    if (password.length < 6) {
      setError('Ο κωδικός πρέπει να έχει τουλάχιστον 6 χαρακτήρες');
      return;
    }

    if (password !== confirmPassword) {
      setError('Οι κωδικοί δεν ταιριάζουν');
      return;
    }

    setLoading(true);

    try {
      const response = await base44.functions.invoke('setPasswordWithToken', {
        token,
        password,
        fullName
      });

      if (response.data.success) {
        setSuccess(true);
        toast.success('Ο λογαριασμός σας δημιουργήθηκε επιτυχώς!');
        setTimeout(() => {
          base44.auth.redirectToLogin();
        }, 2000);
      } else {
        setError(response.data.error || 'Κάτι πήγε στραβά');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Σφάλμα κατά τη δημιουργία λογαριασμού');
    } finally {
      setLoading(false);
    }
  };

  if (!token && !error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-4">
        <Loader2 className="h-8 w-8 animate-spin text-white" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Vote className="h-8 w-8 text-white" />
          </div>
          <CardTitle className="text-2xl">
            {success ? 'Επιτυχής Εγγραφή!' : 'Ορίστε τον Κωδικό σας'}
          </CardTitle>
          <CardDescription>
            {success 
              ? 'Ο λογαριασμός σας είναι έτοιμος. Θα μεταφερθείτε στη σελίδα σύνδεσης...'
              : 'Ολοκληρώστε την εγγραφή σας ορίζοντας έναν ασφαλή κωδικό'
            }
          </CardDescription>
        </CardHeader>

        <CardContent>
          {success ? (
            <div className="text-center py-8">
              <CheckCircle2 className="h-16 w-16 text-green-600 mx-auto mb-4" />
              <p className="text-slate-600">Μεταφορά στη σελίδα σύνδεσης...</p>
            </div>
          ) : error && !token ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="fullName">Ονοματεπώνυμο</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    id="fullName"
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Εισάγετε το ονοματεπώνυμό σας"
                    className="pl-10"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Κωδικός</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Τουλάχιστον 6 χαρακτήρες"
                    className="pl-10"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Επιβεβαίωση Κωδικού</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Επιβεβαιώστε τον κωδικό"
                    className="pl-10"
                    required
                  />
                </div>
              </div>

              <Alert className="bg-blue-50 border-blue-200">
                <AlertCircle className="h-4 w-4 text-blue-600" />
                <AlertDescription className="text-blue-800 text-xs">
                  ⚠️ Ο σύνδεσμος πρόσκλησης λήγει σε 5 λεπτά
                </AlertDescription>
              </Alert>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Δημιουργία...
                  </>
                ) : (
                  'Δημιουργία Λογαριασμού'
                )}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}