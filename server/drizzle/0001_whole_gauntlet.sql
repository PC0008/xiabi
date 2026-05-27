DROP INDEX `users_phone_hash_idx`;--> statement-breakpoint
CREATE UNIQUE INDEX `users_tenant_phone_hash_idx` ON `users` (`tenant_id`,`phone_hash`);