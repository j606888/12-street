ALTER TABLE "order_items" ADD COLUMN "background_removal_price" integer;--> statement-breakpoint
ALTER TABLE "photos" ADD COLUMN "remove_background" boolean DEFAULT false NOT NULL;