CREATE TABLE `raio_x_cache_visao_geral` (
  `id` int AUTO_INCREMENT NOT NULL,
  `unitId` int NOT NULL,
  `orgId` int NOT NULL,
  `mesRef` varchar(7) NOT NULL,
  `dados` json NOT NULL,
  `syncedAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `raio_x_cache_visao_geral_id` PRIMARY KEY(`id`)
);

CREATE TABLE `raio_x_cache_churn` (
  `id` int AUTO_INCREMENT NOT NULL,
  `unitId` int NOT NULL,
  `orgId` int NOT NULL,
  `mesRef` varchar(7) NOT NULL,
  `dados` json NOT NULL,
  `syncedAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `raio_x_cache_churn_id` PRIMARY KEY(`id`)
);

CREATE TABLE `raio_x_cache_cohort` (
  `id` int AUTO_INCREMENT NOT NULL,
  `unitId` int NOT NULL,
  `orgId` int NOT NULL,
  `mesRef` varchar(7) NOT NULL,
  `dados` json NOT NULL,
  `syncedAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `raio_x_cache_cohort_id` PRIMARY KEY(`id`)
);

CREATE TABLE `raio_x_cache_routing` (
  `id` int AUTO_INCREMENT NOT NULL,
  `unitId` int NOT NULL,
  `orgId` int NOT NULL,
  `mesRef` varchar(7) NOT NULL,
  `dados` json NOT NULL,
  `syncedAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `raio_x_cache_routing_id` PRIMARY KEY(`id`)
);

CREATE TABLE `raio_x_cache_sync_log` (
  `id` int AUTO_INCREMENT NOT NULL,
  `unitId` int NOT NULL,
  `orgId` int NOT NULL,
  `mesRef` varchar(7) NOT NULL,
  `tipo` varchar(30) NOT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'pending',
  `erro` text,
  `duracaoMs` int,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `raio_x_cache_sync_log_id` PRIMARY KEY(`id`)
);

ALTER TABLE `raio_x_cache_visao_geral` ADD CONSTRAINT `uq_raiox_vg_unit_mes` UNIQUE(`unitId`, `mesRef`);
ALTER TABLE `raio_x_cache_churn` ADD CONSTRAINT `uq_raiox_churn_unit_mes` UNIQUE(`unitId`, `mesRef`);
ALTER TABLE `raio_x_cache_cohort` ADD CONSTRAINT `uq_raiox_cohort_unit_mes` UNIQUE(`unitId`, `mesRef`);
ALTER TABLE `raio_x_cache_routing` ADD CONSTRAINT `uq_raiox_routing_unit_mes` UNIQUE(`unitId`, `mesRef`);

CREATE INDEX `idx_raiox_vg_unit` ON `raio_x_cache_visao_geral` (`unitId`);
CREATE INDEX `idx_raiox_vg_org` ON `raio_x_cache_visao_geral` (`orgId`);
CREATE INDEX `idx_raiox_churn_unit` ON `raio_x_cache_churn` (`unitId`);
CREATE INDEX `idx_raiox_cohort_unit` ON `raio_x_cache_cohort` (`unitId`);
CREATE INDEX `idx_raiox_routing_unit` ON `raio_x_cache_routing` (`unitId`);
CREATE INDEX `idx_raiox_sync_unit` ON `raio_x_cache_sync_log` (`unitId`);
CREATE INDEX `idx_raiox_sync_mes` ON `raio_x_cache_sync_log` (`mesRef`);
