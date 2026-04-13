-- Migration: sistema de usuários de unidade com e-mail/senha e perfis de acesso

CREATE TABLE IF NOT EXISTS `sys_roles` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `orgId` int NOT NULL,
  `name` varchar(100) NOT NULL,
  `description` text,
  `isSystem` int NOT NULL DEFAULT 0,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_sys_roles_org` (`orgId`)
);

CREATE TABLE IF NOT EXISTS `sys_users` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `orgId` int NOT NULL,
  `name` varchar(255) NOT NULL,
  `email` varchar(320) NOT NULL,
  `passwordHash` varchar(255) NOT NULL,
  `roleId` int,
  `active` int NOT NULL DEFAULT 1,
  `lastLoginAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_sys_users_org` (`orgId`),
  INDEX `idx_sys_users_email` (`email`)
);

CREATE TABLE IF NOT EXISTS `sys_user_units` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `sysUserId` int NOT NULL,
  `unitId` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_sys_user_units_user` (`sysUserId`),
  INDEX `idx_sys_user_units_unit` (`unitId`)
);

CREATE TABLE IF NOT EXISTS `sys_role_permissions` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `roleId` int NOT NULL,
  `moduleKey` varchar(100) NOT NULL,
  `sectionKey` varchar(100) NOT NULL,
  `canView` int NOT NULL DEFAULT 1,
  `canEdit` int NOT NULL DEFAULT 0,
  INDEX `idx_sys_role_perms_role` (`roleId`)
);
