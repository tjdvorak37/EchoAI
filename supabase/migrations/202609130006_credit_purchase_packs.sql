-- Remove legacy / mismatched credit pack entries and enforce exact 500 / 1000 / 2500 / 5000 token options

delete from public.echo_credit_products
where product_key in ('credit_1500', 'credit_4000');

insert into public.echo_credit_products (product_key, label, credits, price_usd, sort_order, enabled)
values
  ('credit_500', '500 AI Tokens', 500, 9.99, 10, true),
  ('credit_1000', '1,000 AI Tokens', 1000, 18.99, 20, true),
  ('credit_2500', '2,500 AI Tokens', 2500, 39.99, 30, true),
  ('credit_5000', '5,000 AI Tokens', 5000, 74.99, 40, true)
on conflict (product_key) do update
set label = excluded.label,
    credits = excluded.credits,
    price_usd = excluded.price_usd,
    sort_order = excluded.sort_order,
    enabled = excluded.enabled,
    updated_at = now();

