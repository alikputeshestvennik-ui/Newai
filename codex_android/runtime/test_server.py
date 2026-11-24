import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import threading
import time
import unittest
import urllib.error
import urllib.request
from unittest.mock import patch


class BridgeTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        with patch.dict(os.environ, TEN_LOCAL_HOME=cls.temp.name):
            spec = importlib.util.spec_from_file_location("bridge", Path(__file__).with_name("server.py"))
            cls.bridge = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(cls.bridge)
        cls.run_app_server = staticmethod(cls.bridge.run_app_server)
        cls.server = cls.bridge.ThreadingHTTPServer(("127.0.0.1", 0), cls.bridge.Handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    def setUp(self):
        patcher = patch.object(
            self.bridge,
            "run_app_server",
            side_effect=self.bridge.AppServerUnavailable("app-server disabled in tests"),
        )
        patcher.start()
        self.addCleanup(patcher.stop)

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()
        cls.temp.cleanup()

    def request(self, token, value, path="/run"):
        req = urllib.request.Request(
            f"http://127.0.0.1:{self.server.server_port}{path}",
            data=json.dumps(value).encode(),
            headers={"Authorization": "Bearer " + token},
        )
        try:
            with urllib.request.urlopen(req, timeout=10) as response:
                return response.status, json.load(response)
        except urllib.error.HTTPError as response:
            return response.code, json.load(response)

    def get_status(self, token, task_id=None):
        suffix = f"?task_id={task_id}" if task_id else ""
        req = urllib.request.Request(
            f"http://127.0.0.1:{self.server.server_port}/status{suffix}",
            headers={"Authorization": "Bearer " + token},
        )
        try:
            with urllib.request.urlopen(req, timeout=10) as response:
                return response.status, json.load(response)
        except urllib.error.HTTPError as response:
            return response.code, json.load(response)

    def fake_run(self, answer="done", inspect=None):
        def run(task, args, prompt, env, output, timeout):
            if inspect:
                inspect(task, args, prompt, env, output, timeout)
            output.write_text(answer)
            task.last_answer = answer
            task.status = "done"
            return subprocess.CompletedProcess(args, 0, answer, "")
        return run

    def test_clarification_waits_for_answer_and_resumes_same_turn(self):
        fixture = """
import json
import sys

def read():
    return json.loads(sys.stdin.readline())

def send(**message):
    print(json.dumps(message), flush=True)

init = read()
assert init["params"]["capabilities"]["experimentalApi"]
send(id=init["id"], result={})
read()  # initialized
start = read()
send(id=start["id"], result={"thread": {"id": "test-thread"}})
turn = read()
request_id = turn["id"]  # Server and client may use the same numeric ID.
send(id=request_id, method="item/tool/requestUserInput", params={
    "questions": [{"id": "theme", "question": "Какой цвет?", "options": [{"label": "Синий"}]}],
})
send(id=turn["id"], result={})
reply = read()
assert reply["id"] == request_id and reply["result"] == {
    "answers": {"theme": {"answers": ["Синий"]}},
}, reply
send(method="turn/completed", params={"turn": {"status": "completed",
    "items": [{"type": "agentMessage", "text": "Выбран синий."}]}})
"""
        real_popen = subprocess.Popen

        def app_server_process(command, **kwargs):
            self.assertIn("default_mode_request_user_input", command)
            return real_popen([sys.executable, "-u", "-c", fixture], **kwargs)

        def wait_for(predicate):
            for _ in range(100):
                _, snapshot = self.get_status(self.bridge.SECRET, "clarification-test")
                if predicate(snapshot):
                    return snapshot
                time.sleep(0.03)
            self.fail(f"Unexpected task snapshot: {snapshot}")

        with patch.object(self.bridge, "run_app_server", side_effect=self.run_app_server), \
             patch.object(subprocess, "Popen", side_effect=app_server_process):
            token = self.bridge.SECRET
            self.assertEqual(self.request(token, {"goal": "test", "task_id": "clarification-test"}, "/start")[0], 202)
            pending = wait_for(lambda snapshot: snapshot.get("clarification"))
            question = pending["clarification"]
            self.assertNotIn("reasoning", pending)
            self.assertEqual(question["questions"][0]["options"][0]["label"], "Синий")
            self.assertEqual(pending["status"], "running")
            self.assertEqual(pending["progress"], "Жду твоего ответа…")
            answer = {"task_id": "clarification-test", "clarification_id": question["id"], "answers": {}}
            self.assertEqual(self.request("wrong", answer, "/answer")[0], 401)
            self.assertEqual(self.request(token, answer, "/answer")[0], 400)
            answer["answers"] = {"theme": "Синий"}
            self.assertEqual(self.request(token, answer, "/answer")[0], 200)
            finished = wait_for(lambda snapshot: snapshot.get("status") in {"done", "failed"})
            self.assertEqual(finished["status"], "done", finished)
            self.assertEqual(finished["answer"], "Выбран синий.")
            self.assertIsNone(finished["clarification"])
            self.assertEqual(self.request(token, answer, "/answer")[0], 409)

    def test_token_created_and_private(self):
        token = Path(self.temp.name, "token")
        self.assertTrue(token.exists())
        self.assertEqual(token.read_text(), self.bridge.SECRET)
        self.assertEqual(token.stat().st_mode & 0o777, 0o600)

    def test_bad_token(self):
        self.assertEqual(self.request("wrong", {"goal": "test"})[0], 401)

    def test_invalid_goal(self):
        self.assertEqual(self.request(self.bridge.SECRET, {"goal": ""})[0], 400)

    def test_busy_same_task(self):
        task = self.bridge.Task("busy-task")
        task.process = subprocess.Popen(["python3", "-c", "import time; time.sleep(30)"], start_new_session=True)
        try:
            with self.bridge.TASKS_LOCK:
                self.bridge.TASKS["busy-task"] = task
            self.assertEqual(self.request(self.bridge.SECRET, {"goal": "test", "task_id": "busy-task"})[0], 409)
        finally:
            self.bridge.stop_task("busy-task")
            task.process.wait()

    def test_provider_requires_key(self):
        self.assertEqual(self.request(self.bridge.SECRET, {"goal": "test", "selected": "deepseek:deepseek-flash"})[0], 400)

    def test_gpt_auto_uses_codex_default_model(self):
        def inspect(task, args, prompt, env, output, timeout):
            self.assertNotIn("-m", args)
            self.assertFalse(any(arg.startswith("model_provider=") for arg in args))

        with patch.object(self.bridge, "run_process", side_effect=self.fake_run(inspect=inspect)):
            self.assertEqual(self.request(self.bridge.SECRET, {"goal": "test", "selected": "chatgpt:auto"})[0], 200)

    def test_provider_key_not_on_command_line(self):
        def inspect(task, args, prompt, env, output, timeout):
            self.assertEqual(env["TEN_PROVIDER_TOKEN"], "test-secret")
            self.assertNotIn("test-secret", str(args))
            self.assertIn("deepseek-flash", args)
            self.assertIn('wire_api="responses"', str(args))
            self.assertNotIn('wire_api="chat"', str(args))

        with patch.object(self.bridge, "run_process", side_effect=self.fake_run(inspect=inspect)):
            self.assertEqual(self.request(self.bridge.SECRET, {"goal": "test", "selected": "deepseek:deepseek-flash", "provider_token": "test-secret"})[0], 200)

    def test_prompt_goes_to_stdin(self):
        def inspect(task, args, prompt, env, output, timeout):
            self.assertEqual(prompt, "hello $(false)")
            self.assertNotIn("hello $(false)", args)

        with patch.object(self.bridge, "run_process", side_effect=self.fake_run(inspect=inspect)):
            self.assertEqual(self.request(self.bridge.SECRET, {"goal": "hello $(false)"}), (200, {"result": "done", "task_id": "default", "files": []}))

    def test_output_file_is_reported(self):
        def inspect(task, args, prompt, env, output, timeout):
            workspace = Path(args[args.index("-C") + 1])
            (workspace / "result.txt").write_text("created by Codex", encoding="utf-8")

        with patch.object(self.bridge, "run_process", side_effect=self.fake_run(inspect=inspect)):
            status, body = self.request(self.bridge.SECRET, {"goal": "make a file", "task_id": "files-task"})
        self.assertEqual(status, 200)
        self.assertEqual(body["files"][0]["name"], "result.txt")
        self.assertGreater(body["files"][0]["size"], 0)

    def test_generated_cache_and_build_files_are_hidden(self):
        def inspect(task, args, prompt, env, output, timeout):
            workspace = Path(args[args.index("-C") + 1])
            cache = workspace / "__pycache__"
            cache.mkdir()
            (cache / "server.cpython-314.pyc").write_bytes(b"cache")
            build = workspace / "build"
            build.mkdir()
            (build / "generated.txt").write_text("build output", encoding="utf-8")
            (workspace / "preview.html").write_text("<h1>preview</h1>", encoding="utf-8")

        with patch.object(self.bridge, "run_process", side_effect=self.fake_run(inspect=inspect)):
            status, body = self.request(self.bridge.SECRET, {"goal": "make a preview", "task_id": "filtered-files-task"})
        self.assertEqual(status, 200)
        self.assertEqual([item["name"] for item in body["files"]], ["preview.html"])

    def test_gpt_uses_codex_managed_login(self):
        def inspect(task, args, prompt, env, output, timeout):
            self.assertNotIn("https://api.openai.com/v1", str(args))
            self.assertFalse(any(arg.startswith("model_provider=") for arg in args))
            self.assertIn("gpt-5.1-codex", args)
            self.assertNotEqual(env.get("TEN_PROVIDER_TOKEN"), "ignored-token")

        with patch.object(self.bridge, "run_process", side_effect=self.fake_run(inspect=inspect)):
            self.assertEqual(self.request(self.bridge.SECRET, {"goal": "test", "selected": "chatgpt:gpt-5.1-codex", "provider_token": "ignored-token"})[0], 200)

    def test_workspace_uses_codex_root_and_keeps_legacy_dialogs(self):
        with tempfile.TemporaryDirectory() as storage:
            root = Path(storage) / "Codex"
            old = Path(storage) / "old"
            (old / "existing").mkdir(parents=True)
            with patch.object(self.bridge, "WORK", root), patch.object(self.bridge, "LEGACY_WORK", old):
                self.assertEqual(self.bridge.task_workspace("new"), root / "new")
                self.assertEqual(self.bridge.task_workspace("existing"), old / "existing")

    def test_shared_workspace_is_used_only_for_new_projects(self):
        with tempfile.TemporaryDirectory() as storage:
            private = Path(storage) / "Codex"
            shared = Path(storage) / "CodexFiles"
            legacy = Path(storage) / "legacy"
            (private / "existing").mkdir(parents=True)
            (shared / "existing").mkdir(parents=True)
            (legacy / "older").mkdir(parents=True)
            with patch.object(self.bridge, "WORK", private), patch.object(self.bridge, "LEGACY_WORK", legacy), \
                    patch.object(self.bridge, "SHARED_WORK", shared):
                self.assertEqual(self.bridge.task_workspace("new"), shared / "new")
                self.assertEqual(self.bridge.task_workspace("existing"), private / "existing")
                self.assertEqual(self.bridge.task_workspace("older"), legacy / "older")
                self.assertEqual(self.bridge.task_workspace("default"), private)

    def test_shared_project_git_config_is_scoped_to_its_workspace(self):
        with tempfile.TemporaryDirectory() as storage:
            shared = Path(storage) / "CodexFiles"

            def inspect(task, args, prompt, env, output, timeout):
                workspace = shared.resolve() / "git-project"
                config = Path(env["GIT_CONFIG_GLOBAL"])
                self.assertEqual(config.parent, output.parent)
                self.assertIn(f'directory = "{workspace}"', config.read_text())
                self.assertIn(f'directory = "{workspace}/*"', config.read_text())
                self.assertNotIn(f'directory = "{shared}/*"', config.read_text())

            with patch.object(self.bridge, "SHARED_WORK", shared), \
                    patch.object(self.bridge, "run_process", side_effect=self.fake_run(inspect=inspect)):
                status, body = self.request(self.bridge.SECRET, {"goal": "test", "task_id": "git-project"})
                self.assertEqual(status, 200, body)

    def test_unavailable_shared_workspace_does_not_create_private_project(self):
        with tempfile.TemporaryDirectory() as storage:
            private = Path(storage) / "Codex"
            shared = Path(storage) / "CodexFiles"
            shared.write_text("not a directory")
            with patch.object(self.bridge, "WORK", private), \
                    patch.object(self.bridge, "SHARED_WORK", shared):
                with self.assertRaisesRegex(OSError, "CodexFiles"):
                    self.bridge.task_workspace("missing")
                self.assertFalse((private / "missing").exists())

    def test_reasoning_effort_passed_to_codex(self):
        def inspect(task, args, prompt, env, output, timeout):
            self.assertIn('model_reasoning_effort="high"', str(args))

        with patch.object(self.bridge, "run_process", side_effect=self.fake_run(inspect=inspect)):
            self.assertEqual(self.request(self.bridge.SECRET, {"goal": "test", "selected": "deepseek:deepseek-flash", "provider_token": "test-secret", "reasoning_effort": "high"})[0], 200)

    def test_reasoning_effort_defaults_to_medium(self):
        def inspect(task, args, prompt, env, output, timeout):
            self.assertIn('model_reasoning_effort="medium"', str(args))

        with patch.object(self.bridge, "run_process", side_effect=self.fake_run(inspect=inspect)):
            self.assertEqual(self.request(self.bridge.SECRET, {"goal": "test", "selected": "deepseek:deepseek-flash", "provider_token": "test-secret"})[0], 200)

    def test_reasoning_accumulates_all_items(self):
        task = self.bridge.Task("reason-task")
        self.bridge.handle_event(task, {"type": "item.completed", "item": {"id": "rs_1", "type": "reasoning", "summary": [{"type": "summary_text", "text": "Первый шаг"}]}})
        self.bridge.handle_event(task, {"type": "item.completed", "item": {"id": "rs_2", "type": "reasoning", "summary": [{"type": "summary_text", "text": "Второй шаг"}]}})
        self.assertIn("Первый шаг", task.last_reasoning)
        self.assertIn("Второй шаг", task.last_reasoning)

    def test_reasoning_deduplicates_by_item_id(self):
        task = self.bridge.Task("reason-dedup")
        self.bridge.handle_event(task, {"type": "item.updated", "item": {"id": "rs_1", "type": "reasoning", "summary": [{"type": "summary_text", "text": "частично"}]}})
        self.bridge.handle_event(task, {"type": "item.completed", "item": {"id": "rs_1", "type": "reasoning", "summary": [{"type": "summary_text", "text": "полный текст"}]}})
        self.assertEqual(task.last_reasoning, "полный текст")

    def test_reasoning_deltas_stream_incrementally(self):
        task = self.bridge.Task("reason-stream")
        self.bridge.handle_app_notification(task, {
            "method": "item/reasoning/summaryTextDelta",
            "params": {"itemId": "rs_1", "summaryIndex": 0, "delta": "Сначала "},
        })
        self.assertEqual(task.last_reasoning, "Сначала ")
        self.bridge.handle_app_notification(task, {
            "method": "item/reasoning/summaryTextDelta",
            "params": {"itemId": "rs_1", "summaryIndex": 0, "delta": "проверю"},
        })
        self.assertEqual(task.last_reasoning, "Сначала проверю")
        self.bridge.handle_app_notification(task, {
            "method": "item/reasoning/summaryTextDelta",
            "params": {"itemId": "rs_1", "summaryIndex": 1, "delta": "Второй блок"},
        })
        self.assertIn("Сначала проверю", task.last_reasoning)
        self.assertIn("Второй блок", task.last_reasoning)

    def test_token_usage_is_reported_for_both_protocols(self):
        task = self.bridge.Task("usage")
        self.bridge.handle_app_notification(task, {"method": "thread/tokenUsage/updated", "params": {
            "tokenUsage": {"total": {"inputTokens": 120, "cachedInputTokens": 40, "outputTokens": 15}}}})
        self.assertEqual({"input": 120, "cached": 40, "output": 15}, task.snapshot()["usage"])
        self.bridge.handle_event(task, {"type": "turn.completed", "usage": {
            "input_tokens": 50, "cached_input_tokens": 20, "output_tokens": 7}})
        self.assertEqual({"input": 50, "cached": 20, "output": 7}, task.snapshot()["usage"])
        self.assertIsNone(self.bridge.normalize_usage({}))

    def test_app_server_turn_completed_returns_final_answer(self):
        task = self.bridge.Task("reason-done")
        outcome = self.bridge.handle_app_notification(task, {
            "method": "item/agentMessage/delta",
            "params": {"itemId": "msg_1", "delta": "готово"},
        })
        self.assertIsNone(outcome)
        outcome = self.bridge.handle_app_notification(task, {
            "method": "turn/completed",
            "params": {"turn": {
                "status": "completed",
                "items": [{"type": "agentMessage", "id": "msg_1", "text": "готово"}],
            }},
        })
        self.assertEqual(outcome, "completed")
        self.assertEqual(task.last_answer, "готово")

    def test_app_server_marks_failed_turn(self):
        task = self.bridge.Task("reason-fail")
        outcome = self.bridge.handle_app_notification(task, {
            "method": "turn/completed",
            "params": {"turn": {"status": "failed", "error": {"message": "boom"}, "items": []}},
        })
        self.assertEqual(outcome, "failed")
        self.assertEqual(task.error, "boom")

    def test_app_server_exec_command_counts_for_tool_health(self):
        task = self.bridge.Task("reason-tool")
        self.bridge.handle_app_notification(task, {
            "method": "item/completed",
            "params": {"item": {
                "type": "commandExecution", "id": "cmd_1", "status": "completed",
                "exitCode": 0, "aggregatedOutput": "ok",
            }},
        })
        self.assertEqual(task.tool_successes, 1)
        self.bridge.handle_app_notification(task, {
            "method": "item/completed",
            "params": {"item": {
                "type": "commandExecution", "id": "cmd_2", "status": "failed",
                "exitCode": 127, "aggregatedOutput": "command not found",
            }},
        })
        self.assertEqual(task.tool_failures, 1)
        self.assertIn("command not found", task.last_tool_error)

    def test_anymodel_native_id_requires_key(self):
        self.assertEqual(self.request(self.bridge.SECRET, {"goal": "test", "selected": "cc/claude-opus-5-5"})[0], 400)

    def test_anymodel_native_id_passes_model_and_env(self):
        def inspect(task, args, prompt, env, output, timeout):
            self.assertEqual(env["TEN_PROVIDER_TOKEN"], "test-secret")
            self.assertIn("cc/claude-opus-5-5", args)
            self.assertIn('wire_api="responses"', str(args))

        with patch.object(self.bridge, "run_process", side_effect=self.fake_run(inspect=inspect)):
            self.assertEqual(self.request(self.bridge.SECRET, {"goal": "test", "selected": "cc/claude-opus-5-5", "provider_token": "test-secret"})[0], 200)

    def test_any_prefix_strips_to_model_id(self):
        def inspect(task, args, prompt, env, output, timeout):
            self.assertIn("gpt-5", args)
            self.assertNotIn("any:gpt-5", str(args))

        with patch.object(self.bridge, "run_process", side_effect=self.fake_run(inspect=inspect)):
            self.assertEqual(self.request(self.bridge.SECRET, {"goal": "test", "selected": "any:gpt-5", "provider_token": "test-secret"})[0], 200)

    def test_unknown_provider_rejected(self):
        self.assertEqual(self.request(self.bridge.SECRET, {"goal": "test", "selected": "google:gemini-3.5-flash-lite"})[0], 400)

    def test_compatible_requires_https(self):
        self.assertEqual(self.request(self.bridge.SECRET, {"goal": "test", "selected": "compatible:gpt-4o", "base_url": "http://api.example.com", "provider_token": "k"})[0], 400)

    def test_compatible_passes_model_base_and_token(self):
        def inspect(task, args, prompt, env, output, timeout):
            self.assertEqual(env["TEN_PROVIDER_TOKEN"], "k")
            self.assertIn("gpt-4o", args)
            self.assertIn("https://api.example.com/v1", str(args))
            self.assertIn('wire_api="responses"', str(args))

        with patch.object(self.bridge, "run_process", side_effect=self.fake_run(inspect=inspect)):
            self.assertEqual(self.request(self.bridge.SECRET, {"goal": "test", "selected": "compatible:gpt-4o", "base_url": "https://api.example.com/v1", "provider_token": "k"})[0], 200)

    def test_nvidia_routes_codex_to_the_loopback_adapter(self):
        def inspect(task, args, prompt, env, output, timeout):
            self.assertNotEqual(env["TEN_PROVIDER_TOKEN"], "nvidia-key")
            self.assertIn('wire_api="responses"', str(args))
            self.assertIn("model_providers.ten_provider.request_max_retries=0", args)
            self.assertIn("model_providers.ten_provider.stream_max_retries=0", args)
            self.assertIn("moonshotai/kimi-k3.1-pro", args)
            self.assertRegex(str(args), r'base_url="http://127\.0\.0\.1:\d+"')

        with patch.object(self.bridge, "run_process", side_effect=self.fake_run(inspect=inspect)):
            status, _ = self.request(self.bridge.SECRET, {
                "goal": "test", "selected": "compatible:moonshotai/kimi-k3.1-pro",
                "base_url": "https://integrate.api.nvidia.com/v1/", "provider_token": "nvidia-key",
            })
            self.assertEqual(status, 200)

    def test_gh_token_passed_to_env(self):
        def inspect(task, args, prompt, env, output, timeout):
            self.assertEqual(env["GH_TOKEN"], "ghp_test")
            self.assertEqual(env["GITHUB_TOKEN"], "ghp_test")
            self.assertEqual(env["GH_PROMPT_DISABLED"], "1")
            self.assertEqual(env["GH_NO_UPDATE_NOTIFIER"], "1")
            self.assertNotIn("ghp_test", str(args))

        with patch.object(self.bridge, "run_process", side_effect=self.fake_run(inspect=inspect)):
            self.assertEqual(self.request(self.bridge.SECRET, {"goal": "test", "selected": "deepseek:deepseek-flash", "provider_token": "k", "gh_token": "ghp_test"})[0], 200)

    def test_async_start_returns_immediately_and_status_delivers_answer(self):
        with patch.object(self.bridge, "run_process", side_effect=self.fake_run(answer="async answer")):
            status, body = self.request(self.bridge.SECRET, {"goal": "test", "task_id": "async-task"}, path="/start")
            self.assertEqual(status, 202)
            self.assertEqual(body["status"], "started")
            self.assertEqual(body["task_id"], "async-task")
            for _ in range(50):
                current, snapshot = self.get_status(self.bridge.SECRET, "async-task")
                self.assertEqual(current, 200)
                if snapshot["status"] == "done":
                    self.assertEqual(snapshot["answer"], "async answer")
                    self.assertEqual(snapshot["files"], [])
                    return
                time.sleep(0.02)
            self.fail("background task did not finish")

    def test_status_reports_finished_task(self):
        with patch.object(self.bridge, "run_process", side_effect=self.fake_run(answer="answer")):
            self.request(self.bridge.SECRET, {"goal": "test", "task_id": "status-task"})
        status, body = self.get_status(self.bridge.SECRET, "status-task")
        self.assertEqual(status, 200)
        self.assertEqual(body["status"], "done")
        self.assertEqual(body["answer"], "answer")

    def test_status_requires_token(self):
        self.assertEqual(self.get_status("wrong")[0], 401)

    def test_cancel_real_process(self):
        task = self.bridge.Task("cancel-task")
        process = subprocess.Popen(["python3", "-c", "import time; time.sleep(60)"], start_new_session=True)
        task.process = process
        with self.bridge.TASKS_LOCK:
            self.bridge.TASKS["cancel-task"] = task
        self.assertTrue(self.bridge.stop_task("cancel-task"))
        process.wait(timeout=5)
        self.assertEqual(process.returncode, -9)

    def test_android_shell_environment_is_restored(self):
        def inspect(task, args, prompt, env, output, timeout):
            command = " ".join(args)
            self.assertIn("allow_login_shell=false", command)
            self.assertIn("features.shell_snapshot=false", command)
            self.assertIn("features.code_mode_host=true", command)
            self.assertIn("shell_environment_policy.set.LD_LIBRARY_PATH=", command)
            self.assertIn("shell_environment_policy.set.LD_PRELOAD=", command)
            self.assertIn("login=false", command)
            self.assertIn("/data/user/0/ru.alim.newai/files/usr/bin/bash", command)
            self.assertIn("GitHub CLI gh is installed", command)

        environment = {
            "PREFIX": "/data/user/0/ru.alim.newai/files/usr",
            "SHELL": "/data/user/0/ru.alim.newai/files/usr/bin/bash",
            "LD_LIBRARY_PATH": "/data/user/0/ru.alim.newai/files/usr/lib",
            "LD_PRELOAD": "/data/user/0/ru.alim.newai/files/usr/lib/libtermux-exec.so",
        }
        with patch.dict(os.environ, environment),                 patch.object(self.bridge, "run_process", side_effect=self.fake_run(inspect=inspect)):
            self.assertEqual(self.request(self.bridge.SECRET, {"goal": "test"})[0], 200)

    def test_command_failure_is_reported_instead_of_a_polite_answer(self):
        def inspect(task, args, prompt, env, output, timeout):
            self.bridge.handle_event(task, {
                "type": "item.completed",
                "item": {
                    "type": "command_execution",
                    "command": ["/bin/sh", "-c", "git clone https://github.com/a/b"],
                    "status": "failed",
                    "exit_code": 127,
                    "aggregated_output": "git: inaccessible or not found",
                },
            })

        with patch.object(self.bridge, "run_process", side_effect=self.fake_run(answer="Не удалось открыть GitHub", inspect=inspect)):
            status, body = self.request(self.bridge.SECRET, {"goal": "test"})
        self.assertEqual(status, 502)
        self.assertIn("Инструмент выполнения команд Codex не запустился", body["error"])
        self.assertIn("git: inaccessible or not found", body["error"])

    def test_successful_command_allows_a_normal_answer(self):
        def inspect(task, args, prompt, env, output, timeout):
            self.bridge.handle_event(task, {
                "type": "item.completed",
                "item": {"type": "command_execution", "command": ["/bin/sh", "-c", "true"],
                         "status": "completed", "exit_code": 0, "aggregated_output": ""},
            })

        with patch.object(self.bridge, "run_process", side_effect=self.fake_run(answer="Готово", inspect=inspect)):
            self.assertEqual(self.request(self.bridge.SECRET, {"goal": "test"})[0], 200)

    def test_health_does_not_leak_task_details(self):
        req = urllib.request.Request(f"http://127.0.0.1:{self.server.server_port}/health")
        with urllib.request.urlopen(req, timeout=10) as response:
            body = json.load(response)
        self.assertEqual(body["status"], "ok")
        self.assertIn("busy", body)
        self.assertNotIn("tasks", body)


if __name__ == "__main__":
    unittest.main()
