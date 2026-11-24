CREATE TYPE "public"."api_scope" AS ENUM('platform', 'user', 'ops', 'auditor');--> statement-breakpoint
CREATE TYPE "public"."payout_status" AS ENUM('requested', 'paid', 'failed');--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prefix" text NOT NULL,
	"key_hash" text NOT NULL,
	"scope" "api_scope" NOT NULL,
	"subject_ref" text NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "api_keys_prefix_unique" UNIQUE("prefix")
);
--> statement-breakpoint
CREATE TABLE "payouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"amount" bigint NOT NULL,
	"status" "payout_status" DEFAULT 'requested' NOT NULL,
	"destination" text NOT NULL,
	"entry_id" uuid NOT NULL,
	"settlement_entry_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payouts_amount_positive" CHECK ("payouts"."amount" > 0)
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "platform_ref" text;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_entry_id_journal_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_settlement_entry_id_journal_entries_id_fk" FOREIGN KEY ("settlement_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payouts_account_id_idx" ON "payouts" USING btree ("account_id");