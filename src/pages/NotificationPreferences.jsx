import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import PageHeader from '../components/common/PageHeader';
import LoadingSpinner from '../components/common/LoadingSpinner';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Settings, Save } from 'lucide-react';
import { toast } from 'sonner';

export default function NotificationPreferences() {
  const queryClient = useQueryClient();
  const [preferences, setPreferences] = useState({
    password_changes: true,
    account_updates: true,
    system_messages: true,
    data_changes: false
  });

  const { data: user } = useQuery({
    queryKey: ['current-user'],
    queryFn: () => base44.auth.me()
  });

  const { data: existingPrefs, isLoading } = useQuery({
    queryKey: ['notification-preferences', user?.email],
    queryFn: async () => {
      if (!user) return null;
      const prefs = await base44.entities.NotificationPreference.filter({ user_email: user.email });
      if (prefs.length > 0) {
        setPreferences(prefs[0]);
        return prefs[0];
      }
      return null;
    },
    enabled: !!user
  });

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      if (existingPrefs) {
        return base44.entities.NotificationPreference.update(existingPrefs.id, data);
      } else {
        return base44.entities.NotificationPreference.create({
          ...data,
          user_email: user.email
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['notification-preferences']);
      toast.success('Οι προτιμήσεις αποθηκεύτηκαν');
    }
  });

  if (isLoading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Προτιμήσεις Ειδοποιήσεων"
        subtitle="Διαχειριστείτε τις ειδοποιήσεις που λαμβάνετε"
        icon={Settings}
      />

      <Card>
        <CardHeader>
          <CardTitle>Τύποι Ειδοποιήσεων</CardTitle>
          <CardDescription>
            Επιλέξτε ποια είδη ειδοποιήσεων θέλετε να λαμβάνετε
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label className="text-base">Αλλαγές Κωδικού</Label>
              <p className="text-sm text-slate-500">
                Ειδοποίηση όταν ο κωδικός σας αλλάξει ή επαναφερθεί
              </p>
            </div>
            <Switch
              checked={preferences.password_changes}
              onCheckedChange={(v) => setPreferences({...preferences, password_changes: v})}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label className="text-base">Ενημερώσεις Λογαριασμού</Label>
              <p className="text-sm text-slate-500">
                Ειδοποιήσεις για αλλαγές στον λογαριασμό σας
              </p>
            </div>
            <Switch
              checked={preferences.account_updates}
              onCheckedChange={(v) => setPreferences({...preferences, account_updates: v})}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label className="text-base">Μηνύματα Συστήματος</Label>
              <p className="text-sm text-slate-500">
                Σημαντικές ανακοινώσεις και ενημερώσεις συστήματος
              </p>
            </div>
            <Switch
              checked={preferences.system_messages}
              onCheckedChange={(v) => setPreferences({...preferences, system_messages: v})}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label className="text-base">Αλλαγές Δεδομένων</Label>
              <p className="text-sm text-slate-500">
                Ειδοποιήσεις όταν τα δεδομένα ενημερώνονται
              </p>
            </div>
            <Switch
              checked={preferences.data_changes}
              onCheckedChange={(v) => setPreferences({...preferences, data_changes: v})}
            />
          </div>

          <div className="pt-4">
            <Button 
              onClick={() => saveMutation.mutate(preferences)}
              disabled={saveMutation.isPending}
              className="w-full"
            >
              <Save className="h-4 w-4 mr-2" />
              Αποθήκευση Προτιμήσεων
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}