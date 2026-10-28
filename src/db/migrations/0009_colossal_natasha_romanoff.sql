CREATE TABLE "shop_days" (
	"day" date PRIMARY KEY NOT NULL,
	"open" boolean NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
