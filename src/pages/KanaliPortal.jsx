import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { CheckCircle2, XCircle, AlertCircle, LogOut, User, Zap } from 'lucide-react';
import { toast } from 'sonner';

export default function KanaliPortal() {
  const [session, setSession] = useState(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [submittedId, setSubmittedId] = useState('');
  const [recentSubmissions, setRecentSubmissions] = useState([]);
  const [stats, setStats] = useState({ success: 0, alreadyVoted: 0, notFound: 0 });

  const queryClient = useQueryClient();

  const handleLogin = async (e) => {
    e.preventDefault();
    setIsLoggingIn(true);

    try {
      const accounts = await base44.entities.KanaliAccount.filter({ 
        username: username.trim()
      });
      
      if (accounts.length > 0 && accounts[0].is_active) {
        const sessionData = {
          session_token: Math.random().toString(36),
          username: accounts[0].username,
          portal_type: 'kanali',
          kanali_type: accounts[0].user_type,
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          is_active: true
        };
        
        const newSession = await base44.entities.PortalSession.create(sessionData);
        setSession(newSession);
        toast.success('Επιτυχής σύνδεση!');
      } else {
        toast.error('Λανθασμένα στοιχεία σύνδεσης');
      }
    } catch (error) {
      toast.error('Σφάλμα σύνδεσης');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    if (session) {
      await base44.entities.PortalSession.update(session.id, { is_active: false });
    }
    setSession(null);
    setRecentSubmissions([]);
    setStats({ success: 0, alreadyVoted: 0, notFound: 0 });
    toast.success('Αποσυνδεθήκατε επιτυχώς');
  };

  const submitVoteMutation = useMutation({
    mutationFn: async (personId) => {
      // Find person
      const people = await base44.entities.Person.filter({ person_id: personId });
      
      if (people.length === 0) {
        // Not found
        await base44.entities.NotFoundVoter.create({
          submitted_id: personId,
          reason_text: 'Δεν βρέθηκε εγγραφή με αυτό το ID',
          kanali_username: session.username
        });
        
        await base44.entities.KanaliSubmission.create({
          kanali_username: session.username,
          submitted_id: personId,
          status: 'NOT_FOUND',
          reason_text: 'Δεν βρέθηκε εγγραφή με αυτό το ID'
        });
        
        return { status: 'NOT_FOUND', message: 'Δεν βρέθηκε εγγραφή με αυτό το ID' };
      }

      const person = people[0];

      if (person.voted) {
        // Already voted
        await base44.entities.NotFoundVoter.create({
          submitted_id: personId,
          reason_text: 'Ήδη ήταν Ψήφισε = ΝΑΙ',
          kanali_username: session.username
        });
        
        await base44.entities.KanaliSubmission.create({
          kanali_username: session.username,
          submitted_id: personId,
          status: 'ALREADY_VOTED',
          reason_text: 'Ήδη ήταν Ψήφισε = ΝΑΙ',
          person_record_id: person.id
        });
        
        return { status: 'ALREADY_VOTED', message: 'Ήδη ήταν Ψήφισε = ΝΑΙ', person };
      }

      // Mark as voted
      await base44.entities.Person.update(person.id, { 
        voted: true,
        row_version: (person.row_version || 1) + 1
      });
      
      await base44.entities.KanaliSubmission.create({
        kanali_username: session.username,
        submitted_id: personId,
        status: 'MARKED_VOTED',
        person_record_id: person.id
      });
      
      return { status: 'MARKED_VOTED', message: 'Επιτυχής καταχώριση ψήφου!', person };
    },
    onSuccess: (result) => {
      setRecentSubmissions(prev => [
        { ...result, id: submittedId, timestamp: new Date() },
        ...prev.slice(0, 9)
      ]);
      
      setStats(prev => ({
        ...prev,
        success: result.status === 'MARKED_VOTED' ? prev.success + 1 : prev.success,
        alreadyVoted: result.status === 'ALREADY_VOTED' ? prev.alreadyVoted + 1 : prev.alreadyVoted,
        notFound: result.status === 'NOT_FOUND' ? prev.notFound + 1 : prev.notFound
      }));

      if (result.status === 'MARKED_VOTED') {
        toast.success(result.message);
      } else if (result.status === 'ALREADY_VOTED') {
        toast.warning(result.message);
      } else {
        toast.error(result.message);
      }
      
      setSubmittedId('');
      queryClient.invalidateQueries(['people']);
    },
    onError: () => {
      toast.error('Σφάλμα κατά την υποβολή');
    }
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (submittedId.trim()) {
      submitVoteMutation.mutate(submittedId.trim());
    }
  };

  if (!session) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-blue-900 flex items-center justify-center p-4">
        <Card className="w-full max-w-md shadow-2xl">
          <CardHeader className="text-center pb-8">
            <div className="w-16 h-16 bg-indigo-900 rounded-full mx-auto mb-4 flex items-center justify-center">
              <Zap className="w-8 h-8 text-white" />
            </div>
            <CardTitle className="text-2xl">Πύλη Καναλιού</CardTitle>
            <p className="text-slate-600 text-sm mt-2">Σύνδεση στην πλατφόρμα</p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="text-sm font-medium text-slate-700">Όνομα Χρήστη</label>
                <Input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Εισάγετε το όνομα χρήστη"
                  required
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700">Κωδικός Πρόσβασης</label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Εισάγετε τον κωδικό σας"
                  required
                  className="mt-1"
                />
              </div>
              <Button 
                type="submit" 
                className="w-full bg-indigo-900 hover:bg-indigo-800"
                disabled={isLoggingIn}
              >
                {isLoggingIn ? 'Σύνδεση...' : 'Σύνδεση'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Type A Form
  if (session.kanali_type === 'A') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
        {/* Header */}
        <nav className="bg-white border-b border-slate-200 shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <div>
                <h1 className="text-xl font-bold text-slate-900">Πύλη Καναλιού - Τύπος A</h1>
                <p className="text-xs text-slate-500">Χρήστης: {session.username}</p>
              </div>
              <Button variant="outline" onClick={handleLogout}>
                <LogOut className="w-4 h-4 mr-2" />
                Αποσύνδεση
              </Button>
            </div>
          </div>
        </nav>

        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
              <CardContent className="pt-6">
                <div className="text-center">
                  <CheckCircle2 className="w-12 h-12 text-green-600 mx-auto mb-2" />
                  <p className="text-3xl font-bold text-green-900">{stats.success}</p>
                  <p className="text-sm text-green-700 mt-1">Επιτυχείς Υποβολές</p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-amber-50 to-amber-100 border-amber-200">
              <CardContent className="pt-6">
                <div className="text-center">
                  <AlertCircle className="w-12 h-12 text-amber-600 mx-auto mb-2" />
                  <p className="text-3xl font-bold text-amber-900">{stats.alreadyVoted}</p>
                  <p className="text-sm text-amber-700 mt-1">Ήδη Ψήφισαν</p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-red-50 to-red-100 border-red-200">
              <CardContent className="pt-6">
                <div className="text-center">
                  <XCircle className="w-12 h-12 text-red-600 mx-auto mb-2" />
                  <p className="text-3xl font-bold text-red-900">{stats.notFound}</p>
                  <p className="text-sm text-red-700 mt-1">Δεν Βρέθηκαν</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Submission Form */}
          <Card className="shadow-lg">
            <CardHeader className="bg-gradient-to-r from-blue-900 to-indigo-900 text-white">
              <CardTitle className="text-2xl text-center">Καταχώριση Ψήφου</CardTitle>
            </CardHeader>
            <CardContent className="pt-8 pb-8">
              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <label className="text-lg font-medium text-slate-900 block mb-3">
                    Εισάγετε ΑΤ (ID) Ψηφοφόρου
                  </label>
                  <Input
                    value={submittedId}
                    onChange={(e) => setSubmittedId(e.target.value)}
                    placeholder="π.χ. 12345"
                    className="text-lg h-14 text-center text-2xl font-mono"
                    autoFocus
                  />
                </div>
                <Button 
                  type="submit" 
                  className="w-full h-14 text-lg bg-blue-900 hover:bg-blue-800"
                  disabled={submitVoteMutation.isPending}
                >
                  {submitVoteMutation.isPending ? 'Υποβολή...' : 'Καταχώριση Ψήφου'}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Recent Submissions */}
          {recentSubmissions.length > 0 && (
            <Card className="mt-8">
              <CardHeader>
                <CardTitle>Πρόσφατες Υποβολές</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {recentSubmissions.map((sub, idx) => (
                    <div 
                      key={idx}
                      className={`p-4 rounded-lg border-2 ${
                        sub.status === 'MARKED_VOTED' 
                          ? 'bg-green-50 border-green-200' 
                          : sub.status === 'ALREADY_VOTED'
                          ? 'bg-amber-50 border-amber-200'
                          : 'bg-red-50 border-red-200'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {sub.status === 'MARKED_VOTED' && <CheckCircle2 className="w-5 h-5 text-green-600" />}
                          {sub.status === 'ALREADY_VOTED' && <AlertCircle className="w-5 h-5 text-amber-600" />}
                          {sub.status === 'NOT_FOUND' && <XCircle className="w-5 h-5 text-red-600" />}
                          <div>
                            <p className="font-mono font-bold text-lg">{sub.id}</p>
                            {sub.person && (
                              <p className="text-sm text-slate-600">
                                {sub.person.last_name} {sub.person.first_name}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          <p className={`text-sm font-medium ${
                            sub.status === 'MARKED_VOTED' ? 'text-green-700' :
                            sub.status === 'ALREADY_VOTED' ? 'text-amber-700' :
                            'text-red-700'
                          }`}>
                            {sub.message}
                          </p>
                          <p className="text-xs text-slate-500 mt-1">
                            {sub.timestamp.toLocaleTimeString('el-GR')}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    );
  }

  // Type B Placeholder
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardContent className="pt-12 pb-12 text-center">
          <AlertCircle className="w-16 h-16 text-amber-600 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Τύπος B</h2>
          <p className="text-slate-600">Η φόρμα Τύπου B δεν έχει οριστεί ακόμα</p>
          <Button onClick={handleLogout} variant="outline" className="mt-6">
            <LogOut className="w-4 h-4 mr-2" />
            Αποσύνδεση
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}