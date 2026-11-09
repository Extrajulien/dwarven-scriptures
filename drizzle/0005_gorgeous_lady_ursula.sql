ALTER TABLE "user_stats" ALTER COLUMN "bestWpm" SET DATA TYPE numeric(8, 2);--> statement-breakpoint
ALTER TABLE "user_stats" ALTER COLUMN "bestWpm" SET DEFAULT '0.00';