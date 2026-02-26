-- Rename all tables to use orchestapi_ prefix for easier management in shared DB environments
ALTER TABLE orchestrator.environments RENAME TO orchestapi_environments;
ALTER TABLE orchestrator.environment_variables RENAME TO orchestapi_environment_variables;
ALTER TABLE orchestrator.environment_headers RENAME TO orchestapi_environment_headers;
ALTER TABLE orchestrator.environment_connectors RENAME TO orchestapi_environment_connectors;
ALTER TABLE orchestrator.environment_files RENAME TO orchestapi_environment_files;
ALTER TABLE orchestrator.test_suites RENAME TO orchestapi_test_suites;
ALTER TABLE orchestrator.test_steps RENAME TO orchestapi_test_steps;
ALTER TABLE orchestrator.test_runs RENAME TO orchestapi_test_runs;
ALTER TABLE orchestrator.run_schedules RENAME TO orchestapi_run_schedules;
ALTER TABLE orchestrator.step_dependencies RENAME TO orchestapi_step_dependencies;
ALTER TABLE orchestrator.step_extract_variables RENAME TO orchestapi_step_extract_variables;
ALTER TABLE orchestrator.step_response_handlers RENAME TO orchestapi_step_response_handlers;
ALTER TABLE orchestrator.step_verifications RENAME TO orchestapi_step_verifications;
ALTER TABLE orchestrator.verification_assertions RENAME TO orchestapi_verification_assertions;
