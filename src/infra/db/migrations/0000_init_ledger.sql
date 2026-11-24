CREATE TYPE "public"."account_type" AS ENUM('USER_WALLET', 'PLATFORM_FUNDING', 'PAYOUT_CLEARING', 'FEE_REVENUE', 'SYSTEM_SUSPENSE');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "account_type" NOT NULL,
	"owner_ref" text,
	"currency" char(3) DEFAULT 'CLP' NOT NULL,
	"balance" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_currency_clp" CHECK ("accounts"."currency" = 'CLP'),
	CONSTRAINT "accounts_wallet_non_negative" CHECK ("accounts"."type" <> 'USER_WALLET' OR "accounts"."balance" >= 0)
);
--> statement-breakpoint
CREATE TABLE "journal_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"description" text NOT NULL,
	"reversal_of" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "journal_entries_reversal_of_unique" UNIQUE("reversal_of")
);
--> statement-breakpoint
CREATE TABLE "postings" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"entry_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"amount" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "postings_amount_non_zero" CHECK ("postings"."amount" <> 0)
);
--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_reversal_of_fk" FOREIGN KEY ("reversal_of") REFERENCES "public"."journal_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "postings" ADD CONSTRAINT "postings_entry_id_journal_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "postings" ADD CONSTRAINT "postings_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "postings_account_id_idx" ON "postings" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "postings_entry_id_idx" ON "postings" USING btree ("entry_id");