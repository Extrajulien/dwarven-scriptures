ALTER TABLE "races" ADD COLUMN "visibility" varchar(16) DEFAULT 'public' NOT NULL;--> statement-breakpoint
ALTER TABLE "races" ADD CONSTRAINT "races_visibility_valid" CHECK ("races"."visibility" in ('public', 'code', 'private'));--> statement-breakpoint
ALTER TABLE "races" ALTER COLUMN "visibility" DROP DEFAULT;