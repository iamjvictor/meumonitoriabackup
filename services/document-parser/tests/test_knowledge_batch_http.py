from __future__ import annotations

import base64
import hashlib
import json
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch
from http.client import HTTPConnection

from scripts import docling_http_service as service
from scripts.knowledge_profile import KnowledgeProfile


class KnowledgeBatchHttpTests(unittest.TestCase):
    def setUp(self):
        self.logs = []
        self.server, self.thread, port = service.serve_in_thread(
            boundary_logger=lambda *entry: self.logs.append(entry), max_concurrency=1,
        )
        self.port = port

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)

    @staticmethod
    def multipart(request, payload=b"%PDF-fake"):
        boundary = "knowledge-test-boundary"
        encoded_request = json.dumps(request).encode()
        body = (
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"request\"\r\nContent-Type: application/json\r\n\r\n".encode()
            + encoded_request
            + f"\r\n--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"book.pdf\"\r\nContent-Type: application/pdf\r\n\r\n".encode()
            + payload
            + f"\r\n--{boundary}--\r\n".encode()
        )
        return f"multipart/form-data; boundary={boundary}", body

    def valid_request(self, payload):
        return {
            "documentId": "00000000-0000-4000-8000-000000000001",
            "runId": "00000000-0000-4000-8000-000000000002",
            "contentHash": hashlib.sha256(payload).hexdigest(),
            "configurationHash": KnowledgeProfile(batch_pages=1).digest(),
            "pageStart": 1, "pageEnd": 1,
            "profile": {"batch_pages": 1},
        }

    def post(self, body, content_type, token):
        conn = HTTPConnection("127.0.0.1", self.port, timeout=2)
        conn.request("POST", "/knowledge/batch/v1", body, {
            "Content-Type": content_type,
            "Content-Length": str(len(body)),
            "Authorization": f"Bearer {token}",
            "X-Request-Id": "00000000-0000-4000-8000-000000000003",
        })
        response = conn.getresponse()
        result = response.status, dict(response.getheaders()), response.read()
        conn.close()
        return result

    def test_authentication_is_required_before_reading_and_conversion(self):
        payload = b"%PDF-test"
        content_type, body = self.multipart(self.valid_request(payload), payload)
        with patch.dict(os.environ, {"KNOWLEDGE_BATCH_SERVICE_TOKEN": "secret"}):
            status, _, _ = self.post(body, content_type, "wrong")
        self.assertEqual(status, 401)

    def test_rejects_profile_hash_mismatch_before_scheduling(self):
        payload = b"%PDF-test"
        request = self.valid_request(payload)
        request["configurationHash"] = "b" * 64
        content_type, body = self.multipart(request, payload)
        with patch.dict(os.environ, {"KNOWLEDGE_BATCH_SERVICE_TOKEN": "secret"}), patch.object(service, "run_batch") as runner:
            status, _, _ = self.post(body, content_type, "secret")
        self.assertEqual(status, 400)
        runner.assert_not_called()

    def test_versioned_response_matches_backend_contract(self):
        payload = b"%PDF-test"
        content_type, body = self.multipart(self.valid_request(payload), payload)
        data = b"# Page 1"
        files = [{"path": "document.md", "sha256": hashlib.sha256(data).hexdigest(), "contentBase64": base64.b64encode(data).decode()}]
        manifest = {
            "schemaVersion": "knowledge-batch-v1",
            "documentId": "00000000-0000-4000-8000-000000000001",
            "runId": "00000000-0000-4000-8000-000000000002",
            "contentHash": hashlib.sha256(payload).hexdigest(), "configurationHash": KnowledgeProfile(batch_pages=1).digest(),
            "pageStart": 1, "pageEnd": 1, "parserVersion": "2.122.0",
            "pages": [{"pageNumber": 1, "status": "CONVERTED", "characterCount": 8, "layoutItemCount": 1, "imageCount": 0, "errors": []}],
            "files": files,
        }
        mocked = {"manifest": manifest, "files": files, "artifactChecksum": "unused", "durationMs": 23}
        with patch.dict(os.environ, {"KNOWLEDGE_BATCH_SERVICE_TOKEN": "secret"}), patch.object(service, "run_batch", return_value=mocked):
            status, headers, raw = self.post(body, content_type, "secret")
        self.assertEqual(status, 200)
        self.assertEqual(headers["Content-Type"], "application/vnd.knowledge-batch.v1+json")
        self.assertEqual(headers["X-Request-Id"], "00000000-0000-4000-8000-000000000003")
        response = json.loads(raw)
        self.assertEqual(response["manifest"]["files"], files)
        self.assertEqual(response["durationMs"], 23)


if __name__ == "__main__":
    unittest.main()
