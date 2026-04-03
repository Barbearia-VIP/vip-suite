CREATE TABLE `servico_categorias` (
  `id` int AUTO_INCREMENT NOT NULL,
  `orgId` int NOT NULL,
  `nomeServico` varchar(255) NOT NULL,
  `categoria` enum('base','extra') NOT NULL DEFAULT 'extra',
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `servico_categorias_id` PRIMARY KEY(`id`)
);

CREATE INDEX `idx_servico_categorias_org` ON `servico_categorias` (`orgId`);
CREATE UNIQUE INDEX `idx_servico_categorias_org_nome` ON `servico_categorias` (`orgId`, `nomeServico`);
