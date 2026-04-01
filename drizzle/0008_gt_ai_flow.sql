-- Migration: Adicionar colunas para fluxo de IA no Gestão Total
-- gt_processos: tipo, area, recursos, metricas, riscos, duracaoEstimada, status, geradoPorIA
-- gt_instrucoes: processoId, plano, responsavelId, responsavelNome, status, geradoPorIA

-- ── gt_processos ─────────────────────────────────────────────────────────────
ALTER TABLE `gt_processos`
  ADD COLUMN `tipo` ENUM('principal', 'apoio') NOT NULL DEFAULT 'principal' AFTER `descricao`,
  ADD COLUMN `area` VARCHAR(100) AFTER `categoria`,
  ADD COLUMN `recursos` JSON AFTER `etapas`,
  ADD COLUMN `metricas` JSON AFTER `recursos`,
  ADD COLUMN `riscos` JSON AFTER `metricas`,
  ADD COLUMN `duracaoEstimada` VARCHAR(100) AFTER `riscos`,
  ADD COLUMN `status` ENUM('ativo', 'inativo', 'em_revisao') NOT NULL DEFAULT 'ativo' AFTER `duracaoEstimada`,
  ADD COLUMN `geradoPorIA` INT NOT NULL DEFAULT 0 AFTER `status`;

-- Migrar campo ativo → status (ativo=1 → 'ativo', ativo=0 → 'inativo')
UPDATE `gt_processos` SET `status` = CASE WHEN `ativo` = 1 THEN 'ativo' ELSE 'inativo' END;

-- ── gt_instrucoes ─────────────────────────────────────────────────────────────
ALTER TABLE `gt_instrucoes`
  ADD COLUMN `processoId` INT AFTER `unitId`,
  ADD COLUMN `plano` JSON AFTER `conteudo`,
  ADD COLUMN `responsavelId` INT AFTER `categoria`,
  ADD COLUMN `responsavelNome` VARCHAR(255) AFTER `responsavelId`,
  ADD COLUMN `status` ENUM('pendente', 'em_andamento', 'concluida', 'pausada') NOT NULL DEFAULT 'pendente' AFTER `responsavelNome`,
  ADD COLUMN `geradoPorIA` INT NOT NULL DEFAULT 0 AFTER `status`;

-- Migrar campo ativo → status
UPDATE `gt_instrucoes` SET `status` = CASE WHEN `ativo` = 1 THEN 'pendente' ELSE 'pausada' END;
