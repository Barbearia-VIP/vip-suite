-- Banco de Imagens VIP (para uso no gerador de artes e flyers)
CREATE TABLE IF NOT EXISTS `gt_image_bank` (
  `id` int AUTO_INCREMENT PRIMARY KEY NOT NULL,
  `org_id` int NOT NULL,
  `url` text NOT NULL,
  `file_key` text NOT NULL,
  `nome` varchar(255),
  `descricao` text,
  `tags` text,
  `criado_em` timestamp NOT NULL DEFAULT (now())
);
CREATE INDEX IF NOT EXISTS `idx_image_bank_org` ON `gt_image_bank` (`org_id`);
