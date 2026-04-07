CREATE TABLE IF NOT EXISTS `metas_dinamicas` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `orgId` int NOT NULL,
  `unitId` int NOT NULL,
  `nome` varchar(255) NOT NULL,
  `tipo` varchar(50) NOT NULL,
  `config` text NOT NULL,
  `bonusTipo` varchar(20) NOT NULL DEFAULT 'fixo',
  `bonusValor` decimal(10,2) NOT NULL DEFAULT '0.00',
  `mesVigencia` varchar(7),
  `ativo` int NOT NULL DEFAULT 1,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_metas_dinamicas_unit` (`unitId`),
  INDEX `idx_metas_dinamicas_org` (`orgId`)
);
