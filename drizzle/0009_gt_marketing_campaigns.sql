-- Migration: gt_marketing_campaigns
-- Tabela para campanhas de marketing geradas com IA

CREATE TABLE IF NOT EXISTS `gt_marketing_campaigns` (
  `id` int AUTO_INCREMENT NOT NULL,
  `orgId` int NOT NULL,
  `unitId` int,
  `campaignName` varchar(500) NOT NULL,
  `status` varchar(50) NOT NULL DEFAULT 'draft',
  `version` varchar(20) NOT NULL DEFAULT 'v1',
  `wizardResponses` json,
  `internalDataUsed` json,
  `executiveSummary` text,
  `personas` json,
  `messages` json,
  `channelMix` json,
  `budgetSplit` json,
  `calendar90d` json,
  `contentIdeas` json,
  `adsKits` json,
  `crmFlows` json,
  `landingPage` json,
  `kpisTargets` json,
  `experimentsBacklog` json,
  `risksCompliance` json,
  `assumptions` json,
  `jsonBlob` json,
  `assignedToId` int,
  `assignedToName` varchar(255),
  `assignedAt` timestamp,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `gt_marketing_campaigns_id` PRIMARY KEY(`id`)
);

CREATE INDEX IF NOT EXISTS `idx_gt_mkt_camp_org` ON `gt_marketing_campaigns` (`orgId`, `status`);
