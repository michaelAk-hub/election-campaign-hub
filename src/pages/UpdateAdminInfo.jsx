import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from 'sonner';
import { UserCog } from 'lucide-react';

export default function UpdateAdminInfo() {
  const [email, setEmail] = useState('epiteleio.fpk@gmail.com');
  const [phone, setPhone] = useState('97879747');
  const [loading, setLoading] = useState(false);

  const handleUpdate = async () => {
    setLoading(true);
    try {
      const sessionToken = localStorage.getItem('app_session_token');
      const { data } = await base44.functions.invoke('updateAdminInfo', {
        session_token: sessionToken,
        email,
        phone
      });

      if (data.success) {
        toast.success('Οι πληροφορίες ενημερώθηκαν επιτυχώς');
      } else {
        toast.error(data.error || 'Σφάλμα ενημέρωσης');
      }
    } catch (error) {
      toast.error('Σφάλμα: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserCog className="h-5 w-5" />
            Ενημέρωση Πληροφοριών Διαχειριστή
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Email</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Τηλέφωνο</Label>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
          <Button onClick={handleUpdate} disabled={loading}>
            {loading ? 'Ενημέρωση...' : 'Ενημέρωση Πληροφοριών'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}