-- GeeBee SKU inventory ledger
--
-- Run this once in the Supabase SQL editor.  It starts from the quantities
-- already saved in crm_stock_inventory: those quantities become each SKU's
-- opening balance.  It deliberately does not replay, import, or deduct any
-- older orders.

create table if not exists public.crm_inventory_opening_balances (
  workspace_owner_id uuid not null references public.crm_workspaces(owner_id) on delete cascade,
  sku_id text not null,
  product_record_id text not null,
  opening_quantity numeric not null,
  opened_at timestamptz not null default now(),
  primary key (workspace_owner_id, sku_id),
  unique (workspace_owner_id, product_record_id)
);

create table if not exists public.crm_inventory_ledger (
  id bigint generated always as identity primary key,
  workspace_owner_id uuid not null references public.crm_workspaces(owner_id) on delete cascade,
  transaction_id text not null,
  reference_transaction_id text,
  order_id text not null,
  sku_id text not null,
  product_record_id text not null,
  transaction_type text not null check (transaction_type in ('Dispatch', 'Reversal')),
  occurred_at timestamptz not null default now(),
  quantity numeric not null check (quantity > 0),
  signed_quantity numeric not null,
  previous_available numeric not null default 0,
  new_available numeric not null default 0,
  actor_email text not null default '',
  created_at timestamptz not null default now(),
  unique (workspace_owner_id, transaction_id, sku_id)
);

create index if not exists crm_inventory_ledger_sku_time_idx
  on public.crm_inventory_ledger (workspace_owner_id, sku_id, occurred_at, id);
create index if not exists crm_inventory_ledger_reference_idx
  on public.crm_inventory_ledger (workspace_owner_id, reference_transaction_id, sku_id);

alter table public.crm_inventory_opening_balances enable row level security;
alter table public.crm_inventory_ledger enable row level security;

