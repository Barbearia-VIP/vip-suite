CREATE TABLE `meta_faixas` (
	`id` int AUTO_INCREMENT NOT NULL,
	`unitId` int NOT NULL,
	`orgId` int NOT NULL,
	`ordem` int NOT NULL DEFAULT 0,
	`valorMinServicos` decimal(12,2) NOT NULL DEFAULT '0',
	`pctComissao` decimal(5,2) NOT NULL,
	`descricao` varchar(255),
	`ativo` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `meta_faixas_id` PRIMARY KEY(`id`)
);

CREATE INDEX `idx_meta_faixas_unit` ON `meta_faixas` (`unitId`);
CREATE INDEX `idx_meta_faixas_org` ON `meta_faixas` (`orgId`);
