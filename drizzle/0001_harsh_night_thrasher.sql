CREATE TABLE `audit_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`unitId` int,
	`acao` varchar(255) NOT NULL,
	`entidade` varchar(100),
	`entidadeId` varchar(100),
	`detalhes` json,
	`ip` varchar(45),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `audit_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `avaliacoes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`unitId` int NOT NULL,
	`plataforma` enum('google','ifood','tripadvisor','ubereats','rappi','outro') NOT NULL,
	`externalId` varchar(255),
	`autorNome` varchar(255),
	`nota` decimal(3,1),
	`comentario` text,
	`sentimento` enum('positivo','neutro','negativo'),
	`resposta` text,
	`respondidoEm` timestamp,
	`dataAvaliacao` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `avaliacoes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `cam_clientes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`unitId` int NOT NULL,
	`externalId` varchar(100),
	`nome` varchar(255),
	`fotoUrl` text,
	`expressao` enum('satisfeito','neutro','insatisfeito'),
	`totalVisitas` int DEFAULT 0,
	`ultimaVisita` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `cam_clientes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `cam_metricas_diarias` (
	`id` int AUTO_INCREMENT NOT NULL,
	`unitId` int NOT NULL,
	`data` date NOT NULL,
	`totalDeteccoes` int DEFAULT 0,
	`satisfeitos` int DEFAULT 0,
	`neutros` int DEFAULT 0,
	`insatisfeitos` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `cam_metricas_diarias_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `colaboradores` (
	`id` int AUTO_INCREMENT NOT NULL,
	`unitId` int NOT NULL,
	`externalId` varchar(100),
	`nome` varchar(255) NOT NULL,
	`cargo` varchar(100),
	`email` varchar(320),
	`telefone` varchar(20),
	`ativo` boolean NOT NULL DEFAULT true,
	`dataAdmissao` date,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `colaboradores_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `financial_transactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`unitId` int NOT NULL,
	`tipo` enum('receita','despesa') NOT NULL,
	`categoria` varchar(100),
	`descricao` varchar(500) NOT NULL,
	`valor` decimal(12,2) NOT NULL,
	`dataTransacao` date NOT NULL,
	`status` enum('pendente','pago','cancelado') NOT NULL DEFAULT 'pendente',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `financial_transactions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `indicadores` (
	`id` int AUTO_INCREMENT NOT NULL,
	`unitId` int NOT NULL,
	`nome` varchar(255) NOT NULL,
	`descricao` text,
	`unidade` varchar(50),
	`meta` decimal(12,2),
	`valorAtual` decimal(12,2),
	`periodicidade` enum('diario','semanal','mensal','trimestral','anual') DEFAULT 'mensal',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `indicadores_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `instagram_metricas` (
	`id` int AUTO_INCREMENT NOT NULL,
	`unitId` int NOT NULL,
	`data` date NOT NULL,
	`seguidores` int DEFAULT 0,
	`novosSeguidores` int DEFAULT 0,
	`impressoes` int DEFAULT 0,
	`alcance` int DEFAULT 0,
	`comentariosRespondidos` int DEFAULT 0,
	`boasVindasEnviadas` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `instagram_metricas_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `metas` (
	`id` int AUTO_INCREMENT NOT NULL,
	`unitId` int NOT NULL,
	`mes` int NOT NULL,
	`ano` int NOT NULL,
	`valorMeta` decimal(12,2) NOT NULL,
	`valorRealizado` decimal(12,2) DEFAULT '0',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `metas_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `module_access` (
	`id` int AUTO_INCREMENT NOT NULL,
	`unitId` int NOT NULL,
	`module` enum('data_vip','gestao_total','vip_cam','reputacao','auto_instagram','we_send') NOT NULL,
	`enabled` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `module_access_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `module_configs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`unitId` int NOT NULL,
	`module` enum('data_vip','gestao_total','vip_cam','reputacao','auto_instagram','we_send') NOT NULL,
	`config` json NOT NULL,
	`active` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `module_configs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `organizations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`slug` varchar(100) NOT NULL,
	`logoUrl` text,
	`primaryColor` varchar(7) DEFAULT '#1a1a2e',
	`segment` varchar(100),
	`ownerId` int NOT NULL,
	`active` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `organizations_id` PRIMARY KEY(`id`),
	CONSTRAINT `organizations_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `processos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`unitId` int NOT NULL,
	`nome` varchar(255) NOT NULL,
	`descricao` text,
	`responsavel` varchar(255),
	`status` enum('ativo','inativo','revisao') NOT NULL DEFAULT 'ativo',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `processos_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sync_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`unitId` int NOT NULL,
	`status` enum('running','success','error') NOT NULL,
	`registrosImportados` int DEFAULT 0,
	`erro` text,
	`iniciadoEm` timestamp NOT NULL DEFAULT (now()),
	`finalizadoEm` timestamp,
	CONSTRAINT `sync_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`unitId` int NOT NULL,
	`titulo` varchar(500) NOT NULL,
	`descricao` text,
	`status` enum('pendente','em_andamento','concluida','cancelada') NOT NULL DEFAULT 'pendente',
	`prioridade` enum('baixa','media','alta','critica') NOT NULL DEFAULT 'media',
	`responsavelId` int,
	`dataVencimento` timestamp,
	`concluidaEm` timestamp,
	`createdById` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `tasks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `units` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orgId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`slug` varchar(100) NOT NULL,
	`address` text,
	`city` varchar(100),
	`state` varchar(2),
	`phone` varchar(20),
	`externalId` varchar(100),
	`active` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `units_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `user_profiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`orgId` int NOT NULL,
	`unitId` int,
	`role` enum('master','org_admin','unit_manager','team_lead','colaborador') NOT NULL,
	`active` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `user_profiles_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `vendas` (
	`id` int AUTO_INCREMENT NOT NULL,
	`unitId` int NOT NULL,
	`externalId` varchar(100),
	`clienteNome` varchar(255),
	`clienteId` varchar(100),
	`colaboradorNome` varchar(255),
	`colaboradorId` varchar(100),
	`valorBruto` decimal(10,2),
	`valorLiquido` decimal(10,2),
	`desconto` decimal(10,2) DEFAULT '0',
	`servicos` json,
	`dataVenda` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `vendas_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `whatsapp_campanhas` (
	`id` int AUTO_INCREMENT NOT NULL,
	`unitId` int NOT NULL,
	`nome` varchar(255) NOT NULL,
	`mensagem` text NOT NULL,
	`tipoMidia` enum('texto','imagem','arquivo') DEFAULT 'texto',
	`totalContatos` int DEFAULT 0,
	`enviados` int DEFAULT 0,
	`erros` int DEFAULT 0,
	`status` enum('rascunho','enviando','concluida','cancelada') NOT NULL DEFAULT 'rascunho',
	`iniciadoEm` timestamp,
	`finalizadoEm` timestamp,
	`createdById` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `whatsapp_campanhas_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_audit_user` ON `audit_log` (`userId`);--> statement-breakpoint
CREATE INDEX `idx_audit_unit` ON `audit_log` (`unitId`);--> statement-breakpoint
CREATE INDEX `idx_avaliacoes_unit_plataforma` ON `avaliacoes` (`unitId`,`plataforma`);--> statement-breakpoint
CREATE INDEX `idx_avaliacoes_unit_data` ON `avaliacoes` (`unitId`,`dataAvaliacao`);--> statement-breakpoint
CREATE INDEX `idx_cam_clientes_unit` ON `cam_clientes` (`unitId`);--> statement-breakpoint
CREATE INDEX `idx_cam_metricas_unit_data` ON `cam_metricas_diarias` (`unitId`,`data`);--> statement-breakpoint
CREATE INDEX `idx_colaboradores_unit` ON `colaboradores` (`unitId`);--> statement-breakpoint
CREATE INDEX `idx_financial_unit_data` ON `financial_transactions` (`unitId`,`dataTransacao`);--> statement-breakpoint
CREATE INDEX `idx_instagram_unit_data` ON `instagram_metricas` (`unitId`,`data`);--> statement-breakpoint
CREATE INDEX `idx_metas_unit_periodo` ON `metas` (`unitId`,`ano`,`mes`);--> statement-breakpoint
CREATE INDEX `idx_module_configs_unit_module` ON `module_configs` (`unitId`,`module`);--> statement-breakpoint
CREATE INDEX `idx_tasks_unit_status` ON `tasks` (`unitId`,`status`);--> statement-breakpoint
CREATE INDEX `idx_user_profiles_user` ON `user_profiles` (`userId`);--> statement-breakpoint
CREATE INDEX `idx_user_profiles_unit` ON `user_profiles` (`unitId`);--> statement-breakpoint
CREATE INDEX `idx_vendas_unit_data` ON `vendas` (`unitId`,`dataVenda`);--> statement-breakpoint
CREATE INDEX `idx_vendas_colaborador` ON `vendas` (`colaboradorId`);--> statement-breakpoint
CREATE INDEX `idx_whatsapp_campanhas_unit` ON `whatsapp_campanhas` (`unitId`);