CREATE TABLE `memoryEmbeddings` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `memoryKey` varchar(128) NOT NULL,
  `kind` enum('preference','fact','goal','conversation','tool-result') NOT NULL,
  `content` text NOT NULL,
  `tags` text NOT NULL,
  `embedding` text NOT NULL,
  `embeddingModel` varchar(128) NOT NULL DEFAULT 'nova-hash-v1',
  `embeddingDimensions` int NOT NULL DEFAULT 128,
  `importance` int NOT NULL DEFAULT 50,
  `retentionDays` int NOT NULL DEFAULT 365,
  `expiresAt` timestamp NULL,
  `lastAccessedAt` timestamp NOT NULL DEFAULT (now()),
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  `deletedAt` timestamp NULL,
  CONSTRAINT `memoryEmbeddings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `memory_embeddings_user_idx` ON `memoryEmbeddings` (`userId`);
--> statement-breakpoint
CREATE INDEX `memory_embeddings_expiry_idx` ON `memoryEmbeddings` (`expiresAt`);
--> statement-breakpoint
CREATE INDEX `memory_embeddings_key_idx` ON `memoryEmbeddings` (`memoryKey`);
