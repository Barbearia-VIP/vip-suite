CREATE TABLE `gt_advisor_conversations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orgId` int NOT NULL,
	`unitId` int,
	`userId` int NOT NULL,
	`messages` json NOT NULL,
	`titulo` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `gt_advisor_conversations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `gt_audit_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orgId` int NOT NULL,
	`unitId` int,
	`userId` int,
	`userName` varchar(255),
	`acao` varchar(50) NOT NULL,
	`entidade` varchar(100) NOT NULL,
	`entidadeId` int,
	`descricao` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `gt_audit_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `gt_cargos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orgId` int NOT NULL,
	`nome` varchar(255) NOT NULL,
	`descricao` text,
	`nivel` enum('operacional','tatico','estrategico') NOT NULL DEFAULT 'operacional',
	`salarioBase` decimal(10,2),
	`ativo` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `gt_cargos_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `gt_colaboradores` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orgId` int NOT NULL,
	`unitId` int,
	`nome` varchar(255) NOT NULL,
	`email` varchar(320),
	`telefone` varchar(20),
	`cargoId` int,
	`salario` decimal(10,2),
	`dataAdmissao` date,
	`status` enum('ativo','ferias','afastado','desligado') NOT NULL DEFAULT 'ativo',
	`avatarUrl` text,
	`observacoes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `gt_colaboradores_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `gt_compras` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orgId` int NOT NULL,
	`unitId` int,
	`fornecedorId` int,
	`fornecedorNome` varchar(255),
	`status` enum('rascunho','aguardando_aprovacao','aprovado','recebido','cancelado') NOT NULL DEFAULT 'rascunho',
	`itens` json,
	`total` decimal(15,2),
	`observacoes` text,
	`aprovadoPor` varchar(255),
	`aprovadoEm` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `gt_compras_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `gt_documentos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orgId` int NOT NULL,
	`unitId` int,
	`titulo` varchar(255) NOT NULL,
	`descricao` text,
	`categoria` varchar(100),
	`urlArquivo` text,
	`nomeArquivo` varchar(255),
	`tamanho` int,
	`versao` varchar(20) DEFAULT '1.0',
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `gt_documentos_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `gt_financeiro` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orgId` int NOT NULL,
	`unitId` int,
	`tipo` enum('receita','despesa') NOT NULL,
	`categoria` varchar(100),
	`descricao` varchar(255) NOT NULL,
	`valor` decimal(15,2) NOT NULL,
	`vencimento` date,
	`pago` int NOT NULL DEFAULT 0,
	`paidAt` date,
	`formaPagamento` varchar(50),
	`referencia` varchar(7),
	`observacoes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `gt_financeiro_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `gt_fornecedores` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orgId` int NOT NULL,
	`nome` varchar(255) NOT NULL,
	`cnpj` varchar(20),
	`email` varchar(320),
	`telefone` varchar(20),
	`categoria` varchar(100),
	`ativo` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `gt_fornecedores_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `gt_indicadores` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orgId` int NOT NULL,
	`unitId` int,
	`nome` varchar(255) NOT NULL,
	`descricao` text,
	`tipo` enum('numero','percentual','moeda','tempo') NOT NULL DEFAULT 'numero',
	`valorAtual` decimal(15,2),
	`meta` decimal(15,2),
	`periodo` varchar(7),
	`tendencia` enum('subindo','estavel','caindo') DEFAULT 'estavel',
	`cor` varchar(7) DEFAULT '#70dc8f',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `gt_indicadores_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `gt_instrucoes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orgId` int NOT NULL,
	`unitId` int,
	`titulo` varchar(255) NOT NULL,
	`conteudo` text,
	`categoria` varchar(100),
	`versao` varchar(20) DEFAULT '1.0',
	`ativo` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `gt_instrucoes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `gt_marketing` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orgId` int NOT NULL,
	`unitId` int,
	`nome` varchar(255) NOT NULL,
	`descricao` text,
	`canal` enum('instagram','facebook','whatsapp','email','google','offline','outro') NOT NULL DEFAULT 'instagram',
	`status` enum('planejamento','ativa','pausada','concluida') NOT NULL DEFAULT 'planejamento',
	`budget` decimal(15,2),
	`gasto` decimal(15,2),
	`alcance` int,
	`cliques` int,
	`conversoes` int,
	`dataInicio` date,
	`dataFim` date,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `gt_marketing_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `gt_oportunidades` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orgId` int NOT NULL,
	`unitId` int,
	`titulo` varchar(255) NOT NULL,
	`descricao` text,
	`prioridade` enum('baixa','media','alta') NOT NULL DEFAULT 'media',
	`status` enum('identificada','em_avaliacao','aprovada','implementando','concluida','descartada') NOT NULL DEFAULT 'identificada',
	`valorEstimado` decimal(15,2),
	`responsavel` varchar(255),
	`prazo` date,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `gt_oportunidades_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `gt_planejamento` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orgId` int NOT NULL,
	`unitId` int,
	`missao` text,
	`visao` text,
	`valores` text,
	`swotForcas` json,
	`swotFraquezas` json,
	`swotOportunidades` json,
	`swotAmeacas` json,
	`objetivos` json,
	`ano` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `gt_planejamento_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `gt_problemas` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orgId` int NOT NULL,
	`unitId` int,
	`titulo` varchar(255) NOT NULL,
	`descricao` text,
	`severidade` enum('baixa','media','alta','critica') NOT NULL DEFAULT 'media',
	`status` enum('aberto','em_analise','resolvido','fechado') NOT NULL DEFAULT 'aberto',
	`responsavel` varchar(255),
	`resolucao` text,
	`resolvidoEm` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `gt_problemas_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `gt_processos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orgId` int NOT NULL,
	`unitId` int,
	`nome` varchar(255) NOT NULL,
	`descricao` text,
	`categoria` varchar(100),
	`responsavel` varchar(255),
	`etapas` json,
	`ativo` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `gt_processos_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `gt_reunioes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orgId` int NOT NULL,
	`unitId` int,
	`titulo` varchar(255) NOT NULL,
	`data` timestamp NOT NULL,
	`duracao` int,
	`local` varchar(255),
	`pauta` text,
	`ata` text,
	`participantes` json,
	`status` enum('agendada','realizada','cancelada') NOT NULL DEFAULT 'agendada',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `gt_reunioes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `gt_riscos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orgId` int NOT NULL,
	`unitId` int,
	`titulo` varchar(255) NOT NULL,
	`descricao` text,
	`probabilidade` enum('baixa','media','alta') NOT NULL DEFAULT 'media',
	`impacto` enum('baixo','medio','alto') NOT NULL DEFAULT 'medio',
	`status` enum('identificado','monitorando','mitigado','aceito') NOT NULL DEFAULT 'identificado',
	`mitigacao` text,
	`responsavel` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `gt_riscos_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `gt_tarefas` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orgId` int NOT NULL,
	`unitId` int,
	`titulo` varchar(255) NOT NULL,
	`descricao` text,
	`status` enum('pendente','em_andamento','em_revisao','concluida') NOT NULL DEFAULT 'pendente',
	`prioridade` enum('baixa','media','alta','critica') NOT NULL DEFAULT 'media',
	`responsavel` varchar(255),
	`prazo` date,
	`concluidaEm` timestamp,
	`ordem` int NOT NULL DEFAULT 0,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `gt_tarefas_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `ig_config` MODIFY COLUMN `isActive` int NOT NULL;--> statement-breakpoint
