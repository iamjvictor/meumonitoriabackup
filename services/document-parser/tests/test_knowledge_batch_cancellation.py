from __future__ import annotations

import hashlib
import base64
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from http.client import HTTPConnection
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch

from scripts import knowledge_batch_runner as runner
from scripts import docling_http_service as service
from scripts.docling_http_service import ParserClientDisconnected, ParserJobQueue
from scripts.knowledge_batch_manifest import package_checksum
from scripts.knowledge_profile import KnowledgeProfile


class KnowledgeBatchCancellationTests(unittest.TestCase):
    def test_disconnected_coalesced_owner_does_not_cancel_remaining_waiter(self):
        with ThreadPoolExecutor(max_workers=1) as executor:
            queue = ParserJobQueue(executor, boundary_logger=lambda *_args: None)
            blocker_started = threading.Event()
            release_blocker = threading.Event()
            queue.submit(("blocker",), lambda: (blocker_started.set(), release_blocker.wait(3)))
            self.assertTrue(blocker_started.wait(1))
            calls = []

            def convert(cancel_event, _deadline):
                calls.append(cancel_event)
                return "converted"

            deadline = time.monotonic() + 3
            first_server, first_client = socket.socketpair()
            second_server, second_client = socket.socketpair()
            first = queue.subscribe_cancellable(("same-batch",), convert, deadline=deadline, request_id="first")
            second = queue.subscribe_cancellable(("same-batch",), convert, deadline=deadline, request_id="second")
            first_client.close()
            with self.assertRaises(ParserClientDisconnected):
                first.wait_for(first_server)
            first.close(disconnected=True)

            self.assertFalse(first.job.cancel_event.is_set())
            release_blocker.set()
            self.assertEqual(second.wait_for(second_server), "converted")
            second.close()
            self.assertEqual(len(calls), 1)
            self.assertFalse(calls[0].is_set())
            first_server.close()
            second_server.close()
            second_client.close()

    def test_last_disconnected_waiter_cancels_queued_job_before_operation_starts(self):
        with ThreadPoolExecutor(max_workers=1) as executor:
            queue = ParserJobQueue(executor, boundary_logger=lambda *_args: None)
            blocker_started = threading.Event()
            release_blocker = threading.Event()
            queue.submit(("blocker",), lambda: (blocker_started.set(), release_blocker.wait(3)))
            self.assertTrue(blocker_started.wait(1))
            calls = []
            server_socket, client_socket = socket.socketpair()
            ticket = queue.subscribe_cancellable(
                ("unobserved-batch",), lambda *_args: calls.append("ran"),
                deadline=time.monotonic() + 3, request_id="only-client",
            )
            client_socket.close()
            with self.assertRaises(ParserClientDisconnected):
                ticket.wait_for(server_socket)
            ticket.close(disconnected=True)
            self.assertTrue(ticket.job.cancel_event.is_set())
            self.assertTrue(ticket.job.future.cancelled())
            release_blocker.set()
            time.sleep(0.05)
            self.assertEqual(calls, [])
            server_socket.close()

    def test_absolute_deadline_includes_queue_wait_and_prevents_late_start(self):
        with ThreadPoolExecutor(max_workers=1) as executor:
            queue = ParserJobQueue(executor, boundary_logger=lambda *_args: None)
            blocker_started = threading.Event()
            release_blocker = threading.Event()
            queue.submit(("blocker",), lambda: (blocker_started.set(), release_blocker.wait(3)))
            self.assertTrue(blocker_started.wait(1))
            calls = []
            server_socket, client_socket = socket.socketpair()
            deadline = time.monotonic() + 0.1
            ticket = queue.subscribe_cancellable(
                ("expired-batch",), lambda *_args: calls.append("ran"), deadline=deadline,
            )
            with self.assertRaisesRegex(TimeoutError, "Prazo absoluto"):
                ticket.wait_for(server_socket)
            ticket.close()
            release_blocker.set()
            time.sleep(0.05)
            self.assertEqual(calls, [])
            server_socket.close()
            client_socket.close()

    def test_running_synthetic_subprocess_is_killed_when_all_waiters_cancel(self):
        payload = b"%PDF-synthetic"
        profile = KnowledgeProfile(batch_pages=1)
        request = {
            "documentId": "00000000-0000-4000-8000-000000000001",
            "runId": "00000000-0000-4000-8000-000000000002",
            "contentHash": hashlib.sha256(payload).hexdigest(),
            "configurationHash": profile.digest(),
            "pageStart": 1, "pageEnd": 1, "profile": {"batch_pages": 1},
        }
        real_popen = subprocess.Popen
        child_processes = []
        cancel = threading.Event()

        def synthetic_child(*_args, **kwargs):
            child = real_popen([sys.executable, "-c", "import time; time.sleep(30)"], **kwargs)
            child_processes.append(child)
            return child

        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = root / "synthetic.pdf"
            source.write_bytes(payload)
            timer = threading.Timer(0.2, cancel.set)
            timer.start()
            started = time.monotonic()
            try:
                with patch.object(runner.subprocess, "Popen", side_effect=synthetic_child):
                    with self.assertRaises(runner.BatchCancelledError):
                        runner.run_batch(
                            request, source, root / "out", timeout_seconds=5,
                            cancel_event=cancel, absolute_deadline=time.monotonic() + 5,
                        )
            finally:
                timer.cancel()
            self.assertLess(time.monotonic() - started, 2)
        self.assertEqual(len(child_processes), 1)
        self.assertIsNotNone(child_processes[0].poll())

    def test_http_owner_disconnect_keeps_job_files_for_another_coalesced_client(self):
        events = []
        events_condition = threading.Condition()
        server, server_thread, port = service.serve_in_thread(
            host="127.0.0.1", port=0, max_concurrency=1,
            boundary_logger=lambda event, fields: self._record_event(events_condition, events, event, fields),
        )
        blocker_started, release_blocker = threading.Event(), threading.Event()
        batch_started, release_batch = threading.Event(), threading.Event()
        observed_input_paths = []
        observed_input_contents = []
        calls = []
        server.parser_jobs.submit(
            ("synthetic-occupier",), lambda: (blocker_started.set(), release_blocker.wait(4)),
        )
        self.assertTrue(blocker_started.wait(1))

        payload = b"%PDF-coalesced-cancel-test"
        profile = KnowledgeProfile(batch_pages=1)
        request = {
            "documentId": "00000000-0000-4000-8000-000000000001",
            "runId": "00000000-0000-4000-8000-000000000002",
            "contentHash": hashlib.sha256(payload).hexdigest(),
            "configurationHash": profile.digest(),
            "pageStart": 1, "pageEnd": 1, "profile": {"batch_pages": 1},
        }
        boundary = "synthetic-knowledge-boundary"
        body = (
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"request\"\r\nContent-Type: application/json\r\n\r\n".encode()
            + json.dumps(request).encode()
            + f"\r\n--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"book.pdf\"\r\nContent-Type: application/pdf\r\n\r\n".encode()
            + payload
            + f"\r\n--{boundary}--\r\n".encode()
        )
        content_type = f"multipart/form-data; boundary={boundary}"

        def fake_run_batch(batch_request, input_path, output_dir, **kwargs):
            calls.append(batch_request)
            observed_input_paths.append(input_path)
            observed_input_contents.append(input_path.read_bytes())
            self.assertTrue(input_path.is_file(), "job-owned input must survive disconnect of submitting handler")
            self.assertFalse(kwargs["cancel_event"].is_set())
            batch_started.set()
            if not release_batch.wait(3):
                raise RuntimeError("synthetic conversion gate was not released")
            self.assertTrue(input_path.is_file(), "coalesced waiter still needs owner input after queue release")
            artifact = b"# Converted"
            files = [{"path": "document.md", "sha256": hashlib.sha256(artifact).hexdigest(), "contentBase64": base64.b64encode(artifact).decode()}]
            manifest = {
                "schemaVersion": "knowledge-batch-v1", "documentId": request["documentId"],
                "runId": request["runId"], "contentHash": request["contentHash"],
                "configurationHash": request["configurationHash"], "parserVersion": "2.122.0",
                "pageStart": 1, "pageEnd": 1,
                "pages": [{"pageNumber": 1, "status": "CONVERTED", "characterCount": 11, "layoutItemCount": 1, "imageCount": 0, "errors": []}],
                "files": files,
            }
            output_dir.mkdir(parents=True, exist_ok=True)
            (output_dir / "document.md").write_bytes(artifact)
            return {"manifest": manifest, "files": files, "artifactChecksum": package_checksum(files), "durationMs": 100}

        def send_second(request_id):
            connection = HTTPConnection("127.0.0.1", port, timeout=4)
            connection.request("POST", "/knowledge/batch/v1", body, headers={
                "Content-Type": content_type, "Content-Length": str(len(body)),
                "Authorization": "Bearer synthetic-secret", "X-Request-Id": request_id,
            })
            response = connection.getresponse()
            result = response.status, response.read()
            connection.close()
            return result

        first_id = "00000000-0000-4000-8000-000000000003"
        second_id = "00000000-0000-4000-8000-000000000004"
        first = HTTPConnection("127.0.0.1", port, timeout=4)
        with patch.dict(os.environ, {"KNOWLEDGE_BATCH_SERVICE_TOKEN": "synthetic-secret"}), patch.object(service, "run_batch", side_effect=fake_run_batch):
            try:
                first.request("POST", "/knowledge/batch/v1", body, headers={
                    "Content-Type": content_type, "Content-Length": str(len(body)),
                    "Authorization": "Bearer synthetic-secret", "X-Request-Id": first_id,
                })
                self.assertTrue(self._wait_event(events_condition, events, lambda event, fields: event == "doc_parser.job_queued" and fields.get("request_id") == first_id))
                with ThreadPoolExecutor(max_workers=1) as clients:
                    second = clients.submit(send_second, second_id)
                    self.assertTrue(self._wait_event(events_condition, events, lambda event, fields: event == "doc_parser.job_coalesced" and fields.get("request_id") == second_id))
                    first.close()
                    self.assertTrue(self._wait_event(events_condition, events, lambda event, fields: event == "doc_parser.job_client_disconnected" and fields.get("request_id") == first_id))
                    with events_condition:
                        disconnect_event = next(fields for event, fields in events if event == "doc_parser.job_client_disconnected" and fields.get("request_id") == first_id)
                    self.assertEqual(disconnect_event["remaining_subscribers"], 1)
                    release_blocker.set()
                    self.assertTrue(batch_started.wait(2))
                    release_batch.set()
                    status, response_body = second.result(timeout=4)
            finally:
                first.close()
                release_blocker.set()
                release_batch.set()
                server.shutdown()
                server_thread.join(timeout=4)
                server.server_close()

        self.assertEqual(status, 200)
        self.assertEqual(json.loads(response_body)["manifest"]["runId"], request["runId"])
        self.assertEqual(len(calls), 1)
        self.assertFalse(observed_input_paths[0].exists(), "worker temporary input must be cleaned after the shared job finishes")
        self.assertEqual(observed_input_contents, [payload])

    @staticmethod
    def _record_event(condition, events, event, fields):
        with condition:
            events.append((event, fields))
            condition.notify_all()

    @staticmethod
    def _wait_event(condition, events, predicate, timeout=2):
        with condition:
            return condition.wait_for(lambda: any(predicate(event, fields) for event, fields in events), timeout)


if __name__ == "__main__":
    unittest.main()
