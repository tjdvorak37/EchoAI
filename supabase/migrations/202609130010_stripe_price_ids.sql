-- Update echo_credit_products table with live Stripe Price IDs

insert into public.echo_credit_products (product_key, label, credits, price_usd, stripe_price_id, sort_order, enabled)
values
  ('credit_500', '500 AI Tokens', 500, 9.99, 'price_1UFGcbRrklQsqC82iY7GVtDr', 10, true),
  ('credit_1000', '1,000 AI Tokens', 1000, 18.99, 'price_1UFGdRRrklQsqC82fUcEFFP3', 20, true),
  ('credit_2500', '2,500 AI Tokens', 2500, 39.99, 'price_1UFGeBRrklQsqC82JMP7nUXL', 30, true),
  ('credit_5000', '5,000 AI Tokens', 5000, 74.99, 'price_1UFGeqRrklQsqC82fuiF4ksA', 40, true)
on conflict (product_key) do update
set label = excluded.label,
    credits = excluded.credits,
    price_usd = excluded.price_usd,
    stripe_price_id = excluded.stripe_price_id,
    sort_order = excluded.sort_order,
    enabled = excluded.enabled,
    updated_at = now();
