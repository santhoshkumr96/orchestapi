-- Replace strict_match boolean with match_mode varchar (STRICT, FLEXIBLE, STRUCTURE)
ALTER TABLE orchestrator.orchestapi_step_response_validations
    ADD COLUMN match_mode VARCHAR(20) DEFAULT 'STRICT';

UPDATE orchestrator.orchestapi_step_response_validations
    SET match_mode = CASE WHEN strict_match = TRUE OR strict_match IS NULL THEN 'STRICT' ELSE 'FLEXIBLE' END;

ALTER TABLE orchestrator.orchestapi_step_response_validations
    DROP COLUMN strict_match;
