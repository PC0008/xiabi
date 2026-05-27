CREATE TABLE `product_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`user_id` text,
	`session_id` text,
	`name` text NOT NULL,
	`audience` text,
	`value` text,
	`proof` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`session_id`) REFERENCES `guest_sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `product_profiles_tenant_user_idx` ON `product_profiles` (`tenant_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `product_profiles_session_idx` ON `product_profiles` (`session_id`);--> statement-breakpoint
CREATE INDEX `product_profiles_status_idx` ON `product_profiles` (`status`);