import React, { useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { MessageSquare, Send, RefreshCw, CheckCircle2, XCircle, Phone } from "lucide-react";
import { toast } from "sonner";
import PageHeader from "../components/common/PageHeader";

export default function ChreosiSmsCredentials() {
  const PORTAL_DEFAULT = "https://votecontrol.info/PortalLogin";
  const queryClient = useQueryClient();

  const [mode, setMode] = useState("selected");
  const [onlyActive, setOnlyActive] = useState(true);
  const [includeTitleLine, setIncludeTitleLine] = useState(false);
  const [title, setTitle] = useState("Στοιχεία πρόσβασης");
  const [portalUrl, setPortalUrl] = useState(PORTAL_DEFAULT);
  const [passwordLength, setPasswordLength] = useState(8);
  const [template, setTemplate] = useState(
    "Σύνδεση: {PORTAL_URL}\nUsername: {USERNAME}\nPassword: {PASSWORD}"
  );
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState({});
  const [sending, setSending] = useState(false);
  const [lastResult, setLastResult] = useState(null);

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ["chreosi-accounts"],
    queryFn: async () => {
      let all = [];
      let offset = 0;
      const limit = 500;
      while (true) {
        const batch = await base44.entities.ChreosiAccount.list(null, limit, offset);
        all = all.concat(batch);
        if (batch.length < limit) break;
        offset += limit;
      }
      return all;
    },
    initialData: [],
  });

  const { data: logs = [], refetch: refetchLogs } = useQuery({
    queryKey: ["smslog-chreosi"],
    queryFn: async () => {
      const all = await base44.entities.SmsLog.filter({ category: "chreosi_credentials" });
      return (all || [])
        .sort((a, b) => (b.created_date || "").localeCompare(a.created_date || ""))
        .slice(0, 50);
    },
    initialData: [],
  });

  const filteredAccounts = useMemo(() => {
    const s = search.trim().toLowerCase();
    return accounts
      .filter(a => (onlyActive ? a.is_active : true))
      .filter(a => {
        if (!s) return true;
        return (
          (a.username || "").toLowerCase().includes(s) ||
          (a.display_name || "").toLowerCase().includes(s) ||
          (a.phone || "").toLowerCase().includes(s)
        );
      })
      .sort((a, b) => (a.username || "").localeCompare(b.username || ""));
  }, [accounts, search, onlyActive]);

  const selectedUsernames = useMemo(
    () => Object.keys(selected).filter(u => selected[u]),
    [selected]
  );

  const toggleAllVisible = (checked) => {
    const next = { ...selected };
    for (const a of filteredAccounts) next[a.username] = checked;
    setSelected(next);
  };

  const handleSend = async () => {
    if (mode === "selected" && selectedUsernames.length === 0) {
      toast.error("Επιλέξτε τουλάχιστον έναν χρήστη");
      return;
    }

    setSending(true);
    setLastResult(null);

    const payload = {
      mode,
      usernames: mode === "selected" ? selectedUsernames : [],
      onlyActive,
      title,
      portalUrl,
      template,
      passwordLength: Number(passwordLength) || 8,
      includeTitleLine,
      throttleMs: 150,
    };

    const resp = await base44.functions.invoke("sendChreosiCredentialsSms", payload);
    const data = resp.data;
    setLastResult(data);

    if (data?.ok) {
      toast.success(`Ολοκληρώθηκε: ${data.sent} εστάλησαν, ${data.failed} απέτυχαν`);
      refetchLogs();
      queryClient.invalidateQueries(["chreosi-accounts"]);
    } else {
      toast.error(data?.error || "Αποτυχία αποστολής");
    }

    setSending(false);
  };

  const accountsWithNoPhone = useMemo(
    () => accounts.filter(a => a.is_active && !a.phone),
    [accounts]
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="SMS Credentials (Χρεωστικοί)"
        subtitle="Αποστολή στοιχείων σύνδεσης μέσω SMS"
        icon={MessageSquare}
      />

      {accountsWithNoPhone.length > 0 && (
        <Alert className="border-amber-200 bg-amber-50">
          <AlertDescription className="text-amber-800">
            ⚠️ {accountsWithNoPhone.length} ενεργοί χρήστες δεν έχουν τηλέφωνο:{" "}
            {accountsWithNoPhone.slice(0, 5).map(a => a.username).join(", ")}
            {accountsWithNoPhone.length > 5 ? ` +${accountsWithNoPhone.length - 5} ακόμα` : ""}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Settings Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ρυθμίσεις Αποστολής</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert>
              <AlertDescription className="text-xs font-mono text-slate-600">
                Placeholders: {"{PORTAL_URL}  {USERNAME}  {PASSWORD}  {NAME}"}
              </AlertDescription>
            </Alert>

            <div className="space-y-1">
              <Label>Τίτλος (UI/Logs)</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
              <div className="flex items-center gap-2 mt-1">
                <Checkbox
                  id="include-title"
                  checked={includeTitleLine}
                  onCheckedChange={setIncludeTitleLine}
                />
                <label htmlFor="include-title" className="text-xs text-slate-600 cursor-pointer">
                  Βάλε τον τίτλο ως 1η γραμμή στο SMS
                </label>
              </div>
            </div>

            <div className="space-y-1">
              <Label>Portal Login URL</Label>
              <Input value={portalUrl} onChange={(e) => setPortalUrl(e.target.value)} />
            </div>

            <div className="space-y-1">
              <Label>Μήκος κωδικού</Label>
              <Input
                type="number"
                value={passwordLength}
                onChange={(e) => setPasswordLength(e.target.value)}
                min={6}
                max={20}
                className="w-24"
              />
            </div>

            <div className="space-y-1">
              <Label>Template μηνύματος</Label>
              <Textarea
                value={template}
                onChange={(e) => setTemplate(e.target.value)}
                rows={5}
                className="font-mono text-sm"
              />
            </div>

            <div className="space-y-2">
              <Label>Τρόπος αποστολής</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={mode === "selected" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setMode("selected")}
                >
                  Επιλεγμένοι
                </Button>
                <Button
                  type="button"
                  variant={mode === "all_active" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setMode("all_active")}
                >
                  Όλοι οι ενεργοί
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="only-active"
                  checked={onlyActive}
                  onCheckedChange={setOnlyActive}
                />
                <label htmlFor="only-active" className="text-sm cursor-pointer">
                  Μόνο ενεργοί (is_active)
                </label>
              </div>
            </div>

            <Button
              onClick={handleSend}
              disabled={sending || (mode === "selected" && selectedUsernames.length === 0)}
              className="w-full"
            >
              {sending ? (
                <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Αποστολή...</>
              ) : (
                <><Send className="h-4 w-4 mr-2" />Αποστολή SMS
                  {mode === "selected" && selectedUsernames.length > 0 && ` (${selectedUsernames.length})`}
                </>
              )}
            </Button>

            {lastResult && (
              <div className="rounded-lg border p-3 space-y-2">
                <div className="flex gap-4 text-sm font-medium">
                  <span className="text-green-600">✓ Εστάλησαν: {lastResult.sent}</span>
                  <span className="text-red-600">✗ Απέτυχαν: {lastResult.failed}</span>
                </div>
                {lastResult.results?.filter(r => r.status === "failed").length > 0 && (
                  <div className="text-xs text-red-600 space-y-1">
                    {lastResult.results.filter(r => r.status === "failed").map((r, i) => (
                      <div key={i}>{r.username}: {r.error}</div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Account Selection Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Επιλογή Χρεωστικών</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input
                placeholder="Αναζήτηση (username / όνομα / τηλέφωνο)"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="flex-1"
              />
              <Button type="button" variant="outline" size="sm" onClick={() => toggleAllVisible(true)}>
                Όλα
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => toggleAllVisible(false)}>
                Καθαρισμός
              </Button>
            </div>

            {isLoading ? (
              <div className="text-slate-500 text-sm py-4 text-center">Φόρτωση...</div>
            ) : (
              <div className="space-y-1 max-h-80 overflow-auto border rounded-lg p-3">
                {filteredAccounts.length === 0 ? (
                  <div className="text-slate-400 text-sm text-center py-4">Δεν βρέθηκαν χρήστες</div>
                ) : (
                  filteredAccounts.map((a) => (
                    <label key={a.id} className="flex items-center gap-3 text-sm py-1 px-1 hover:bg-slate-50 rounded cursor-pointer">
                      <Checkbox
                        checked={!!selected[a.username]}
                        onCheckedChange={(v) => setSelected(prev => ({ ...prev, [a.username]: !!v }))}
                      />
                      <span className="font-medium flex-1">{a.username}</span>
                      <span className="text-slate-400 text-xs flex items-center gap-1">
                        <Phone className="h-3 w-3" />
                        {a.phone || "—"}
                      </span>
                      {!a.is_active && <Badge variant="secondary" className="text-xs">inactive</Badge>}
                      {a.is_active && !a.phone && <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">χωρίς τηλ.</Badge>}
                    </label>
                  ))
                )}
              </div>
            )}

            <div className="text-sm text-slate-600">
              Επιλεγμένοι: <strong>{selectedUsernames.length}</strong> / {filteredAccounts.length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* SMS History */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">SMS History (τελευταία 50)</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => refetchLogs()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <div className="text-slate-400 text-sm text-center py-6">Δεν υπάρχουν logs ακόμη.</div>
          ) : (
            <div className="space-y-2 max-h-80 overflow-auto">
              {logs.map((l) => (
                <div key={l.id} className="border rounded-lg p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {l.status === "sent" ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-500 shrink-0" />
                      )}
                      <span className="font-medium">{l.to_username}</span>
                      <span className="text-slate-400 text-xs">{l.to_phone}</span>
                    </div>
                    <span className="text-xs text-slate-400">
                      {l.created_date ? new Date(l.created_date).toLocaleString("el-GR") : ""}
                    </span>
                  </div>
                  {l.message_preview && (
                    <div className="text-xs text-slate-500 mt-1 pl-6">{l.message_preview}</div>
                  )}
                  {l.error && <div className="text-xs text-red-500 mt-1 pl-6">{l.error}</div>}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}