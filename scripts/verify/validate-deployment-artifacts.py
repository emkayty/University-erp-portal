#!/usr/bin/env python3
"""Lightweight offline syntax/topology checks for UniPortal deployment artifacts."""
from __future__ import annotations

import json
from pathlib import Path
import sys

try:
    import yaml
except ImportError as exc:  # pragma: no cover
    raise SystemExit("PyYAML is required to validate YAML deployment artifacts.") from exc

ROOT = Path(__file__).resolve().parents[2]


def read_json(relative: str) -> dict:
    with (ROOT / relative).open(encoding="utf-8") as handle:
        return json.load(handle)


def read_yaml(relative: str) -> dict:
    with (ROOT / relative).open(encoding="utf-8") as handle:
        return yaml.safe_load(handle)


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def main() -> None:
    render = read_yaml("render.yaml")
    services = {service["name"]: service for service in render["services"]}
    databases = {database["name"]: database for database in render["databases"]}
    api = services.get("uniportal-api") or services.get("uniportal-api-worker-test")
    worker = services.get("uniportal-worker") or services.get("uniportal-worker-test")
    redis = services.get("uniportal-redis") or services.get("uniportal-redis-test")
    database = databases.get("uniportal-db") or databases.get("uniportal-db-test")
    require(api is not None and worker is not None and redis is not None, "Render topology is incomplete")
    require(api["type"] == "web", "Render API must be a web service")
    require(api["healthCheckPath"] == "/api/health/live", "Render API probe must use public liveness")
    require(api.get("dockerCommand") == "/app/scripts/start-api.sh", "Render API must run the API-only entrypoint")
    require(api.get("preDeployCommand") is None, "Render API must not seed during deploy")
    api_env = {entry["key"]: entry.get("value") for entry in api.get("envVars", [])}
    require(api_env.get("RUN_DB_SCHEMA") == "false", "Render API must not run schema deployment during startup")
    require(api_env.get("RUN_DB_SEED") == "false", "Render API must not seed during startup")
    require(worker["type"] == "worker", "Render worker must be a background worker")
    require(worker.get("dockerCommand") == "/app/scripts/start-worker.sh", "Render worker must use the worker entrypoint")
    require(redis.get("persistenceMode") != "off", "Render Redis must persist BullMQ data")
    require(database is not None, "Render database is missing")

    local = read_yaml("docker-compose.local.yml")
    local_services = local["services"]
    require(set(local_services) == {"postgres", "redis"}, "Local profile must contain only PostgreSQL and Redis")
    require(local_services["postgres"]["image"].startswith("pgvector/pgvector"), "Local PostgreSQL must provide pgvector")
    require(local_services["postgres"].get("mem_limit") == "768m", "Local PostgreSQL memory limit drifted")
    require(local_services["redis"].get("mem_limit") == "192m", "Local Redis memory limit drifted")
    require("pgadmin" not in local_services and "redis-commander" not in local_services, "Local profile must not include admin UIs")

    compose = read_yaml("docker-compose.prod.yml")
    compose_services = compose["services"]
    require({"postgres", "redis", "api", "worker", "web", "schema"} <= compose_services.keys(), "Compose topology is incomplete")
    require(compose_services["api"]["environment"]["RUN_DB_SCHEMA"] == "false", "API must not run DDL during normal startup")
    require(compose_services["worker"]["command"] == ["/app/scripts/start-worker.sh"], "Worker must use the worker entrypoint")

    for relative in ("infra/gcp/api-service.yaml", "infra/gcp/worker-service.yaml", "infra/gcp/web-service.yaml"):
        service = read_yaml(relative)
        require(service["apiVersion"] == "serving.knative.dev/v1", f"{relative} is not a Cloud Run service")
        require(service["kind"] == "Service", f"{relative} must be a Service")

    gcp_worker = read_yaml("infra/gcp/worker-service.yaml")
    annotations = gcp_worker["spec"]["template"]["metadata"]["annotations"]
    require(annotations["autoscaling.knative.dev/maxScale"] == "1", "Cloud Run worker must remain singleton")
    require(annotations["run.googleapis.com/cpu-throttling"] == "false", "Cloud Run worker must retain CPU outside requests")

    for relative in (
        "infra/aws/task-definition-api.json",
        "infra/aws/task-definition-worker.json",
        "infra/aws/task-definition-web.json",
        "apps/web/vercel.json",
    ):
        document = read_json(relative)
        require(isinstance(document, dict), f"{relative} did not parse to an object")

    api_task = read_json("infra/aws/task-definition-api.json")
    worker_task = read_json("infra/aws/task-definition-worker.json")
    require(api_task["requiresCompatibilities"] == ["FARGATE"], "API task must target Fargate")
    require(worker_task["containerDefinitions"][0]["command"] == ["/app/scripts/start-worker.sh"], "ECS worker command is incorrect")
    print("Deployment artifact validation passed.")


if __name__ == "__main__":
    main()