drop policy if exists "Workspace members read inventory opening balances" on public.crm_inventory_opening_balances;
create policy "Workspace members read inventory opening balances"
on public.crm_inventory_opening_balances for select to authenticated
using (workspace_owner_id = auth.uid() or exists (
  select 1 from public.crm_workspace_members m
  where m.workspace_owner_id = crm_inventory_opening_balances.workspace_owner_id
    and lower(m.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
));

drop policy if exists "Workspace members read inventory ledger" on public.crm_inventory_ledger;
create policy "Workspace members read inventory ledger"
on public.crm_inventory_ledger for select to authenticated
using (workspace_owner_id = auth.uid() or exists (
  select 1 from public.crm_workspace_members m
  where m.workspace_owner_id = crm_inventory_ledger.workspace_owner_id
    and lower(m.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
));

-- Applies all SKU lines as one PostgreSQL transaction.  The advisory lock
-- serializes inventory movements inside a workspace, preventing simultaneous
-- dispatches from overwriting each other.  A retry with the same transaction
-- ID simply returns its existing ledger rows and never changes stock again.
create or replace function public.apply_crm_inventory_transaction(
  p_workspace_owner_id uuid,
  p_transaction_id text,
  p_reference_transaction_id text,
  p_order_id text,
  p_transaction_type text,
  p_lines jsonb,
  p_allow_negative_skus jsonb default '[]'::jsonb,
  p_actor_email text default '',
  p_occurred_at timestamptz default now()
)
returns table (
  transaction_id text,
  order_id text,
  sku_id text,
  product_record_id text,
  transaction_type text,
  occurred_at timestamptz,
  quantity numeric,
  signed_quantity numeric,
  previous_available numeric,
  new_available numeric,
  reference_transaction_id text,
  sequence_id bigint
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  line jsonb;
  requested_sku text;
  requested_quantity numeric;
  sku_count integer;
  inventory_row record;
  existing_count integer;
  already_reversed numeric;
  original_quantity numeric;
  current_available numeric;
  allow_negative boolean;
  entry record;
  running numeric;
  opening numeric;
begin
  if p_transaction_type not in ('Dispatch', 'Reversal') then
    raise exception 'Inventory transaction type must be Dispatch or Reversal.';
  end if;
  if coalesce(jsonb_array_length(p_lines), 0) = 0 then
    raise exception 'An inventory transaction needs at least one SKU line.';
  end if;
  if p_transaction_type = 'Reversal' and coalesce(btrim(p_reference_transaction_id), '') = '' then
    raise exception 'A reversal must reference its original dispatch transaction.';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_workspace_owner_id::text));

  select count(*) into existing_count
  from crm_inventory_ledger as ledger_row
  where ledger_row.workspace_owner_id = p_workspace_owner_id
    and ledger_row.transaction_id = p_transaction_id;
  if existing_count > 0 then
    return query
    select l.transaction_id, l.order_id, l.sku_id, l.product_record_id,
      l.transaction_type, l.occurred_at, l.quantity, l.signed_quantity,
      l.previous_available, l.new_available, l.reference_transaction_id, l.id
    from crm_inventory_ledger l
    where l.workspace_owner_id = p_workspace_owner_id and l.transaction_id = p_transaction_id
    order by l.id;
    return;
  end if;

  -- Validate every exact SKU first.  AB 204 and AB 204 1 are distinct IDs.
  for line in select value from jsonb_array_elements(p_lines) loop
    requested_sku := upper(btrim(coalesce(line ->> 'sku', '')));
    requested_quantity := (line ->> 'quantity')::numeric;
    if requested_sku = '' or requested_quantity <= 0 then
      raise exception 'Every inventory line needs an exact SKU ID and positive quantity.';
    end if;
    select count(*) into sku_count from crm_stock_inventory as stock_row
      where stock_row.workspace_owner_id = p_workspace_owner_id
        and upper(btrim(coalesce(stock_row.data ->> 'sku', ''))) = requested_sku;
    if sku_count <> 1 then
      raise exception 'SKU % must match exactly one Product / SKU record; found % matches.', requested_sku, sku_count;
    end if;
  end loop;

  -- Apply each line. All validation errors roll back the entire function.
  for line in select value from jsonb_array_elements(p_lines) loop
    requested_sku := upper(btrim(line ->> 'sku'));
    requested_quantity := (line ->> 'quantity')::numeric;
    select stock_row.record_id, stock_row.data into inventory_row from crm_stock_inventory as stock_row
      where stock_row.workspace_owner_id = p_workspace_owner_id
        and upper(btrim(coalesce(stock_row.data ->> 'sku', ''))) = requested_sku
      for update;
    current_available := coalesce(nullif(inventory_row.data ->> 'availableQuantity', '')::numeric, 0);
    insert into crm_inventory_opening_balances (workspace_owner_id, sku_id, product_record_id, opening_quantity)
      values (p_workspace_owner_id, requested_sku, inventory_row.record_id, current_available)
      on conflict on constraint crm_inventory_opening_balances_pkey do nothing;

    if p_transaction_type = 'Reversal' then
      select ledger_row.quantity into original_quantity from crm_inventory_ledger as ledger_row
      where ledger_row.workspace_owner_id = p_workspace_owner_id
        and ledger_row.transaction_id = p_reference_transaction_id
        and ledger_row.sku_id = requested_sku
        and ledger_row.transaction_type = 'Dispatch';
      if original_quantity is null then
        raise exception 'No original dispatch exists for % under reference %.', requested_sku, p_reference_transaction_id;
      end if;
      select coalesce(sum(ledger_row.quantity), 0) into already_reversed from crm_inventory_ledger as ledger_row
      where ledger_row.workspace_owner_id = p_workspace_owner_id
        and ledger_row.reference_transaction_id = p_reference_transaction_id
        and ledger_row.sku_id = requested_sku
        and ledger_row.transaction_type = 'Reversal';
      if requested_quantity > original_quantity - already_reversed then
        raise exception 'Only % units of % remain eligible for reversal from dispatch %.', original_quantity - already_reversed, requested_sku, p_reference_transaction_id;
      end if;
    else
      allow_negative := exists (
        select 1 from jsonb_array_elements_text(coalesce(p_allow_negative_skus, '[]'::jsonb)) allowed
        where upper(btrim(allowed)) = requested_sku
      );
      if current_available - requested_quantity < 0 and not allow_negative then
        raise exception 'Insufficient available stock for %: available %, requested %.', requested_sku, current_available, requested_quantity;
      end if;
    end if;

    insert into crm_inventory_ledger (
      workspace_owner_id, transaction_id, reference_transaction_id, order_id,
      sku_id, product_record_id, transaction_type, occurred_at, quantity,
      signed_quantity, previous_available, new_available, actor_email
    ) values (
      p_workspace_owner_id, p_transaction_id,
      nullif(btrim(p_reference_transaction_id), ''), p_order_id,
      requested_sku, inventory_row.record_id, p_transaction_type, p_occurred_at,
      requested_quantity,
      case when p_transaction_type = 'Dispatch' then -requested_quantity else requested_quantity end,
      0, 0, p_actor_email
    );
  end loop;

  -- Recalculate affected SKU ledgers in timestamp then sequence order. This
  -- preserves historical corrections without double-counting.
  for requested_sku in
    select distinct upper(btrim(value ->> 'sku')) from jsonb_array_elements(p_lines)
  loop
    select opening_row.opening_quantity into opening from crm_inventory_opening_balances as opening_row
      where opening_row.workspace_owner_id = p_workspace_owner_id
        and opening_row.sku_id = requested_sku;
    running := opening;
    for entry in select ledger_row.* from crm_inventory_ledger as ledger_row
      where ledger_row.workspace_owner_id = p_workspace_owner_id
        and ledger_row.sku_id = requested_sku
      order by ledger_row.occurred_at, ledger_row.id
    loop
      update crm_inventory_ledger as ledger_row
        set previous_available = running, new_available = running + entry.signed_quantity
        where ledger_row.id = entry.id;
      running := running + entry.signed_quantity;
    end loop;
    update crm_stock_inventory as stock_row
      set data = jsonb_set(stock_row.data, '{availableQuantity}', to_jsonb(running)), updated_at = now()
      where stock_row.workspace_owner_id = p_workspace_owner_id
        and upper(btrim(coalesce(stock_row.data ->> 'sku', ''))) = requested_sku;
  end loop;

  return query
  select l.transaction_id, l.order_id, l.sku_id, l.product_record_id,
    l.transaction_type, l.occurred_at, l.quantity, l.signed_quantity,
    l.previous_available, l.new_available, l.reference_transaction_id, l.id
  from crm_inventory_ledger l
  where l.workspace_owner_id = p_workspace_owner_id and l.transaction_id = p_transaction_id
  order by l.id;
end;
$$;

revoke all on function public.apply_crm_inventory_transaction(uuid, text, text, text, text, jsonb, jsonb, text, timestamptz) from public;
grant execute on function public.apply_crm_inventory_transaction(uuid, text, text, text, text, jsonb, jsonb, text, timestamptz) to service_role;
