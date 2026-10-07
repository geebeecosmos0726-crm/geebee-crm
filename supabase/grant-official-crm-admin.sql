-- GeeBee official CRM administrator handover.
-- Run once in Supabase: SQL Editor -> New query -> Run.
-- This grants the official email full admin access to the *existing* workspace;
-- it does not copy, delete, or recreate any business data.

insert into public.crm_workspace_members (workspace_owner_id, email, role, modules)
select
  owner_id,
  'geebeecos0726@gmail.com',
  'admin',
  array[
    'Overview', 'Clients', 'Leads', 'Orders', 'Invoices', 'Catalogue',
    'Payments', 'Shipments', 'Settings'
  ]::text[]
from public.crm_workspaces
order by updated_at desc
limit 1
on conflict (workspace_owner_id, email)
do update set
  role = excluded.role,
  modules = excluded.modules;

-- Verification: this should return one row with role = admin.
select email, role, modules
from public.crm_workspace_members
where lower(email) = 'geebeecos0726@gmail.com';
