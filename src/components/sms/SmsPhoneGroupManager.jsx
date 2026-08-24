import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Users, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function SmsPhoneGroupManager({ selectedGroupId, onGroupSelect }) {
  const queryClient = useQueryClient();
  const [groupDialog, setGroupDialog] = useState({ open: false, mode: "create", group: null });
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formPhones, setFormPhones] = useState("");

  const { data: groups = [], isLoading } = useQuery({
    queryKey: ["sms-phone-groups"],
    queryFn: () => base44.entities.SmsPhoneGroup.list("-created_date", 500),
    initialData: [],
  });

  const openCreate = () => {
    setFormName("");
    setFormDescription("");
    setFormPhones("");
    setGroupDialog({ open: true, mode: "create", group: null });
  };

  const openEdit = async (group) => {
    setSaving(false);
    setFormName(group.name || "");
    setFormDescription(group.description || "");
    setFormPhones("Φόρτωση...");
    setGroupDialog({ open: true, mode: "edit", group });
    // Load members
    const res = await base44.functions.invoke("smsPhoneGroupManage", { action: "get_members", group_id: group.id });
    const members = res.data?.members || [];
    setFormPhones(members.map(m => m.raw_phone).join("\n"));
  };

  const handleSave = async () => {
    if (!formName.trim()) return toast.error("Απαιτείται όνομα ομάδας");
    setSaving(true);
    try {
      if (groupDialog.mode === "create") {
        await base44.functions.invoke("smsPhoneGroupManage", {
          action: "create",
          name: formName,
          description: formDescription,
          phones_raw: formPhones,
        });
        toast.success("Η ομάδα δημιουργήθηκε");
      } else {
        await base44.functions.invoke("smsPhoneGroupManage", {
          action: "update",
          group_id: groupDialog.group.id,
          name: formName,
          description: formDescription,
          phones_raw: formPhones,
        });
        toast.success("Η ομάδα ενημερώθηκε");
      }
      queryClient.invalidateQueries(["sms-phone-groups"]);
      setGroupDialog({ open: false, mode: "create", group: null });
    } catch (e) {
      toast.error(e.message || "Σφάλμα αποθήκευσης");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    setDeleting(true);
    try {
      await base44.functions.invoke("smsPhoneGroupManage", { action: "delete", group_id: deleteConfirm.id });
      toast.success("Η ομάδα διαγράφηκε");
      queryClient.invalidateQueries(["sms-phone-groups"]);
      if (selectedGroupId === deleteConfirm.id) onGroupSelect("");
      setDeleteConfirm(null);
    } catch (e) {
      toast.error(e.message || "Σφάλμα διαγραφής");
    } finally {
      setDeleting(false);
    }
  };

  const selectedGroup = groups.find(g => g.id === selectedGroupId);

  return (
    <div className="space-y-2">
      <div className="flex gap-2 items-end">
        <div className="flex-1 space-y-1">
          <Label>Επιλογή Ομάδας</Label>
          <Select value={selectedGroupId || ""} onValueChange={onGroupSelect}>
            <SelectTrigger>
              <SelectValue placeholder={isLoading ? "Φόρτωση..." : "Επιλέξτε ομάδα..."} />
            </SelectTrigger>
            <SelectContent>
              {groups.map(g => (
                <SelectItem key={g.id} value={g.id}>
                  <span className="flex items-center gap-2">
                    <Users className="h-3 w-3 text-slate-400" />
                    {g.name}
                    <Badge variant="secondary" className="text-xs ml-1">{g.member_count || 0}</Badge>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={openCreate} className="shrink-0">
          <Plus className="h-4 w-4 mr-1" /> Νέα Ομάδα
        </Button>
        {selectedGroup && (
          <>
            <Button type="button" size="sm" variant="outline" onClick={() => openEdit(selectedGroup)} className="shrink-0">
              <Pencil className="h-4 w-4" />
            </Button>
            <Button type="button" size="sm" variant="destructive" onClick={() => setDeleteConfirm(selectedGroup)} className="shrink-0">
              <Trash2 className="h-4 w-4" />
            </Button>
          </>
        )}
      </div>

      {selectedGroup && (
        <p className="text-xs text-slate-500 dark:text-slate-400 pl-1">
          {selectedGroup.member_count || 0} τηλέφωνα
          {selectedGroup.description ? ` • ${selectedGroup.description}` : ""}
        </p>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={groupDialog.open} onOpenChange={(o) => { if (!saving) setGroupDialog(d => ({ ...d, open: o })); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{groupDialog.mode === "create" ? "Νέα Ομάδα Τηλεφώνων" : "Επεξεργασία Ομάδας"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>Όνομα Ομάδας *</Label>
              <Input value={formName} onChange={e => setFormName(e.target.value)} placeholder="π.χ. Εφορευτική Επιτροπή" />
            </div>
            <div className="space-y-1">
              <Label>Περιγραφή (προαιρετικό)</Label>
              <Input value={formDescription} onChange={e => setFormDescription(e.target.value)} placeholder="Σύντομη περιγραφή..." />
            </div>
            <div className="space-y-1">
              <Label>Τηλέφωνα</Label>
              <Textarea
                value={formPhones}
                onChange={e => setFormPhones(e.target.value)}
                rows={7}
                className="font-mono text-sm"
                placeholder={"99123456\n99234567\n+35799345678"}
              />
              <p className="text-xs text-slate-500 dark:text-slate-400">Ένα τηλέφωνο ανά γραμμή. Μη έγκυροι αριθμοί θα αγνοηθούν.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGroupDialog(d => ({ ...d, open: false }))} disabled={saving}>
              Ακύρωση
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Αποθήκευση...</> : "Αποθήκευση"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <Dialog open={!!deleteConfirm} onOpenChange={(o) => { if (!deleting && !o) setDeleteConfirm(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Διαγραφή Ομάδας</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600 dark:text-slate-300 py-2">
            Είστε σίγουροι ότι θέλετε να διαγράψετε την ομάδα <strong>"{deleteConfirm?.name}"</strong> και όλα τα τηλέφωνά της;
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)} disabled={deleting}>Ακύρωση</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Διαγραφή...</> : "Διαγραφή"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}