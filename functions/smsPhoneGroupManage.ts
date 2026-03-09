import { createClientFromRequest } from "npm:@base44/sdk@0.8.20";

function normalizeCyPhoneToE164(input) {
  if (!input) return null;
  let digits = input.trim().replace(/\D/g, "");
  if (digits.startsWith("00357")) digits = digits.slice(2);
  if (digits.length === 8) digits = "357" + digits;
  if (digits.startsWith("357") && digits.length === 11) return "+" + digits;
  return null;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const action = body.action; // create | update | delete | get_members

    // ── GET MEMBERS ────────────────────────────────────────────────────────────
    if (action === "get_members") {
      const { group_id } = body;
      if (!group_id) return Response.json({ error: "Missing group_id" }, { status: 400 });
      const members = await base44.asServiceRole.entities.SmsPhoneGroupMember.filter({ group_id });
      return Response.json({ ok: true, members });
    }

    // ── CREATE ─────────────────────────────────────────────────────────────────
    if (action === "create") {
      const { name, description, phones_raw } = body;
      if (!name) return Response.json({ error: "Missing name" }, { status: 400 });

      const lines = (phones_raw || "").split(/[\n,;]+/).map(s => s.trim()).filter(Boolean);
      const members = [];
      for (const raw of lines) {
        const normalized = normalizeCyPhoneToE164(raw);
        if (normalized) {
          members.push({ raw_phone: raw, normalized_phone: normalized, is_active: true });
        }
      }

      const group = await base44.asServiceRole.entities.SmsPhoneGroup.create({
        name: name.trim(),
        description: (description || "").trim(),
        is_active: true,
        member_count: members.length,
      });

      if (members.length > 0) {
        const withGroupId = members.map(m => ({ ...m, group_id: group.id }));
        await base44.asServiceRole.entities.SmsPhoneGroupMember.bulkCreate(withGroupId);
      }

      return Response.json({ ok: true, group });
    }

    // ── UPDATE ─────────────────────────────────────────────────────────────────
    if (action === "update") {
      const { group_id, name, description, phones_raw } = body;
      if (!group_id) return Response.json({ error: "Missing group_id" }, { status: 400 });
      if (!name) return Response.json({ error: "Missing name" }, { status: 400 });

      const lines = (phones_raw || "").split(/[\n,;]+/).map(s => s.trim()).filter(Boolean);
      const newMembers = [];
      for (const raw of lines) {
        const normalized = normalizeCyPhoneToE164(raw);
        if (normalized) {
          newMembers.push({ group_id, raw_phone: raw, normalized_phone: normalized, is_active: true });
        }
      }

      // Delete old members
      const oldMembers = await base44.asServiceRole.entities.SmsPhoneGroupMember.filter({ group_id });
      for (const m of oldMembers) {
        await base44.asServiceRole.entities.SmsPhoneGroupMember.delete(m.id);
      }

      // Create new members
      if (newMembers.length > 0) {
        await base44.asServiceRole.entities.SmsPhoneGroupMember.bulkCreate(newMembers);
      }

      // Update group metadata
      const group = await base44.asServiceRole.entities.SmsPhoneGroup.update(group_id, {
        name: name.trim(),
        description: (description || "").trim(),
        member_count: newMembers.length,
      });

      return Response.json({ ok: true, group });
    }

    // ── DELETE ─────────────────────────────────────────────────────────────────
    if (action === "delete") {
      const { group_id } = body;
      if (!group_id) return Response.json({ error: "Missing group_id" }, { status: 400 });

      const members = await base44.asServiceRole.entities.SmsPhoneGroupMember.filter({ group_id });
      for (const m of members) {
        await base44.asServiceRole.entities.SmsPhoneGroupMember.delete(m.id);
      }
      await base44.asServiceRole.entities.SmsPhoneGroup.delete(group_id);

      return Response.json({ ok: true });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error?.message || String(error) }, { status: 500 });
  }
});