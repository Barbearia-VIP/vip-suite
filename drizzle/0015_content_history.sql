-- Histórico de Conteúdos Gerados (Gerador de Conteúdo - Marketing)
CREATE TABLE IF NOT EXISTS `gt_content_history` (
  `id` int AUTO_INCREMENT PRIMARY KEY NOT NULL,
  `orgId` int NOT NULL,
  `unitId` int,
  `createdBy` int NOT NULL,
  `objetivo` varchar(255) NOT NULL,
  `formato` varchar(100) NOT NULL,
  `tipoEntrega` varchar(100) NOT NULL,
  `publico` varchar(255) NOT NULL,
  `diferenciais` text NOT NULL,
  `tom` varchar(100) NOT NULL,
  `ideias` json NOT NULL,
  `titulo` varchar(255),
  `favoritado` boolean NOT NULL DEFAULT false,
  `createdAt` timestamp NOT NULL DEFAULT (now())
);

CREATE INDEX `idx_content_history_org` ON `gt_content_history` (`orgId`);
CREATE INDEX `idx_content_history_unit` ON `gt_content_history` (`unitId`);
CREATE INDEX `idx_content_history_created` ON `gt_content_history` (`createdAt`);
