"""AWS Lambda entry point for authenticated scoreboard writes."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
from datetime import datetime
from typing import Any, Protocol

try:
    from scoreboard_core.scoring import (
        ConflictError,
        ScoreboardError,
        SessionInactiveError,
        apply_action,
        initial_state,
        public_state,
    )
except ModuleNotFoundError:  # Local repository tests import the Pi copy.
    from pi.scoreboard_core.scoring import (
        ConflictError,
        ScoreboardError,
        SessionInactiveError,
        apply_action,
        initial_state,
        public_state,
    )


class StateStore(Protocol):
    def load(self) -> tuple[dict[str, Any], str | None]: ...
    def commit(self, state: dict[str, Any], previous_etag: str | None) -> None: ...


class Publisher(Protocol):
    def publish(self, state: dict[str, Any]) -> None: ...


def response(status: int, value: dict[str, Any]) -> dict[str, Any]:
    return {
        "statusCode": status,
        "headers": {
            "content-type": "application/json",
            "cache-control": "no-store",
            "referrer-policy": "no-referrer",
            "x-content-type-options": "nosniff",
        },
        "body": json.dumps(value, separators=(",", ":")),
    }


def request_method(event: dict[str, Any]) -> str:
    return str(event.get("requestContext", {}).get("http", {}).get("method", "GET")).upper()


def request_body(event: dict[str, Any]) -> dict[str, Any]:
    raw = event.get("body") or "{}"
    if event.get("isBase64Encoded"):
        raw = base64.b64decode(raw).decode()
    value = json.loads(raw)
    if not isinstance(value, dict):
        raise ScoreboardError("The request body must be a JSON object.")
    return value


def supplied_token(event: dict[str, Any]) -> str:
    headers = {str(key).lower(): str(value) for key, value in (event.get("headers") or {}).items()}
    return headers.get("x-scoreboard-token", "")


def token_is_valid(token: str, expected_hash: str) -> bool:
    if not token or len(expected_hash) != 64:
        return False
    supplied_hash = hashlib.sha256(token.encode()).hexdigest()
    return hmac.compare_digest(supplied_hash, expected_hash.lower())


def process_request(
    event: dict[str, Any],
    store: StateStore,
    publisher: Publisher,
    expected_token_hash: str,
    *,
    at: datetime | None = None,
) -> dict[str, Any]:
    state, etag = store.load()
    method = request_method(event)
    if method == "GET":
        return response(200, public_state(state, at=at))
    if method != "POST":
        return response(405, {"error": "Method not allowed."})
    if not token_is_valid(supplied_token(event), expected_token_hash):
        return response(401, {"error": "This scoreboard control link is not valid."})

    try:
        body = request_body(event)
        next_state = apply_action(state, body, at=at)
        if body.get("action") != "authenticate":
            store.commit(next_state, etag)
            publisher.publish(public_state(next_state, at=at))
        return response(200, public_state(next_state, at=at))
    except ConflictError as error:
        latest, _ = store.load()
        return response(409, {"error": str(error), "code": "REVISION_CONFLICT", "state": public_state(latest, at=at)})
    except SessionInactiveError as error:
        return response(423, {"error": str(error), "code": "SESSION_INACTIVE", "state": public_state(state, at=at)})
    except (ScoreboardError, TypeError, ValueError, json.JSONDecodeError) as error:
        return response(400, {"error": str(error)})


class S3StateStore:
    def __init__(self, client: Any, bucket: str):
        self.client = client
        self.bucket = bucket

    def load(self) -> tuple[dict[str, Any], str | None]:
        try:
            result = self.client.get_object(Bucket=self.bucket, Key="state/current.json")
        except self.client.exceptions.ClientError as error:
            code = str(error.response.get("Error", {}).get("Code", ""))
            if code in {"NoSuchKey", "404"}:
                return initial_state(), None
            raise
        return json.loads(result["Body"].read()), result.get("ETag")

    def commit(self, state: dict[str, Any], previous_etag: str | None) -> None:
        payload = json.dumps(public_state(state), separators=(",", ":")).encode()
        revision_key = f"state/revisions/{state['revision']:010d}.json"
        try:
            self.client.put_object(
                Bucket=self.bucket,
                Key=revision_key,
                Body=payload,
                ContentType="application/json",
                CacheControl="public, max-age=31536000, immutable",
                IfNoneMatch="*",
            )
        except self.client.exceptions.ClientError as error:
            if error.response.get("ResponseMetadata", {}).get("HTTPStatusCode") == 412:
                raise ConflictError("The score changed on another device. Review the latest score and try again.") from error
            raise
        current_request = {
            "Bucket": self.bucket,
            "Key": "state/current.json",
            "Body": payload,
            "ContentType": "application/json",
            "CacheControl": "public, max-age=0, s-maxage=2, stale-while-revalidate=1, stale-if-error=86400",
        }
        current_request["IfMatch" if previous_etag else "IfNoneMatch"] = previous_etag or "*"
        try:
            self.client.put_object(**current_request)
        except self.client.exceptions.ClientError as error:
            if error.response.get("ResponseMetadata", {}).get("HTTPStatusCode") == 412:
                raise ConflictError("The score changed on another device. Review the latest score and try again.") from error
            raise


class IoTPublisher:
    def __init__(self, client: Any, topic: str):
        self.client = client
        self.topic = topic

    def publish(self, state: dict[str, Any]) -> None:
        self.client.publish(
            topic=self.topic,
            qos=1,
            retain=True,
            payload=json.dumps(state, separators=(",", ":")).encode(),
        )


def lambda_handler(event: dict[str, Any], _context: Any) -> dict[str, Any]:
    import boto3

    store = S3StateStore(boto3.client("s3"), os.environ["SCOREBOARD_BUCKET"])
    publisher = IoTPublisher(boto3.client("iot-data"), os.environ["SCOREBOARD_TOPIC"])
    return process_request(event, store, publisher, os.environ["CONTROL_TOKEN_HASH"])
