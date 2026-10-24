-- GeeBee test Product Stock Inventory.
-- This table is intentionally separate from crm_products, so testing the
-- Google Sheet master never changes the live Products / SKUs catalogue.

create table if not exists public.crm_stock_inventory (
  id bigint generated always as identity primary key,
  workspace_owner_id uuid not null references public.crm_workspaces(owner_id) on delete cascade,
  record_id text not null,
  search_key text not null default '',
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_owner_id, record_id)
);

create index if not exists crm_stock_inventory_owner_search_idx
  on public.crm_stock_inventory (workspace_owner_id, search_key);

alter table public.crm_stock_inventory enable row level security;

drop policy if exists "Workspace members use stock inventory" on public.crm_stock_inventory;
create policy "Workspace members use stock inventory"
on public.crm_stock_inventory
for all
to authenticated
using (
  workspace_owner_id = auth.uid()
  or exists (
    select 1 from public.crm_workspace_members m
    where m.workspace_owner_id = crm_stock_inventory.workspace_owner_id
      and lower(m.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
)
with check (
  workspace_owner_id = auth.uid()
  or exists (
    select 1 from public.crm_workspace_members m
    where m.workspace_owner_id = crm_stock_inventory.workspace_owner_id
      and lower(m.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
);
