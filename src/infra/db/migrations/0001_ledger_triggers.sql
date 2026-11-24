-- SQLSTATE AL001: entry is not balanced or has fewer than 2 postings (checked at commit).
-- SQLSTATE AL002: ledger rows are immutable (UPDATE, DELETE, TRUNCATE).
CREATE FUNCTION "ledger_assert_entry_balanced"() RETURNS trigger AS $$
DECLARE
  v_entry_id uuid;
  v_sum numeric;
  v_count bigint;
BEGIN
  IF TG_TABLE_NAME = 'journal_entries' THEN
    v_entry_id := NEW.id;
  ELSE
    v_entry_id := NEW.entry_id;
  END IF;

  SELECT COALESCE(SUM(amount), 0), COUNT(*) INTO v_sum, v_count
  FROM postings WHERE entry_id = v_entry_id;

  IF v_count < 2 THEN
    RAISE EXCEPTION 'journal entry % must have at least 2 postings (has %)', v_entry_id, v_count
      USING ERRCODE = 'AL001';
  END IF;
  IF v_sum <> 0 THEN
    RAISE EXCEPTION 'journal entry % is unbalanced (sum = %)', v_entry_id, v_sum
      USING ERRCODE = 'AL001';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "postings_entry_balanced"
  AFTER INSERT ON "postings"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "ledger_assert_entry_balanced"();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "journal_entries_has_postings"
  AFTER INSERT ON "journal_entries"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "ledger_assert_entry_balanced"();
--> statement-breakpoint
CREATE FUNCTION "ledger_reject_mutation"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% on % is not allowed: ledger rows are immutable', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'AL002';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER "postings_immutable"
  BEFORE UPDATE OR DELETE ON "postings"
  FOR EACH ROW EXECUTE FUNCTION "ledger_reject_mutation"();
--> statement-breakpoint
CREATE TRIGGER "postings_no_truncate"
  BEFORE TRUNCATE ON "postings"
  FOR EACH STATEMENT EXECUTE FUNCTION "ledger_reject_mutation"();
--> statement-breakpoint
CREATE TRIGGER "journal_entries_immutable"
  BEFORE UPDATE OR DELETE ON "journal_entries"
  FOR EACH ROW EXECUTE FUNCTION "ledger_reject_mutation"();
--> statement-breakpoint
CREATE TRIGGER "journal_entries_no_truncate"
  BEFORE TRUNCATE ON "journal_entries"
  FOR EACH STATEMENT EXECUTE FUNCTION "ledger_reject_mutation"();
