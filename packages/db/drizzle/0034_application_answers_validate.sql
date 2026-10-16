-- Validates the check 0033 added NOT VALID. VALIDATE takes a SHARE UPDATE EXCLUSIVE lock: reads and writes go on.
ALTER TABLE "application" VALIDATE CONSTRAINT "application_answers_check";
