-- Configuração Financeira: taxas de cartão, taxa bancária
CREATE TABLE IF NOT EXISTS `gt_fin_config` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `orgId` int NOT NULL,
  `unitId` int,
  `taxaCredito` decimal(5,2) NOT NULL DEFAULT '0',
  `taxaDebito` decimal(5,2) NOT NULL DEFAULT '0',
  `taxaBancaria` decimal(10,2) NOT NULL DEFAULT '0',
  `taxaBancariaAtiva` int NOT NULL DEFAULT 0,
  `taxaBancariaDia` int NOT NULL DEFAULT 1,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_gt_fin_config_org` (`orgId`, `unitId`)
);

-- Funcionários CLT
CREATE TABLE IF NOT EXISTS `gt_funcionarios_clt` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `orgId` int NOT NULL,
  `unitId` int,
  `nome` varchar(255) NOT NULL,
  `cargo` varchar(255),
  `salario` decimal(10,2) NOT NULL,
  `diaPagamento` int NOT NULL DEFAULT 5,
  `ativo` int NOT NULL DEFAULT 1,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_gt_func_clt_org` (`orgId`, `unitId`)
);
