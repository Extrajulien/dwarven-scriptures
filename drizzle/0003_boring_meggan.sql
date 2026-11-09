CREATE TABLE "invitation_links" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"roomId" bigint NOT NULL,
	"token" text NOT NULL,
	"status" varchar(16) DEFAULT 'unused' NOT NULL,
	"boundIp" varchar(45),
	"boundMemberId" bigint,
	"usedAt" timestamp with time zone,
	"revokedAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitation_links_token_unique" UNIQUE("token"),
	CONSTRAINT "invitation_links_status_valid" CHECK ("invitation_links"."status" in ('unused', 'used', 'revoked')),
	CONSTRAINT "invitation_links_used_requires_binding" CHECK ("invitation_links"."status" <> 'used' or ("invitation_links"."boundIp" is not null and "invitation_links"."boundMemberId" is not null and "invitation_links"."usedAt" is not null)),
	CONSTRAINT "invitation_links_revoked_requires_timestamp" CHECK ("invitation_links"."status" <> 'revoked' or "invitation_links"."revokedAt" is not null)
);
--> statement-breakpoint
CREATE TABLE "room_members" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"roomId" bigint NOT NULL,
	"userId" bigint,
	"guestToken" varchar(36),
	"role" varchar(16) NOT NULL,
	"joinedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"leftAt" timestamp with time zone,
	"kicked" boolean DEFAULT false NOT NULL,
	CONSTRAINT "room_members_role_valid" CHECK ("room_members"."role" in ('host', 'participant', 'spectator')),
	CONSTRAINT "room_members_exactly_one_identity" CHECK (("room_members"."userId" is null) <> ("room_members"."guestToken" is null))
);
--> statement-breakpoint
CREATE TABLE "rooms" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"publicId" uuid DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(6) NOT NULL,
	"hostUserId" bigint NOT NULL,
	"visibility" varchar(16) NOT NULL,
	"status" varchar(16) DEFAULT 'en_attente' NOT NULL,
	"capacity" integer DEFAULT 10 NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"closedAt" timestamp with time zone,
	CONSTRAINT "rooms_publicId_unique" UNIQUE("publicId"),
	CONSTRAINT "rooms_code_unique" UNIQUE("code"),
	CONSTRAINT "rooms_code_valid" CHECK ("rooms"."code" ~ '^[A-HJKMNP-Z2-9]{6}$'),
	CONSTRAINT "rooms_visibility_valid" CHECK ("rooms"."visibility" in ('public', 'code', 'private')),
	CONSTRAINT "rooms_status_valid" CHECK ("rooms"."status" in ('en_attente', 'decompte', 'en_course', 'resultats', 'fermee')),
	CONSTRAINT "rooms_capacity_range" CHECK ("rooms"."capacity" >= 2 and "rooms"."capacity" <= 30)
);
--> statement-breakpoint
ALTER TABLE "invitation_links" ADD CONSTRAINT "invitation_links_roomId_rooms_id_fk" FOREIGN KEY ("roomId") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation_links" ADD CONSTRAINT "invitation_links_boundMemberId_room_members_id_fk" FOREIGN KEY ("boundMemberId") REFERENCES "public"."room_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_members" ADD CONSTRAINT "room_members_roomId_rooms_id_fk" FOREIGN KEY ("roomId") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_members" ADD CONSTRAINT "room_members_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_hostUserId_users_id_fk" FOREIGN KEY ("hostUserId") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "room_members_one_active_user_idx" ON "room_members" USING btree ("userId") WHERE "room_members"."userId" is not null and "room_members"."leftAt" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "room_members_one_active_guest_idx" ON "room_members" USING btree ("guestToken") WHERE "room_members"."guestToken" is not null and "room_members"."leftAt" is null;--> statement-breakpoint
CREATE INDEX "room_members_room_id_idx" ON "room_members" USING btree ("roomId");