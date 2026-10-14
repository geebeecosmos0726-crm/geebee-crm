import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const recordTables = ["crm_clients", "crm_products", "crm_orders", "crm_invoices", "crm_leads", "crm_quotes", "crm_tasks", "crm_transporters"];

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const body = await request.json().catch(() => ({}));
  if (!url || !serviceKey || !token || body.confirm !== "TRANSFER WORKSPACE" || typeof body.targetEmail !== "string") return Response.json({ error: "Confirm the workspace transfer before continuing." }, { status: 400 });

  const db = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: userData, error: userError } = await db.auth.getUser(token);
  if (userError || !userData.user?.email) return Response.json({ error: "Sign in again before transferring the workspace." }, { status: 401 });
  const targetEmail = body.targetEmail.trim().toLowerCase();
  const caller = userData.user;
  const callerEmail = userData.user.email!.toLowerCase();
  const { data: owned } = await db.from("crm_workspaces").select("owner_id, data").eq("owner_id", caller.id).maybeSingle();
  const { data: adminMember } = owned ? { data: null } : await db.from("crm_workspace_members").select("workspace_owner_id, role").ilike("email", callerEmail).eq("role", "admin").maybeSingle();
  const sourceOwnerId = owned?.owner_id || adminMember?.workspace_owner_id;
  if (!sourceOwnerId) return Response.json({ error: "Only a GeeBee workspace administrator can transfer ownership." }, { status: 403 });
  const { data: sourceWorkspace, error: sourceError } = await db.from("crm_workspaces").select("owner_id, data").eq("owner_id", sourceOwnerId).single();
  if (sourceError || !sourceWorkspace) return Response.json({ error: "The source workspace could not be found." }, { status: 404 });

  const { data: users, error: usersError } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const target = users?.users.find((user) => user.email?.toLowerCase() === targetEmail);
  if (usersError || !target) return Response.json({ error: "The official GeeBee account must sign up once before it can become workspace owner." }, { status: 400 });
  if (target.id === sourceOwnerId) return Response.json({ error: "This account is already the workspace owner." }, { status: 400 });
  const { data: targetWorkspace } = await db.from("crm_workspaces").select("owner_id").eq("owner_id", target.id).maybeSingle();
  if (targetWorkspace) return Response.json({ error: "The official GeeBee account already owns another workspace. Contact support before transferring." }, { status: 400 });
  const { data: sourceOwnerUser } = await db.auth.admin.getUserById(sourceOwnerId);
  const sourceOwnerEmail = sourceOwnerUser.user?.email?.toLowerCase();

  let createdTargetWorkspace = false;
  try {
    const [membersResult, auditResult, snapshotsResult, ...records] = await Promise.all([
      db.from("crm_workspace_members").select("email, role, modules, created_at").eq("workspace_owner_id", sourceOwnerId),
      db.from("crm_audit_events").select("actor_email, action, module, details, created_at").eq("workspace_owner_id", sourceOwnerId).limit(10000),
      db.from("crm_recovery_snapshots").select("restored_by, source, data, created_at").eq("workspace_owner_id", sourceOwnerId).limit(1000),
      ...recordTables.map((table) => db.from(table).select("record_id, search_key, data, created_at, updated_at").eq("workspace_owner_id", sourceOwnerId).limit(100000)),
    ]);
    const failed = [membersResult, auditResult, snapshotsResult, ...records].find((result) => result.error);
    if (failed?.error) throw failed.error;
    const { error: createError } = await db.from("crm_workspaces").insert({ owner_id: target.id, data: sourceWorkspace.data, updated_at: new Date().toISOString() });
    if (createError) throw createError;
    createdTargetWorkspace = true;

    // The incoming owner does not need a membership row. Do not copy the
    // outgoing owner's row either, so their old CRM access is removed.
    const members = (membersResult.data || []).filter((member) => member.email.toLowerCase() !== targetEmail && member.email.toLowerCase() !== sourceOwnerEmail).map((member) => ({ workspace_owner_id: target.id, ...member }));
    if (members.length) { const { error } = await db.from("crm_workspace_members").insert(members); if (error) throw error; }
    for (let index = 0; index < recordTables.length; index += 1) {
      const rows = records[index].data || [];
      if (!rows.length) continue;
      const { error } = await db.from(recordTables[index]).insert(rows.map((row) => ({ workspace_owner_id: target.id, record_id: row.record_id, search_key: row.search_key, data: row.data, created_at: row.created_at, updated_at: row.updated_at })));
      if (error) throw error;
    }
    const auditRows = (auditResult.data || []).map((row) => ({ workspace_owner_id: target.id, ...row }));
    if (auditRows.length) { const { error } = await db.from("crm_audit_events").insert(auditRows); if (error) throw error; }
    const snapshotRows = (snapshotsResult.data || []).map((row) => ({ workspace_owner_id: target.id, ...row }));
    if (snapshotRows.length) { const { error } = await db.from("crm_recovery_snapshots").insert(snapshotRows); if (error) throw error; }
    const { error: auditError } = await db.from("crm_audit_events").insert({ workspace_owner_id: target.id, actor_email: callerEmail, action: "Transferred workspace ownership", module: "Team access", details: `Previous owner removed; new owner: ${targetEmail}` });
    if (auditError) throw auditError;
    const { error: deleteError } = await db.from("crm_workspaces").delete().eq("owner_id", sourceOwnerId);
    if (deleteError) throw deleteError;
    return Response.json({ ok: true, owner: targetEmail });
  } catch (error) {
    if (createdTargetWorkspace) await db.from("crm_workspaces").delete().eq("owner_id", target.id);
    return Response.json({ error: error instanceof Error ? error.message : "Workspace ownership could not be transferred. The original workspace was kept." }, { status: 500 });
  }
}