ALTER TABLE `ig_config` MODIFY COLUMN `skipOwnComments` int NOT NULL DEFAULT 1;--> statement-breakpoint
ALTER TABLE `ig_config` MODIFY COLUMN `requireApproval` int NOT NULL;--> statement-breakpoint
ALTER TABLE `ig_story_reply_config` MODIFY COLUMN `isActive` int NOT NULL;--> statement-breakpoint
ALTER TABLE `ig_story_reply_config` MODIFY COLUMN `requireApproval` int NOT NULL;--> statement-breakpoint
ALTER TABLE `ig_story_reply_config` MODIFY COLUMN `replyToMentions` int NOT NULL DEFAULT 1;--> statement-breakpoint
ALTER TABLE `ig_story_reply_log` MODIFY COLUMN `isMention` int;--> statement-breakpoint
CREATE INDEX `idx_gt_advisor_org_user` ON `gt_advisor_conversations` (`orgId`,`userId`);--> statement-breakpoint
CREATE INDEX `idx_gt_audit_org` ON `gt_audit_log` (`orgId`);--> statement-breakpoint
CREATE INDEX `idx_gt_cargos_org` ON `gt_cargos` (`orgId`);--> statement-breakpoint
CREATE INDEX `idx_gt_colab_org_unit` ON `gt_colaboradores` (`orgId`,`unitId`);--> statement-breakpoint
CREATE INDEX `idx_gt_compras_org_status` ON `gt_compras` (`orgId`,`status`);--> statement-breakpoint
CREATE INDEX `idx_gt_docs_org` ON `gt_documentos` (`orgId`);--> statement-breakpoint
CREATE INDEX `idx_gt_fin_org_ref` ON `gt_financeiro` (`orgId`,`referencia`);--> statement-breakpoint
CREATE INDEX `idx_gt_fin_tipo` ON `gt_financeiro` (`tipo`);--> statement-breakpoint
CREATE INDEX `idx_gt_forn_org` ON `gt_fornecedores` (`orgId`);--> statement-breakpoint
CREATE INDEX `idx_gt_indicadores_org_periodo` ON `gt_indicadores` (`orgId`,`periodo`);--> statement-breakpoint
CREATE INDEX `idx_gt_instrucoes_org` ON `gt_instrucoes` (`orgId`);--> statement-breakpoint
CREATE INDEX `idx_gt_mkt_org_status` ON `gt_marketing` (`orgId`,`status`);--> statement-breakpoint
CREATE INDEX `idx_gt_opor_org_status` ON `gt_oportunidades` (`orgId`,`status`);--> statement-breakpoint
CREATE INDEX `idx_gt_planejamento_org_ano` ON `gt_planejamento` (`orgId`,`ano`);--> statement-breakpoint
CREATE INDEX `idx_gt_prob_org_status` ON `gt_problemas` (`orgId`,`status`);--> statement-breakpoint
CREATE INDEX `idx_gt_processos_org` ON `gt_processos` (`orgId`);--> statement-breakpoint
CREATE INDEX `idx_gt_reunioes_org_data` ON `gt_reunioes` (`orgId`,`data`);--> statement-breakpoint
CREATE INDEX `idx_gt_riscos_org` ON `gt_riscos` (`orgId`);--> statement-breakpoint
CREATE INDEX `idx_gt_tarefas_org_unit` ON `gt_tarefas` (`orgId`,`unitId`);--> statement-breakpoint
CREATE INDEX `idx_gt_tarefas_status` ON `gt_tarefas` (`status`);