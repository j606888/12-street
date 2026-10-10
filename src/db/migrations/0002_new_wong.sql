CREATE TABLE "lookup_failures" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_no" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "lookup_failures_order_no_idx" ON "lookup_failures" USING btree ("order_no","created_at");