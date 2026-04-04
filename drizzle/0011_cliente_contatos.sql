CREATE TABLE `cliente_contatos` (
  `id` int AUTO_INCREMENT NOT NULL,
  `clienteExtId` int NOT NULL,
  `orgId` int,
  `unitId` int,
  `mensagem` text,
  `criadoEm` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `cliente_contatos_id` PRIMARY KEY(`id`)
);

CREATE INDEX `idx_cliente_contatos_cliente` ON `cliente_contatos` (`clienteExtId`);
CREATE INDEX `idx_cliente_contatos_unit` ON `cliente_contatos` (`unitId`);
CREATE INDEX `idx_cliente_contatos_org` ON `cliente_contatos` (`orgId`);
