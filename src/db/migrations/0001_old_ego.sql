CREATE TYPE "public"."product_category" AS ENUM('addon', 'id_photo');--> statement-breakpoint
ALTER TYPE "public"."photo_kind" ADD VALUE 'id_photo';--> statement-breakpoint
ALTER TABLE "order_groups" ADD COLUMN "laminate" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "order_groups" ADD COLUMN "lamination_unit_price" integer;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "photo_id" uuid;--> statement-breakpoint
ALTER TABLE "photos" ADD COLUMN "product_id" integer;--> statement-breakpoint
ALTER TABLE "print_sizes" ADD COLUMN "lamination_price" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "category" "product_category" DEFAULT 'addon' NOT NULL;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_photo_id_photos_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."photos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;