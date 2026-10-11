CREATE TABLE "member_notes" (
	"user_id" text PRIMARY KEY NOT NULL,
	"note" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "member_notes" ADD CONSTRAINT "member_notes_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;