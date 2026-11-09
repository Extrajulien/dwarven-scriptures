CREATE TABLE "user_avatars" (
	"userId" bigint PRIMARY KEY NOT NULL,
	"contentType" varchar(16) NOT NULL,
	"bytes" "bytea" NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_avatars_content_type_valid" CHECK ("user_avatars"."contentType" in ('image/jpeg', 'image/png', 'image/webp'))
);
--> statement-breakpoint
ALTER TABLE "user_avatars" ADD CONSTRAINT "user_avatars_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;