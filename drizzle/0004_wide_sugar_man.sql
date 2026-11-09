CREATE TABLE "race_participants" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"raceId" bigint NOT NULL,
	"kind" varchar(16) NOT NULL,
	"userId" bigint,
	"guestToken" varchar(36),
	"displayName" varchar(64) NOT NULL,
	"wpm" numeric(8, 2) NOT NULL,
	"rawWpm" numeric(8, 2) NOT NULL,
	"accuracy" numeric(5, 2) NOT NULL,
	"errors" integer NOT NULL,
	"status" varchar(16) NOT NULL,
	"finishedAtMs" integer NOT NULL,
	"rank" integer NOT NULL,
	"bonusesReceived" integer DEFAULT 0 NOT NULL,
	"wpmSeries" jsonb NOT NULL,
	CONSTRAINT "race_participants_kind_valid" CHECK ("race_participants"."kind" in ('user', 'guest', 'bot')),
	CONSTRAINT "race_participants_status_valid" CHECK ("race_participants"."status" in ('finished', 'timeout', 'quit')),
	CONSTRAINT "race_participants_errors_non_negative" CHECK ("race_participants"."errors" >= 0),
	CONSTRAINT "race_participants_rank_positive" CHECK ("race_participants"."rank" >= 1),
	CONSTRAINT "race_participants_bonuses_non_negative" CHECK ("race_participants"."bonusesReceived" >= 0),
	CONSTRAINT "race_participants_finished_at_ms_non_negative" CHECK ("race_participants"."finishedAtMs" >= 0),
	CONSTRAINT "race_participants_identity_matches_kind" CHECK (("race_participants"."kind" = 'user' and "race_participants"."userId" is not null and "race_participants"."guestToken" is null)
          or ("race_participants"."kind" = 'guest' and "race_participants"."guestToken" is not null and "race_participants"."userId" is null)
          or ("race_participants"."kind" = 'bot' and "race_participants"."userId" is null and "race_participants"."guestToken" is null))
);
--> statement-breakpoint
CREATE TABLE "races" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"publicId" uuid DEFAULT gen_random_uuid() NOT NULL,
	"roomId" bigint,
	"roomPublicId" varchar(36) NOT NULL,
	"textBody" text NOT NULL,
	"textLanguage" varchar(2) NOT NULL,
	"config" jsonb NOT NULL,
	"status" varchar(16) NOT NULL,
	"durationMs" integer NOT NULL,
	"startedAt" timestamp with time zone NOT NULL,
	"finishedAt" timestamp with time zone NOT NULL,
	CONSTRAINT "races_publicId_unique" UNIQUE("publicId"),
	CONSTRAINT "races_language_valid" CHECK ("races"."textLanguage" in ('fr', 'en')),
	CONSTRAINT "races_status_valid" CHECK ("races"."status" in ('finished', 'aborted')),
	CONSTRAINT "races_duration_positive" CHECK ("races"."durationMs" > 0),
	CONSTRAINT "races_room_public_id_not_empty" CHECK ("races"."roomPublicId" <> '')
);
--> statement-breakpoint
ALTER TABLE "race_participants" ADD CONSTRAINT "race_participants_raceId_races_id_fk" FOREIGN KEY ("raceId") REFERENCES "public"."races"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "race_participants" ADD CONSTRAINT "race_participants_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "races" ADD CONSTRAINT "races_roomId_rooms_id_fk" FOREIGN KEY ("roomId") REFERENCES "public"."rooms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "race_participants_race_id_idx" ON "race_participants" USING btree ("raceId");--> statement-breakpoint
CREATE INDEX "race_participants_user_id_idx" ON "race_participants" USING btree ("userId") WHERE "race_participants"."userId" is not null;--> statement-breakpoint
CREATE INDEX "races_room_public_id_idx" ON "races" USING btree ("roomPublicId");