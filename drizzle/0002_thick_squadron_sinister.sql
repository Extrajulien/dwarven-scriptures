CREATE TABLE "texts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"language" varchar(2) NOT NULL,
	"title" varchar(160) NOT NULL,
	"body" text NOT NULL,
	"wordCount" integer NOT NULL,
	"complexity" varchar(16) NOT NULL,
	"avgWordLength" numeric(5, 2) NOT NULL,
	"longWordRatio" numeric(6, 4) NOT NULL,
	"specialCharRatio" numeric(6, 4) NOT NULL,
	"hasPunctuation" boolean DEFAULT false NOT NULL,
	"hasNumbers" boolean DEFAULT false NOT NULL,
	"hasCapitals" boolean DEFAULT false NOT NULL,
	"hasAccents" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "texts_language_valid" CHECK ("texts"."language" in ('fr', 'en')),
	CONSTRAINT "texts_complexity_valid" CHECK ("texts"."complexity" in ('facile', 'moyen', 'difficile')),
	CONSTRAINT "texts_word_count_positive" CHECK ("texts"."wordCount" > 0),
	CONSTRAINT "texts_avg_word_length_non_negative" CHECK ("texts"."avgWordLength" >= 0),
	CONSTRAINT "texts_long_word_ratio_non_negative" CHECK ("texts"."longWordRatio" >= 0),
	CONSTRAINT "texts_special_char_ratio_non_negative" CHECK ("texts"."specialCharRatio" >= 0)
);
--> statement-breakpoint
CREATE TABLE "word_dictionaries" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"language" varchar(2) NOT NULL,
	"complexity" varchar(16) NOT NULL,
	"words" jsonb NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "word_dictionaries_language_complexity_unique" UNIQUE("language","complexity"),
	CONSTRAINT "word_dictionaries_language_valid" CHECK ("word_dictionaries"."language" in ('fr', 'en')),
	CONSTRAINT "word_dictionaries_complexity_valid" CHECK ("word_dictionaries"."complexity" in ('facile', 'moyen', 'difficile')),
	CONSTRAINT "word_dictionaries_words_min_length" CHECK (jsonb_array_length("word_dictionaries"."words") >= 100)
);
--> statement-breakpoint
ALTER TABLE "user_stats" ADD COLUMN "wins" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "user_stats" ADD COLUMN "correctKeystrokes" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "user_stats" ADD COLUMN "totalKeystrokes" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "texts_language_complexity_idx" ON "texts" USING btree ("language","complexity");--> statement-breakpoint
ALTER TABLE "user_stats" ADD CONSTRAINT "user_stats_wins_non_negative" CHECK ("user_stats"."wins" >= 0);--> statement-breakpoint
ALTER TABLE "user_stats" ADD CONSTRAINT "user_stats_correct_keystrokes_non_negative" CHECK ("user_stats"."correctKeystrokes" >= 0);--> statement-breakpoint
ALTER TABLE "user_stats" ADD CONSTRAINT "user_stats_total_keystrokes_non_negative" CHECK ("user_stats"."totalKeystrokes" >= 0);