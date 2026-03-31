CREATE TABLE `ig_activity_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`unitId` int NOT NULL,
	`type` enum('comment_reply','story_reply','welcome','error','info','warning') NOT NULL,
	`message` text NOT NULL,
	`metadata` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ig_activity_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ig_approval_queue` (
	`id` int AUTO_INCREMENT NOT NULL,
	`unitId` int NOT NULL,
	`type` enum('comment','story') NOT NULL,
	`commentId` varchar(128),
	`postId` varchar(128),
	`authorName` varchar(120),
	`commentText` text,
	`suggestedReply` text,
	`status` enum('pending','approved','rejected','auto_approved') NOT NULL DEFAULT 'pending',
	`reviewedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ig_approval_queue_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ig_bot_stats` (
	`id` int AUTO_INCREMENT NOT NULL,
	`unitId` int NOT NULL,
	`date` date NOT NULL,
	`repliesCount` int NOT NULL DEFAULT 0,
	`storiesReplied` int NOT NULL DEFAULT 0,
	`errorsCount` int NOT NULL DEFAULT 0,
	`cyclesRun` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ig_bot_stats_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ig_config` (
	`id` int AUTO_INCREMENT NOT NULL,
	`unitId` int NOT NULL,
	`accessToken` text,
	`instagramUserId` varchar(64),
	`checkIntervalMinutes` int NOT NULL DEFAULT 5,
	`personalityPrompt` text,
	`storyPersonalityPrompt` text,
	`isActive` tinyint NOT NULL DEFAULT 0,
	`maxRepliesPerCycle` int NOT NULL DEFAULT 10,
	`skipOwnComments` tinyint NOT NULL DEFAULT 1,
	`requireApproval` tinyint NOT NULL DEFAULT 0,
	`lastRunAt` timestamp,
	`startedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ig_config_id` PRIMARY KEY(`id`),
	CONSTRAINT `ig_config_unitId_unique` UNIQUE(`unitId`)
);
--> statement-breakpoint
CREATE TABLE `ig_replied_comments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`unitId` int NOT NULL,
	`commentId` varchar(128) NOT NULL,
	`repliedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ig_replied_comments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ig_story_reply_config` (
	`id` int AUTO_INCREMENT NOT NULL,
	`unitId` int NOT NULL,
	`isActive` tinyint NOT NULL DEFAULT 0,
	`requireApproval` tinyint NOT NULL DEFAULT 0,
	`replyToMentions` tinyint NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ig_story_reply_config_id` PRIMARY KEY(`id`),
	CONSTRAINT `ig_story_reply_config_unitId_unique` UNIQUE(`unitId`)
);
--> statement-breakpoint
CREATE TABLE `ig_story_reply_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`unitId` int NOT NULL,
	`senderId` varchar(64) NOT NULL,
	`storyId` varchar(128),
	`storyUrl` text,
	`incomingText` text,
	`replyText` text,
	`isMention` tinyint DEFAULT 0,
	`status` enum('success','failed','pending_approval') NOT NULL DEFAULT 'success',
	`errorMessage` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ig_story_reply_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_ig_logs_unit_date` ON `ig_activity_logs` (`unitId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `idx_ig_approval_unit_status` ON `ig_approval_queue` (`unitId`,`status`);--> statement-breakpoint
CREATE INDEX `idx_ig_stats_unit_date` ON `ig_bot_stats` (`unitId`,`date`);--> statement-breakpoint
CREATE INDEX `idx_ig_config_unit` ON `ig_config` (`unitId`);--> statement-breakpoint
CREATE INDEX `idx_ig_replied_unit_comment` ON `ig_replied_comments` (`unitId`,`commentId`);--> statement-breakpoint
CREATE INDEX `idx_ig_story_config_unit` ON `ig_story_reply_config` (`unitId`);--> statement-breakpoint
CREATE INDEX `idx_ig_story_log_unit` ON `ig_story_reply_log` (`unitId`,`createdAt`);