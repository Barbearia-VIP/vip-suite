CREATE TABLE `ws_campanhas` (
	`id` int AUTO_INCREMENT NOT NULL,
	`unitId` int NOT NULL,
	`nome` varchar(255) NOT NULL,
	`descricao` text,
	`templateId` int,
	`mensagem` text NOT NULL,
	`tipo` enum('texto','imagem','arquivo') NOT NULL DEFAULT 'texto',
	`mediaUrl` varchar(512),
	`status` enum('rascunho','agendada','em_andamento','pausada','concluida','cancelada') NOT NULL DEFAULT 'rascunho',
	`agendadaPara` timestamp,
	`iniciadaEm` timestamp,
	`concluidaEm` timestamp,
	`totalContatos` int DEFAULT 0,
	`totalEnviados` int DEFAULT 0,
	`totalFalhas` int DEFAULT 0,
	`totalEntregues` int DEFAULT 0,
	`totalLidos` int DEFAULT 0,
	`intervaloSegundos` int DEFAULT 3,
	`criadoPor` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ws_campanhas_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ws_config` (
	`id` int AUTO_INCREMENT NOT NULL,
	`unitId` int NOT NULL,
	`wahaUrl` varchar(512) NOT NULL DEFAULT 'http://localhost:3001',
	`wahaApiKey` varchar(512),
	`sessionName` varchar(255) NOT NULL DEFAULT 'default',
	`sessionStatus` varchar(50) DEFAULT 'STOPPED',
	`sessionStatusAt` timestamp,
	`intervaloSegundos` int NOT NULL DEFAULT 3,
	`horarioInicio` varchar(5) DEFAULT '09:00',
	`horarioFim` varchar(5) DEFAULT '18:00',
	`maxEnviosDia` int DEFAULT 500,
	`isAtivo` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ws_config_id` PRIMARY KEY(`id`),
	CONSTRAINT `ws_config_unitId_unique` UNIQUE(`unitId`)
);
--> statement-breakpoint
CREATE TABLE `ws_contatos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`campanhaId` int NOT NULL,
	`unitId` int NOT NULL,
	`nome` varchar(255),
	`telefone` varchar(20) NOT NULL,
	`variaveis` text,
	`status` enum('pendente','enviado','falha','entregue','lido','bloqueado') NOT NULL DEFAULT 'pendente',
	`mensagemPersonalizada` text,
	`erroMensagem` varchar(512),
	`enviadoEm` timestamp,
	`messageId` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ws_contatos_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ws_lista_itens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`listaId` int NOT NULL,
	`unitId` int NOT NULL,
	`nome` varchar(255),
	`telefone` varchar(20) NOT NULL,
	`variaveis` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ws_lista_itens_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ws_listas_contatos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`unitId` int NOT NULL,
	`nome` varchar(255) NOT NULL,
	`descricao` text,
	`totalContatos` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ws_listas_contatos_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ws_templates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`unitId` int NOT NULL,
	`nome` varchar(255) NOT NULL,
	`conteudo` text NOT NULL,
	`tipo` enum('texto','imagem','arquivo') NOT NULL DEFAULT 'texto',
	`mediaUrl` varchar(512),
	`variaveis` text,
	`isAtivo` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ws_templates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_ws_campanhas_unit` ON `ws_campanhas` (`unitId`);--> statement-breakpoint
CREATE INDEX `idx_ws_campanhas_status` ON `ws_campanhas` (`status`);--> statement-breakpoint
CREATE INDEX `idx_ws_config_unit` ON `ws_config` (`unitId`);--> statement-breakpoint
CREATE INDEX `idx_ws_contatos_campanha` ON `ws_contatos` (`campanhaId`);--> statement-breakpoint
CREATE INDEX `idx_ws_contatos_unit` ON `ws_contatos` (`unitId`);--> statement-breakpoint
CREATE INDEX `idx_ws_contatos_status` ON `ws_contatos` (`status`);--> statement-breakpoint
CREATE INDEX `idx_ws_lista_itens_lista` ON `ws_lista_itens` (`listaId`);--> statement-breakpoint
CREATE INDEX `idx_ws_lista_itens_unit` ON `ws_lista_itens` (`unitId`);--> statement-breakpoint
CREATE INDEX `idx_ws_listas_unit` ON `ws_listas_contatos` (`unitId`);--> statement-breakpoint
CREATE INDEX `idx_ws_templates_unit` ON `ws_templates` (`unitId`);