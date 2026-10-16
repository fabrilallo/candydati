-- Validates the check 0035 added NOT VALID. VALIDATE takes a SHARE UPDATE EXCLUSIVE lock: reads and writes go on.
ALTER TABLE "migration_batch" VALIDATE CONSTRAINT "migration_batch_part_check";
