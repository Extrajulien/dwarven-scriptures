CREATE TABLE "user_resources" (
	"userId" bigint PRIMARY KEY NOT NULL,
	"coins" bigint DEFAULT 0 NOT NULL,
	"gems" integer DEFAULT 0 NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_resources_coins_non_negative" CHECK ("user_resources"."coins" >= 0),
	CONSTRAINT "user_resources_gems_non_negative" CHECK ("user_resources"."gems" >= 0)
);
--> statement-breakpoint
CREATE TABLE "user_stats" (
	"userId" bigint PRIMARY KEY NOT NULL,
	"racesCompleted" integer DEFAULT 0 NOT NULL,
	"totalWords" bigint DEFAULT 0 NOT NULL,
	"totalTimeMs" bigint DEFAULT 0 NOT NULL,
	"bestWpm" numeric(6, 2) DEFAULT '0.00' NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_stats_races_completed_non_negative" CHECK ("user_stats"."racesCompleted" >= 0),
	CONSTRAINT "user_stats_total_words_non_negative" CHECK ("user_stats"."totalWords" >= 0),
	CONSTRAINT "user_stats_total_time_ms_non_negative" CHECK ("user_stats"."totalTimeMs" >= 0),
	CONSTRAINT "user_stats_best_wpm_non_negative" CHECK ("user_stats"."bestWpm" >= 0)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"publicId" uuid DEFAULT gen_random_uuid() NOT NULL,
	"username" varchar(32) NOT NULL,
	"passwordHash" text NOT NULL,
	"pfpUrl" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_publicId_unique" UNIQUE("publicId"),
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
ALTER TABLE "user_resources" ADD CONSTRAINT "user_resources_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_stats" ADD CONSTRAINT "user_stats_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;