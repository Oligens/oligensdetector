BEGIN;

UPDATE plan_prices
SET price_htg=70.00
WHERE plan='flash' AND billing_period='monthly';

COMMIT;
