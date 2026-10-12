ALTER TABLE "photos" ADD COLUMN "laminate_quantity" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Lamination moves from the whole group to a count per photo: groups that were laminated had every print laminated
UPDATE "photos" SET "laminate_quantity" = "photos"."quantity" FROM "order_groups" WHERE "photos"."group_id" = "order_groups"."id" AND "order_groups"."laminate";--> statement-breakpoint
ALTER TABLE "order_groups" DROP COLUMN "laminate";