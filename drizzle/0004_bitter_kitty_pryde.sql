CREATE TABLE `cam_camera_config` (
	`id` int AUTO_INCREMENT NOT NULL,
	`unitId` int NOT NULL,
	`cameraType` enum('usb','ip') NOT NULL DEFAULT 'usb',
	`rtspUrl` text,
	`rtspLogin` varchar(255),
	`rtspPassword` varchar(255),
	`rtspProtocol` enum('rtsp','rtsps') DEFAULT 'rtsp',
	`active` boolean DEFAULT true,
	`detectionThreshold` decimal(3,2) DEFAULT '0.55',
	`cooldownSeconds` int DEFAULT 4,
	`captureWindowMs` int DEFAULT 1500,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `cam_camera_config_id` PRIMARY KEY(`id`),
	CONSTRAINT `cam_camera_config_unitId_unique` UNIQUE(`unitId`)
);
--> statement-breakpoint
CREATE TABLE `cam_metricas_horarias` (
	`id` int AUTO_INCREMENT NOT NULL,
	`unitId` int NOT NULL,
	`data` date NOT NULL,
	`hora` int NOT NULL,
	`totalDeteccoes` int DEFAULT 0,
	`satisfeitos` int DEFAULT 0,
	`neutros` int DEFAULT 0,
	`insatisfeitos` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `cam_metricas_horarias_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `cam_sentiment_timeline` (
	`id` int AUTO_INCREMENT NOT NULL,
	`unitId` int NOT NULL,
	`clienteId` int NOT NULL,
	`satisfactionLevel` enum('satisfied','neutral','unsatisfied') NOT NULL,
	`expression` varchar(50),
	`confidence` decimal(5,4),
	`faceImageUrl` text,
	`recordedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `cam_sentiment_timeline_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `cam_clientes` ADD `faceDescriptor` json;--> statement-breakpoint
ALTER TABLE `cam_clientes` ADD `faceImageUrl` text;--> statement-breakpoint
ALTER TABLE `cam_clientes` ADD `email` varchar(255);--> statement-breakpoint
ALTER TABLE `cam_clientes` ADD `telefone` varchar(50);--> statement-breakpoint
ALTER TABLE `cam_clientes` ADD `faixaEtaria` varchar(50);--> statement-breakpoint
ALTER TABLE `cam_clientes` ADD `genero` varchar(20);--> statement-breakpoint
ALTER TABLE `cam_clientes` ADD `satisfactionLevel` enum('satisfied','neutral','unsatisfied') DEFAULT 'neutral';--> statement-breakpoint
ALTER TABLE `cam_clientes` ADD `expression` enum('happy','neutral','angry','surprised','sad','disgusted','fearful') DEFAULT 'neutral';--> statement-breakpoint
ALTER TABLE `cam_clientes` ADD `confidenceScore` decimal(5,4);--> statement-breakpoint
ALTER TABLE `cam_clientes` ADD `visitCount` int DEFAULT 0;--> statement-breakpoint
ALTER TABLE `cam_clientes` ADD `lastSeenAt` timestamp;--> statement-breakpoint
CREATE INDEX `idx_cam_config_unit` ON `cam_camera_config` (`unitId`);--> statement-breakpoint
CREATE INDEX `idx_cam_horarias_unit_data` ON `cam_metricas_horarias` (`unitId`,`data`,`hora`);--> statement-breakpoint
CREATE INDEX `idx_cam_timeline_cliente` ON `cam_sentiment_timeline` (`clienteId`);--> statement-breakpoint
CREATE INDEX `idx_cam_timeline_unit_date` ON `cam_sentiment_timeline` (`unitId`,`recordedAt`);--> statement-breakpoint
CREATE INDEX `idx_cam_clientes_last_seen` ON `cam_clientes` (`unitId`,`lastSeenAt`);