CREATE TABLE `realtimeConnections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sessionId` int NOT NULL,
	`userId` int NOT NULL,
	`transport` enum('websocket','sse') NOT NULL,
	`channel` varchar(128) NOT NULL,
	`connectedAt` timestamp NOT NULL DEFAULT (now()),
	`lastHeartbeatAt` timestamp NOT NULL DEFAULT (now()),
	`disconnectedAt` timestamp,
	CONSTRAINT `realtimeConnections_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `userSessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`tokenHash` varchar(128) NOT NULL,
	`userAgent` varchar(512),
	`ipHash` varchar(128),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`lastSeenAt` timestamp NOT NULL DEFAULT (now()),
	`expiresAt` timestamp NOT NULL,
	`revokedAt` timestamp,
	CONSTRAINT `userSessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `userSessions_tokenHash_unique` UNIQUE(`tokenHash`)
);
--> statement-breakpoint
CREATE INDEX `realtime_connections_session_idx` ON `realtimeConnections` (`sessionId`);--> statement-breakpoint
CREATE INDEX `realtime_connections_user_idx` ON `realtimeConnections` (`userId`);--> statement-breakpoint
CREATE INDEX `realtime_connections_active_idx` ON `realtimeConnections` (`disconnectedAt`,`lastHeartbeatAt`);--> statement-breakpoint
CREATE INDEX `user_sessions_user_idx` ON `userSessions` (`userId`);--> statement-breakpoint
CREATE INDEX `user_sessions_expiry_idx` ON `userSessions` (`expiresAt`);--> statement-breakpoint
CREATE INDEX `user_sessions_active_idx` ON `userSessions` (`revokedAt`,`expiresAt`);