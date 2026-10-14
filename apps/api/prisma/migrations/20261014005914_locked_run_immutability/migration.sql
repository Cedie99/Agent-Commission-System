-- Defense in depth: a LOCKED compute run and its results are immutable at the DB level,
-- independent of application code. The service layer enforces the same rule.

CREATE OR REPLACE FUNCTION ocs_guard_locked_run() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'LOCKED' THEN
      RAISE EXCEPTION 'ComputeRun % is LOCKED and cannot be deleted', OLD.id USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.status = 'LOCKED' THEN
    RAISE EXCEPTION 'ComputeRun % is LOCKED and cannot be modified', OLD.id USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER compute_run_locked_guard
  BEFORE UPDATE OR DELETE ON "ComputeRun"
  FOR EACH ROW EXECUTE FUNCTION ocs_guard_locked_run();

CREATE OR REPLACE FUNCTION ocs_guard_locked_result_line() RETURNS trigger AS $$
DECLARE
  run_status "RunStatus";
  rid uuid;
BEGIN
  rid := CASE WHEN TG_OP = 'DELETE' THEN OLD."runId" ELSE NEW."runId" END;
  SELECT status INTO run_status FROM "ComputeRun" WHERE id = rid;
  IF run_status = 'LOCKED' THEN
    RAISE EXCEPTION 'Results of LOCKED ComputeRun % are immutable', rid USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD."runId" <> NEW."runId" THEN
    SELECT status INTO run_status FROM "ComputeRun" WHERE id = OLD."runId";
    IF run_status = 'LOCKED' THEN
      RAISE EXCEPTION 'Results of LOCKED ComputeRun % are immutable', OLD."runId" USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER compute_result_line_locked_guard
  BEFORE INSERT OR UPDATE OR DELETE ON "ComputeResultLine"
  FOR EACH ROW EXECUTE FUNCTION ocs_guard_locked_result_line();

CREATE OR REPLACE FUNCTION ocs_guard_locked_component() RETURNS trigger AS $$
DECLARE
  run_status "RunStatus";
  lid uuid;
BEGIN
  lid := CASE WHEN TG_OP = 'DELETE' THEN OLD."resultLineId" ELSE NEW."resultLineId" END;
  SELECT r.status INTO run_status
    FROM "ComputeResultLine" l JOIN "ComputeRun" r ON r.id = l."runId"
   WHERE l.id = lid;
  IF run_status = 'LOCKED' THEN
    RAISE EXCEPTION 'Components of a LOCKED ComputeRun are immutable' USING ERRCODE = 'check_violation';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER commission_component_locked_guard
  BEFORE INSERT OR UPDATE OR DELETE ON "CommissionComponent"
  FOR EACH ROW EXECUTE FUNCTION ocs_guard_locked_component();

-- Audit log is append-only.
CREATE OR REPLACE FUNCTION ocs_audit_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'AuditLog is append-only' USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_append_only
  BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION ocs_audit_append_only();
