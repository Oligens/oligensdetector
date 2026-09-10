BEGIN;

-- Read-only quota check for UI/preflight calls.
-- Unlike consume_analysis(), this function NEVER inserts a usage event.
CREATE OR REPLACE FUNCTION check_analysis_quota(p_user_id TEXT, p_word_count INTEGER)
RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE
  v_subscription subscriptions%ROWTYPE;
  v_today_count INTEGER;
BEGIN
  PERFORM expire_subscriptions();

  SELECT * INTO v_subscription
  FROM subscriptions
  WHERE user_id = p_user_id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('allowed',FALSE,'code','NO_SUBSCRIPTION');
  END IF;

  IF v_subscription.status <> 'active' THEN
    RETURN jsonb_build_object('allowed',FALSE,'code','SUBSCRIPTION_INACTIVE');
  END IF;

  IF p_word_count < 0 THEN
    RETURN jsonb_build_object('allowed',FALSE,'code','INVALID_WORD_COUNT');
  END IF;

  IF v_subscription.max_words_per_analysis IS NOT NULL
     AND p_word_count > v_subscription.max_words_per_analysis THEN
    RETURN jsonb_build_object('allowed',FALSE,'code','WORD_LIMIT','maxWords',v_subscription.max_words_per_analysis);
  END IF;

  IF v_subscription.plan = 'flash' THEN
    SELECT COUNT(*) INTO v_today_count
    FROM usage_events
    WHERE user_id = p_user_id
      AND event_type = 'analysis'
      AND created_at >= CURRENT_DATE
      AND created_at < CURRENT_DATE + INTERVAL '1 day';

    IF v_today_count >= 1 THEN
      RETURN jsonb_build_object('allowed',FALSE,'code','DAILY_LIMIT','limit',1);
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'allowed',TRUE,
    'plan',v_subscription.plan::TEXT,
    'words',p_word_count,
    'maxWords',v_subscription.max_words_per_analysis
  );
END;
$$;

COMMIT;
