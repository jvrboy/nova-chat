CREATE TABLE `agentExecutions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`conversationId` int,
	`agentId` varchar(64) NOT NULL,
	`agentName` varchar(128) NOT NULL,
	`input` text NOT NULL,
	`output` text,
	`toolResults` text,
	`stepsUsed` int NOT NULL DEFAULT 0,
	`duration` int NOT NULL DEFAULT 0,
	`status` enum('running','completed','error') NOT NULL DEFAULT 'running',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `agentExecutions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pipelineExecutions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`conversationId` int,
	`pipelineId` varchar(128) NOT NULL,
	`pipelineName` varchar(240) NOT NULL,
	`input` text NOT NULL,
	`output` text,
	`stepResults` text,
	`duration` int NOT NULL DEFAULT 0,
	`status` enum('running','completed','error') NOT NULL DEFAULT 'running',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `pipelineExecutions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `agent_executions_user_idx` ON `agentExecutions` (`userId`);--> statement-breakpoint
CREATE INDEX `agent_executions_conversation_idx` ON `agentExecutions` (`conversationId`);--> statement-breakpoint
CREATE INDEX `pipeline_executions_user_idx` ON `pipelineExecutions` (`userId`);