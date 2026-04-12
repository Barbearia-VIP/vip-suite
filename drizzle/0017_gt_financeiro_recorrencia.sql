-- Migração: adicionar campos de recorrência na tabela gt_financeiro
ALTER TABLE `gt_financeiro`
  ADD COLUMN `recorrente` int NOT NULL DEFAULT 0 COMMENT '0=não | 1=sim (template)',
  ADD COLUMN `recorrenciaMeses` int DEFAULT NULL COMMENT 'null=indefinido | N=número de meses',
  ADD COLUMN `recorrenciaParentId` int DEFAULT NULL COMMENT 'ID do template pai',
  ADD COLUMN `recorrenciaDia` int DEFAULT NULL COMMENT 'dia do mês para vencimento (1-31)',
  ADD COLUMN `recorrenciaRef` varchar(30) DEFAULT NULL COMMENT 'chave única: {parentId}:{YYYY-MM}',
  ADD INDEX `idx_gt_fin_recorrente` (`recorrente`),
  ADD UNIQUE INDEX `uq_recorrencia_ref` (`recorrenciaRef`);
