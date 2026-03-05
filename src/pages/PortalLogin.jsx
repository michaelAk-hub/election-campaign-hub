import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '../utils';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Vote, User, Lock, AlertCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

function normalizeUsername(str) {
  return str?.trim().replace(/\s+/g, ' ') || '';
}

export default function PortalLogin() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const normalizedUsername = normalizeUsername(username);

    // Check Chreosi accounts first
    const chreosiAccounts = await base44.entities.ChreosiAccount.filter({
      username: normalizedUsername
    });

    if (chreosiAccounts.length > 0) {
      const account = chreosiAccounts[0];
      if (!account.is_active) {
        setError('Ο λογαριασμός είναι απενεργοποιημένος');
        setLoading(false);
        return;
      }
      // Simple password check (in production, use proper hashing)
      if (account.password_hash === password) {
        // Create session
        const sessionToken = Math.random().toString(36).substring(2) + Date.now().toString(36);
        await base44.entities.PortalSession.create({
          session_token: sessionToken,
          username: normalizedUsername,
          portal_type: 'chreosi',
          is_active: true,
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        });
        localStorage.setItem('portal_session', sessionToken);
        localStorage.setItem('portal_type', 'chreosi');
        localStorage.setItem('portal_username', normalizedUsername);
        navigate(createPageUrl('Portal'));
        return;
      }
    }

    // Check Kanali accounts
    const kanaliAccounts = await base44.entities.KanaliAccount.filter({
      username: normalizedUsername
    });

    if (kanaliAccounts.length > 0) {
      const account = kanaliAccounts[0];
      if (!account.is_active) {
        setError('Ο λογαριασμός είναι απενεργοποιημένος');
        setLoading(false);
        return;
      }
      if (account.password_hash === password) {
        const sessionToken = Math.random().toString(36).substring(2) + Date.now().toString(36);
        await base44.entities.PortalSession.create({
          session_token: sessionToken,
          username: normalizedUsername,
          portal_type: 'kanali',
          kanali_type: account.user_type,
          is_active: true,
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        });
        localStorage.setItem('portal_session', sessionToken);
        localStorage.setItem('portal_type', 'kanali');
        localStorage.setItem('portal_username', normalizedUsername);
        localStorage.setItem('kanali_type', account.user_type);
        navigate(createPageUrl('Portal'));
        return;
      }
    }

    setError('Λάθος όνομα χρήστη ή κωδικός');
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Vote className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Πύλη Εκλογών</h1>
          <p className="text-blue-200 mt-2">Σύνδεση για Χρεωστικούς & Κανάλι</p>
        </div>

        <Card className="border-0 shadow-xl">
          <CardHeader>
            <CardTitle>Σύνδεση</CardTitle>
            <CardDescription>
              Εισάγετε τα στοιχεία σας για να συνεχίσετε
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label>Όνομα Χρήστη</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Εισάγετε όνομα χρήστη"
                    className="pl-10"
                    disabled={loading}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Κωδικός</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Εισάγετε κωδικό"
                    className="pl-10"
                    disabled={loading}
                  />
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Σύνδεση...
                  </>
                ) : (
                  'Σύνδεση'
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="hidden">
          Είστε διαχειριστής;{' '}
          <a href={createPageUrl('AdminLogin')}>Συνδεθείτε εδώ</a>
        </p>
      </div>
    </div>
  );
}