-- ============================================================
-- REPLICAÇÃO LOCAL DO BANCO EXTERNO
-- Tabelas sync_* espelham as tabelas do banco externo com
-- unidade_id desnormalizado para queries ultra-rápidas.
-- ============================================================

-- Tabela de controle de sincronização por unidade
CREATE TABLE IF NOT EXISTS sync_controle (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  unidade_id      INT NOT NULL UNIQUE COMMENT 'ID da unidade no banco externo',
  ultima_sync     DATETIME NULL COMMENT 'Timestamp da última sincronização bem-sucedida',
  ultima_venda_id INT NULL COMMENT 'Maior ID de venda sincronizado',
  total_vendas    INT DEFAULT 0,
  total_vp        INT DEFAULT 0,
  total_clientes  INT DEFAULT 0,
  status          ENUM('idle','syncing','error') DEFAULT 'idle',
  erro_msg        TEXT NULL,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_unidade (unidade_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Colaboradores/usuários do banco externo
CREATE TABLE IF NOT EXISTS sync_usuarios (
  id              INT NOT NULL PRIMARY KEY COMMENT 'ID original do banco externo',
  unidade         INT NOT NULL,
  nome            VARCHAR(100) NOT NULL,
  status          INT NOT NULL DEFAULT 1,
  visivel_agenda  VARCHAR(10) NOT NULL DEFAULT 'sim',
  visivel_pdv     TINYINT(1) NOT NULL DEFAULT 1,
  visivel_dashboard TINYINT(1) NOT NULL DEFAULT 1,
  data_criacao    DATETIME NOT NULL,
  data_alteracao  DATETIME NULL,
  synced_at       DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_unidade (unidade),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Produtos/serviços do banco externo
CREATE TABLE IF NOT EXISTS sync_produtos (
  id              INT NOT NULL PRIMARY KEY COMMENT 'ID original do banco externo',
  unidade         INT NOT NULL,
  tipo            VARCHAR(15) NOT NULL,
  categoria       VARCHAR(15) NULL,
  nome            VARCHAR(100) NOT NULL,
  valor_venda     DOUBLE NOT NULL DEFAULT 0,
  status          TINYINT(1) NOT NULL DEFAULT 1,
  data_criacao    DATETIME NOT NULL,
  data_alteracao  DATETIME NULL,
  synced_at       DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_unidade (unidade),
  INDEX idx_tipo (tipo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Clientes do banco externo
CREATE TABLE IF NOT EXISTS sync_clientes (
  id                        INT NOT NULL PRIMARY KEY COMMENT 'ID original do banco externo',
  unidade_id                INT NOT NULL COMMENT 'Desnormalizado: unidade de cadastro do cliente',
  nome                      VARCHAR(100) NOT NULL,
  telefone                  VARCHAR(30) NULL,
  telefone_sem_mascara      VARCHAR(30) NULL,
  email                     VARCHAR(100) NULL,
  data_nascimento           DATETIME NULL,
  ultima_visita             DATETIME NULL,
  ultima_visita_unidade     INT NULL,
  ultima_visita_colaborador INT NULL,
  status                    INT NOT NULL DEFAULT 1,
  data_criacao              DATETIME NOT NULL,
  data_alteracao            DATETIME NULL,
  synced_at                 DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_unidade (unidade_id),
  INDEX idx_status_unidade (status, unidade_id),
  INDEX idx_ultima_visita (ultima_visita),
  INDEX idx_ultima_visita_unidade (ultima_visita_unidade)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Vendas (comandas) do banco externo — com unidade_id desnormalizado
CREATE TABLE IF NOT EXISTS sync_vendas (
  id                INT NOT NULL PRIMARY KEY COMMENT 'ID original do banco externo',
  unidade_id        INT NOT NULL COMMENT 'Desnormalizado via usuarios.unidade',
  usuario           INT NOT NULL COMMENT 'ID do colaborador que registrou',
  cliente           INT NULL,
  caixa             INT NULL,
  valor_total       DOUBLE NULL DEFAULT 0,
  desconto_total    DOUBLE NULL DEFAULT 0,
  cancelado_motivo  VARCHAR(100) NULL,
  data_criacao      DATETIME NOT NULL,
  data_alteracao    DATETIME NULL,
  comanda_temp      TINYINT NOT NULL DEFAULT 0,
  status            INT NULL DEFAULT 1,
  synced_at         DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_unidade_data (unidade_id, data_criacao),
  INDEX idx_unidade_status (unidade_id, status, comanda_temp),
  INDEX idx_cliente (cliente),
  INDEX idx_usuario (usuario),
  INDEX idx_data_criacao (data_criacao)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Itens de venda (vendas_produtos) — com unidade_id desnormalizado
CREATE TABLE IF NOT EXISTS sync_vendas_produtos (
  id                      INT NOT NULL PRIMARY KEY COMMENT 'ID original do banco externo',
  venda                   INT NOT NULL,
  unidade_id              INT NOT NULL COMMENT 'Desnormalizado via colaborador→usuarios.unidade',
  colaborador             INT NOT NULL,
  produto                 INT NOT NULL,
  quantidade              DOUBLE NOT NULL DEFAULT 1,
  valor_unitario          DOUBLE NOT NULL DEFAULT 0,
  valor_desconto          DOUBLE NULL DEFAULT 0,
  valor_total             DOUBLE NOT NULL DEFAULT 0,
  valor_total_relatorio   DOUBLE NOT NULL DEFAULT 0,
  comissao                DOUBLE NOT NULL DEFAULT 0,
  synced_at               DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_unidade_colab (unidade_id, colaborador),
  INDEX idx_unidade_produto (unidade_id, produto),
  INDEX idx_venda (venda),
  INDEX idx_colaborador (colaborador)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Pagamentos de venda
CREATE TABLE IF NOT EXISTS sync_vendas_pagamentos (
  id              INT NOT NULL PRIMARY KEY COMMENT 'ID original do banco externo',
  venda           INT NOT NULL,
  forma_pagamento INT NOT NULL,
  valor           DOUBLE NOT NULL DEFAULT 0,
  synced_at       DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_venda (venda)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Formas de pagamento (tabela pequena, sync completo)
CREATE TABLE IF NOT EXISTS sync_formas_pagamentos (
  id    INT NOT NULL PRIMARY KEY,
  nome  VARCHAR(100) NOT NULL,
  tipo  VARCHAR(50) NULL,
  synced_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
