"""Loopback-only bridge to the Codex CLI bundled with Ten.

The bridge is intentionally dependency-free: it uses the Python standard
library only.  It is started by the Android app inside the Termux bootstrap
environment, but the same file can be used from a normal Linux desktop.
"""
from __future__ import annotations

import contextlib
import hmac
import json
import mimetypes
import os
from pathlib import Path
import queue
import re
import secrets
import select
import signal
import socket
import socketserver
import subprocess
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit

ROOT = Path(os.environ.get("TEN_LOCAL_HOME", Path.home() / ".ten-local"))
ROOT.mkdir(mode=0o700, parents=True, exist_ok=True)
TOKEN = ROOT / "token"
if not TOKEN.exists():
    fd = os.open(TOKEN, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "w") as f:
        f.write(secrets.token_urlsafe(32))
SECRET = TOKEN.read_text().strip()
WORK = ROOT / "workspace"
WORK.mkdir(exist_ok=True)

PROXY_PORT = int(os.environ.get("TEN_PROXY_PORT", "18767"))
PROXY_READY = False
TASKS: dict[str, "Task"] = {}
TASKS_LOCK = threading.Lock()
MAX_STDERR = 8192


def safe_task_id(value: object) -> str:
    text = str(value or "default")
    text = re.sub(r"[^A-Za-z0-9_-]", "", text)[:64]
    return text or "default"


def task_workspace(task_id: str) -> Path:
    directory = WORK if task_id == "default" else WORK / task_id
    directory.mkdir(parents=True, exist_ok=True)
    return directory


class Task:
    def __init__(self, task_id: str):
        self.id = task_id
        self.process: subprocess.Popen | None = None
        self.status = "queued"
        self.started = time.time()
        self.finished = 0.0
        self.last_reasoning = ""
        self.last_answer = ""
        self.reasoning_items: dict[str, str] = {}
        self.answer_items: dict[str, str] = {}
        self.error = ""
        self.last_tool_error = ""
        self.tool_successes = 0
        self.tool_failures = 0
        self.returncode: int | None = None
        self.files: list[dict] = []
        self.lock = threading.Lock()

    def _refresh_reasoning(self) -> None:
        self.last_reasoning = "\n\n".join(v for v in self.reasoning_items.values() if v.strip())

    def _refresh_answer(self) -> None:
        self.last_answer = "\n\n".join(v for v in self.answer_items.values() if v.strip())

    def record_reasoning(self, item_id: str, text: str) -> None:
        if not text:
            if item_id and item_id not in self.reasoning_items:
                self.reasoning_items[item_id] = ""
            return
        key = item_id or f"part-{len(self.reasoning_items)}"
        self.reasoning_items[key] = text
        self._refresh_reasoning()

    def record_answer(self, item_id: str, text: str) -> None:
        if not text:
            return
        key = item_id or f"part-{len(self.answer_items)}"
        self.answer_items[key] = text
        self._refresh_answer()

    def append_reasoning(self, item_id: str, delta: str, part: int = 0) -> None:
        if not delta:
            return
        key = f"{item_id or 'reasoning'}#{part}"
        self.reasoning_items[key] = self.reasoning_items.get(key, "") + delta
        self._refresh_reasoning()

    def set_reasoning_parts(self, item_id: str, parts: list[str]) -> None:
        base = item_id or "reasoning"
        for key in [k for k in self.reasoning_items if k == base or k.startswith(base + "#")]:
            del self.reasoning_items[key]
        text = "\n\n".join(part for part in parts if part.strip())
        if text:
            self.reasoning_items[base] = text
        self._refresh_reasoning()

    def append_answer(self, item_id: str, delta: str) -> None:
        if not delta:
            return
        key = item_id or "answer"
        self.answer_items[key] = self.answer_items.get(key, "") + delta
        self._refresh_answer()

    def set_answer(self, item_id: str, text: str) -> None:
        if not text:
            return
        self.answer_items[item_id or "answer"] = text
        self._refresh_answer()

    def snapshot(self) -> dict:
        return {
            "task_id": self.id,
            "status": self.status,
            "started": self.started,
            "finished": self.finished,
            "reasoning": self.last_reasoning[-60000:],
            "answer": self.last_answer[-16000:],
            "error": self.error[-2000:],
            "tool_error": self.last_tool_error[-2000:],
            "tool_successes": self.tool_successes,
            "tool_failures": self.tool_failures,
            "returncode": self.returncode,
            "files": self.files,
        }


IGNORED_ARTIFACT_DIRS = {
    ".git", "__pycache__", ".gradle", ".kotlin", ".idea", ".vscode",
    "node_modules", "build",
}
IGNORED_ARTIFACT_SUFFIXES = {
    ".pyc", ".pyo", ".class", ".dex", ".o", ".obj", ".tmp", ".temp", ".log",
}
IGNORED_ARTIFACT_NAMES = {".ds_store", "thumbs.db", "desktop.ini"}


def ignored_artifact(path: Path, workspace: Path) -> bool:
    try:
        relative = path.relative_to(workspace)
    except ValueError:
        return True
    if any(part.lower() in IGNORED_ARTIFACT_DIRS for part in relative.parts[:-1]):
        return True
    if path.name.lower() in IGNORED_ARTIFACT_NAMES:
        return True
    return path.suffix.lower() in IGNORED_ARTIFACT_SUFFIXES


def workspace_snapshot(workspace: Path) -> dict[str, int]:
    snapshot: dict[str, int] = {}
    try:
        for item in workspace.rglob("*"):
            if not item.is_file() or ignored_artifact(item, workspace):
                continue
            try:
                snapshot[str(item)] = item.stat().st_mtime_ns
            except OSError:
                pass
    except OSError:
        pass
    return snapshot


def changed_files(workspace: Path, before: dict[str, int]) -> list[dict]:
    result: list[dict] = []
    try:
        for item in workspace.rglob("*"):
            if not item.is_file() or ignored_artifact(item, workspace):
                continue
            try:
                stat = item.stat()
            except OSError:
                continue
            if before.get(str(item)) == stat.st_mtime_ns:
                continue
            if stat.st_size > 100 * 1024 * 1024:
                continue
            result.append({
                "name": item.name,
                "path": str(item),
                "size": stat.st_size,
                "mime": mimetypes.guess_type(item.name)[0] or "application/octet-stream",
                "modified": stat.st_mtime_ns,
            })
    except OSError:
        pass
    result.sort(key=lambda value: value["modified"], reverse=True)
    return result[:8]


def active_task(task_id: str) -> bool:
    with TASKS_LOCK:
        task = TASKS.get(task_id)
    if task is None:
        return False
    if task.status in ("queued", "running"):
        return True
    return task.process is not None and task.process.poll() is None


def stop_task(task_id: str | None = None) -> bool:
    stopped = False
    with TASKS_LOCK:
        tasks = list(TASKS.values()) if task_id is None else [TASKS[task_id]] if task_id in TASKS else []
    for task in tasks:
        process = task.process
        if process is None or process.poll() is not None:
            continue
        try:
            os.killpg(process.pid, signal.SIGKILL)
            stopped = True
        except ProcessLookupError:
            pass
        except OSError:
            pass
    return stopped


def _reasoning_text(item: dict) -> str:
    for key in ("text", "summary", "content"):
        value = item.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
        if isinstance(value, list):
            parts = []
            for part in value:
                if isinstance(part, dict):
                    text = part.get("text") or part.get("content")
                    if isinstance(text, str):
                        parts.append(text)
                elif isinstance(part, str):
                    parts.append(part)
            if parts:
                return "\n".join(parts).strip()
    return ""


TOOL_RUNTIME_FAILURES = (
    "failed to spawn",
    "code mode is unavailable",
    "stream closed",
    "error while loading shared libraries",
    "cannot execute",
    "cannot link executable",
    "inaccessible or not found",
    "command not found",
    "permission denied",
)


def _tool_runtime_failed(task: Task) -> bool:
    detail = task.last_tool_error.lower()
    return task.tool_successes == 0 and any(marker in detail for marker in TOOL_RUNTIME_FAILURES)


def _tool_error_text(item: dict) -> str:
    command = item.get("command")
    if isinstance(command, list):
        command = " ".join(str(part) for part in command)
    output = item.get("aggregated_output") or item.get("output") or item.get("error")
    if isinstance(output, dict):
        output = output.get("message") or output.get("code")
    pieces = [str(value).strip() for value in (command, output) if value]
    return ": ".join(pieces)


def handle_event(task: Task, event: dict) -> None:
    kind = event.get("type", "")
    if kind in ("error", "turn.failed"):
        error = event.get("error") or event.get("message")
        if isinstance(error, dict):
            error = error.get("message") or error.get("code")
        if error:
            task.error = str(error)[-2000:]
            task.last_tool_error = str(error)[-2000:]
        if kind == "turn.failed":
            task.status = "failed"
        return
    if kind in ("item.started", "item.updated", "item.completed"):
        item = event.get("item") or {}
        if not isinstance(item, dict):
            return
        item_type = str(item.get("type", "")).lower()
        status = str(item.get("status", "")).lower()
        if item_type in ("command_execution", "exec_command"):
            if status == "completed" and item.get("exit_code") in (None, 0):
                task.tool_successes += 1
            elif status in ("failed", "declined") or item.get("exit_code") not in (None, 0):
                task.tool_failures += 1
                message = _tool_error_text(item)
                if message:
                    task.last_tool_error = message[-2000:]
            return
        if item_type == "error":
            message = str(item.get("message") or _reasoning_text(item)).strip()
            lowered = message.lower()
            if message and ("code mode is unavailable" in lowered or "failed to spawn" in lowered):
                task.last_tool_error = message[-2000:]
            return
        text = _reasoning_text(item)
        item_id = str(item.get("id") or "")
        if "reasoning" in item_type or "thought" in item_type or "plan" in item_type:
            task.record_reasoning(item_id, text)
        elif "message" in item_type or "assistant" in item_type or item_type == "agent_message":
            task.record_answer(item_id, text)
    elif kind == "turn.completed":
        response = event.get("response") or {}
        if isinstance(response, dict):
            output = _reasoning_text(response)
            if output:
                task.last_answer = output[-16000:]


def run_process(task: Task, command: list[str], prompt: str, env: dict, output: Path, timeout: int) -> subprocess.CompletedProcess:
    process = subprocess.Popen(
        command,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        errors="replace",
        start_new_session=True,
        env=env,
    )
    task.process = process
    task.status = "running"
    stderr_chunks: list[str] = []

    def read_stdout() -> None:
        assert process.stdout is not None
        for line in process.stdout:
            line = line.rstrip()
            if not line:
                continue
            try:
                event = json.loads(line)
            except json.JSONDecodeError:
                continue
            if isinstance(event, dict):
                handle_event(task, event)

    def read_stderr() -> None:
        assert process.stderr is not None
        while True:
            chunk = process.stderr.read(2048)
            if not chunk:
                break
            stderr_chunks.append(chunk)
            joined = "".join(stderr_chunks)
            if len(joined) > MAX_STDERR * 2:
                stderr_chunks[:] = [joined[-MAX_STDERR:]]

    out_thread = threading.Thread(target=read_stdout, daemon=True)
    err_thread = threading.Thread(target=read_stderr, daemon=True)
    out_thread.start()
    err_thread.start()
    try:
        assert process.stdin is not None
        process.stdin.write(prompt)
        process.stdin.close()
        process.wait(timeout=timeout)
    except subprocess.TimeoutExpired:
        stop_task(task.id)
        process.wait()
        task.status = "timeout"
        raise
    finally:
        out_thread.join(2)
        err_thread.join(2)
        task.process = None
        task.returncode = process.returncode
        task.finished = time.time()
    stderr = "".join(stderr_chunks)[-MAX_STDERR:]
    answer = output.read_text(encoding="utf-8", errors="replace") if output.exists() else ""
    if not answer.strip():
        answer = task.last_answer
    if process.returncode == 0:
        task.status = "done"
        task.last_answer = answer[-8000:]
    elif process.returncode == -signal.SIGKILL:
        task.status = "cancelled"
    elif task.status != "timeout":
        task.status = "failed"
        task.error = stderr[-2000:]
    return subprocess.CompletedProcess(command, process.returncode, answer, stderr)



class AppServerUnavailable(RuntimeError):
    """The app-server could not start; the caller may fall back to codex exec."""


class AppServerStopped(RuntimeError):
    """The app-server was killed by the user."""


def handle_app_notification(task: Task, message: dict) -> str | None:
    """Apply one app-server notification.

    Returns ``completed``, ``interrupted`` or ``failed`` when the turn ends.
    """
    method = str(message.get("method") or "")
    params = message.get("params")
    if not isinstance(params, dict):
        params = {}
    if method == "item/reasoning/summaryTextDelta":
        task.append_reasoning(str(params.get("itemId") or ""),
                              str(params.get("delta") or ""),
                              int(params.get("summaryIndex") or 0))
    elif method == "item/reasoning/textDelta":
        task.append_reasoning(str(params.get("itemId") or ""), str(params.get("delta") or ""), 99)
    elif method == "item/agentMessage/delta":
        task.append_answer(str(params.get("itemId") or ""), str(params.get("delta") or ""))
    elif method == "item/completed":
        item = params.get("item")
        if isinstance(item, dict):
            kind = str(item.get("type") or "")
            item_id = str(item.get("id") or "")
            if kind == "reasoning":
                parts = item.get("summary")
                if not isinstance(parts, list) or not parts:
                    parts = item.get("content")
                if isinstance(parts, list):
                    cleaned = [str(part) for part in parts if str(part).strip()]
                    if cleaned:
                        task.set_reasoning_parts(item_id, cleaned)
            elif kind == "agentMessage":
                task.set_answer(item_id, str(item.get("text") or ""))
            elif kind == "commandExecution":
                status = str(item.get("status") or "").lower()
                code = item.get("exitCode")
                if status == "completed" and code in (None, 0):
                    task.tool_successes += 1
                elif status in ("failed", "declined") or code not in (None, 0):
                    task.tool_failures += 1
                    text = str(item.get("aggregatedOutput") or item.get("command") or "").strip()
                    if text:
                        task.last_tool_error = text[-2000:]
    elif method == "error":
        text = params.get("message") or params.get("error") or message.get("error")
        if isinstance(text, dict):
            text = text.get("message") or text.get("code")
        if text:
            task.error = str(text)[-2000:]
    elif method == "turn/completed":
        turn = params.get("turn")
        if not isinstance(turn, dict):
            turn = {}
        status = str(turn.get("status") or "").lower()
        items = turn.get("items")
        if isinstance(items, list):
            for item in reversed(items):
                if isinstance(item, dict) and item.get("type") == "agentMessage":
                    text = str(item.get("text") or "")
                    if text.strip():
                        task.last_answer = text[-16000:]
                    break
        if status == "completed":
            return "completed"
        if status == "interrupted":
            return "interrupted"
        error = turn.get("error")
        if isinstance(error, dict):
            text = error.get("message") or error.get("code")
        else:
            text = error
        if text:
            task.error = str(text)[-2000:]
        return "failed"
    return None


def run_app_server(task: Task, options: list[str], model_id: str, model_provider: str | None,
                   workspace: Path, prompt: str, env: dict[str, str],
                   timeout: int) -> subprocess.CompletedProcess:
    """Drive one Codex turn through ``codex app-server``.

    Unlike ``codex exec --json`` (which only reports a reasoning item once it is
    finished), the app-server streams ``item/reasoning/summaryTextDelta`` while
    the model is still thinking.
    """
    command = ["codex", "app-server"] + options
    process = subprocess.Popen(
        command,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        errors="replace",
        start_new_session=True,
        env=env,
    )
    task.process = process
    task.status = "running"
    stream: "queue.Queue[str | None]" = queue.Queue()
    stderr_chunks: list[str] = []

    def read_stdout() -> None:
        assert process.stdout is not None
        for line in process.stdout:
            stream.put(line)
        stream.put(None)

    def read_stderr() -> None:
        assert process.stderr is not None
        while True:
            chunk = process.stderr.read(2048)
            if not chunk:
                break
            stderr_chunks.append(chunk)
            joined = "".join(stderr_chunks)
            if len(joined) > MAX_STDERR * 2:
                stderr_chunks[:] = [joined[-MAX_STDERR:]]

    threading.Thread(target=read_stdout, daemon=True).start()
    threading.Thread(target=read_stderr, daemon=True).start()

    def stderr_text() -> str:
        return "".join(stderr_chunks)[-MAX_STDERR:]

    def send(payload: dict) -> None:
        if process.stdin is None:
            raise AppServerUnavailable("app-server stdin is closed")
        try:
            process.stdin.write(json.dumps(payload, ensure_ascii=False) + "\n")
            process.stdin.flush()
        except (BrokenPipeError, OSError) as exc:
            raise AppServerUnavailable(stderr_text() or str(exc)) from exc

    def receive(deadline: float, fallback: bool) -> dict:
        while True:
            remaining = deadline - time.time()
            if remaining <= 0:
                raise subprocess.TimeoutExpired(command, timeout)
            try:
                line = stream.get(timeout=min(0.5, remaining))
            except queue.Empty:
                if process.poll() is not None and stream.empty():
                    if process.returncode == -signal.SIGKILL:
                        raise AppServerStopped()
                    if fallback:
                        raise AppServerUnavailable(stderr_text() or "app-server exited")
                    raise RuntimeError(stderr_text() or "Соединение с Codex app-server закрылось")
                continue
            if line is None:
                if process.poll() == -signal.SIGKILL:
                    raise AppServerStopped()
                if fallback:
                    raise AppServerUnavailable(stderr_text() or "app-server exited")
                raise RuntimeError(stderr_text() or "Соединение с Codex app-server закрылось")
            try:
                message = json.loads(line)
            except json.JSONDecodeError:
                continue
            if isinstance(message, dict):
                return message

    counter = 0

    def next_id() -> int:
        nonlocal counter
        counter += 1
        return counter

    def request(method: str, params: dict, limit: float, fallback: bool) -> dict:
        message_id = next_id()
        send({"jsonrpc": "2.0", "id": message_id, "method": method, "params": params})
        deadline = time.time() + limit
        while True:
            message = receive(deadline, fallback)
            if message.get("id") == message_id:
                error = message.get("error")
                if error:
                    text = error.get("message") if isinstance(error, dict) else error
                    raise RuntimeError(str(text or "app-server error"))
                result = message.get("result")
                return result if isinstance(result, dict) else {}
            handle_app_notification(task, message)

    try:
        request("initialize", {"clientInfo": {"name": "vibecoder", "version": "1.0.0"}}, 30, True)
        send({"jsonrpc": "2.0", "method": "initialized", "params": {}})
        params: dict = {
            "cwd": str(workspace),
            "approvalPolicy": "never",
            "sandbox": os.environ.get("TEN_CODEX_SANDBOX", "danger-full-access"),
            "ephemeral": True,
        }
        if model_id:
            params["model"] = model_id
        if model_provider:
            params["modelProvider"] = model_provider
        started = request("thread/start", params, 120, True)
        thread = started.get("thread")
        thread_id = str(thread.get("id") or "") if isinstance(thread, dict) else ""
        if not thread_id:
            raise AppServerUnavailable("app-server did not return a thread id")
        turn_request = next_id()
        send({"jsonrpc": "2.0", "id": turn_request, "method": "turn/start",
              "params": {"threadId": thread_id, "input": [{"type": "text", "text": prompt}]}})
        deadline = time.time() + timeout
        while True:
            message = receive(deadline, False)
            if message.get("id") == turn_request:
                error = message.get("error")
                if error:
                    text = error.get("message") if isinstance(error, dict) else error
                    raise RuntimeError(str(text or "Не удалось начать задачу"))
                continue
            outcome = handle_app_notification(task, message)
            if outcome == "completed":
                return subprocess.CompletedProcess(command, 0, task.last_answer[-16000:], stderr_text())
            if outcome == "interrupted":
                return subprocess.CompletedProcess(command, -signal.SIGKILL, task.last_answer, stderr_text())
            if outcome == "failed":
                return subprocess.CompletedProcess(command, 1, task.last_answer, stderr_text())
    finally:
        with contextlib.suppress(ProcessLookupError, OSError):
            os.killpg(process.pid, signal.SIGKILL)
        with contextlib.suppress(Exception):
            process.wait(timeout=5)
        task.process = None
        task.returncode = process.returncode
        task.finished = time.time()


class ProxyServer(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


class ProxyHandler(socketserver.StreamRequestHandler):
    def handle(self) -> None:
        line = self.rfile.readline(65536).decode("latin-1").strip()
        if not line:
            return
        parts = line.split()
        if len(parts) < 3:
            return
        method, target = parts[0].upper(), parts[1]
        headers = []
        while True:
            header = self.rfile.readline(65536)
            if header in (b"\r\n", b"\n", b""):
                break
            headers.append(header)
        if method != "CONNECT":
            self.wfile.write(b"HTTP/1.1 405 Method Not Allowed\r\nContent-Length: 0\r\n\r\n")
            return
        try:
            host, port_text = target.rsplit(":", 1)
            port = int(port_text)
            upstream = socket.create_connection((host, port), timeout=25)
        except (OSError, ValueError):
            self.wfile.write(b"HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\n\r\n")
            return
        self.wfile.write(b"HTTP/1.1 200 Connection Established\r\n\r\n")
        self.wfile.flush()
        sockets = [self.connection, upstream]
        try:
            while True:
                readable, _, _ = select.select(sockets, [], [], 120)
                if not readable:
                    break
                for source in readable:
                    data = source.recv(65536)
                    if not data:
                        return
                    destination = upstream if source is self.connection else self.connection
                    destination.sendall(data)
        except OSError:
            pass
        finally:
            upstream.close()


def start_proxy() -> bool:
    global PROXY_READY
    if PROXY_READY:
        return True
    try:
        server = ProxyServer(("127.0.0.1", PROXY_PORT), ProxyHandler)
    except OSError:
        return False
    threading.Thread(target=server.serve_forever, daemon=True).start()
    PROXY_READY = True
    return True


def codex_runtime_config(env: dict[str, str]) -> list[str]:
    """Configuration that makes Codex tools usable inside the Android bootstrap.

    Codex clears LD_* variables before main() for security.  The Termux
    executables still need their relocated library path and termux-exec shim, so
    put those values back into the *child* environment explicitly.  A login shell
    is disabled because Android's /bin/sh profile can reset PATH away from the
    embedded prefix.
    """
    options = [
        "-c", "allow_login_shell=false",
        "-c", "features.shell_snapshot=false",
        "-c", "features.code_mode_host=true",
    ]
    library_path = env.get("LD_LIBRARY_PATH", "")
    preload = env.get("LD_PRELOAD", "")
    if library_path:
        options += ["-c", "shell_environment_policy.set.LD_LIBRARY_PATH=" + json.dumps(library_path)]
    if preload:
        options += ["-c", "shell_environment_policy.set.LD_PRELOAD=" + json.dumps(preload)]
    shell_path = env.get("SHELL", "")
    if shell_path and os.path.isabs(shell_path):
        instructions = (
            "Local Android runtime. For every exec_command call set login=false and "
            f"shell={json.dumps(shell_path)}. Never use a login shell. "
            "GitHub CLI gh is installed and authenticated through GH_TOKEN; use it for repository, PR and issue operations. "
            "Use the embedded Python, Git and ripgrep from the inherited PATH; "
            "work in the supplied workspace unless the user explicitly asks to clone another repository."
        )
        options += ["-c", "developer_instructions=" + json.dumps(instructions)]
    return options


def execute_task(task: Task, goal: str, selected: str, provider_token: str,
                 base_url: str, gh_token: str, reasoning_effort: str = "medium") -> tuple[int, dict]:
    """Run Codex and return an HTTP-style status and JSON payload.

    Both /run (compatibility) and /start (preferred by the Android client) use
    this function.  /start runs it in a worker thread so a long Codex turn never
    keeps a single HTTP stream open for many minutes.
    """
    output_dir: Path | None = None
    try:
        workspace = task_workspace(task.id)
        output_dir = Path(tempfile.mkdtemp(prefix="result-", dir=ROOT))
        output = output_dir / "answer.txt"
        before_files = workspace_snapshot(workspace)
        sandbox = os.environ.get("TEN_CODEX_SANDBOX", "danger-full-access")
        model_id = ""
        if selected:
            model_id = selected
            if selected.startswith(("chatgpt:", "deepseek:", "any:", "compatible:")):
                model_id = selected.split(":", 1)[1]
        backend = None
        if selected.startswith("chatgpt:"):
            backend = "https://api.openai.com/v1"
        elif selected.startswith("deepseek:"):
            backend = "https://api.deepseek.com"
        elif selected.startswith("any:") or re.match(r"^(?:cx|cc|ds|ag|kmc)/", selected, re.IGNORECASE):
            backend = "https://anymodel.org/v1"
        elif selected.startswith("compatible:"):
            backend = base_url
        runtime_options = codex_runtime_config(os.environ)
        provider_options: list[str] = []
        if backend:
            provider_options = [
                "-c", 'model_provider="ten_provider"',
                "-c", 'model_providers.ten_provider.name="Vibe provider"',
                "-c", "model_providers.ten_provider.base_url=" + json.dumps(backend),
                "-c", 'model_providers.ten_provider.env_key="TEN_PROVIDER_TOKEN"',
                "-c", 'model_providers.ten_provider.wire_api="responses"',
                "-c", "model_providers.ten_provider.requires_openai_auth=false",
            ]
        effort_options: list[str] = []
        if reasoning_effort in {"low", "medium", "high"}:
            effort_options = ["-c", "model_reasoning_effort=" + json.dumps(reasoning_effort)]
        command = ["codex", "exec", "--skip-git-repo-check", "--sandbox", sandbox,
                   "-C", str(workspace), "-o", str(output), "--json"]
        command += runtime_options
        if model_id:
            command += ["-m", model_id]
        command += provider_options + effort_options
        command.append("-")
        env = os.environ.copy()
        if gh_token and isinstance(gh_token, str) and gh_token.strip():
            env["GH_TOKEN"] = gh_token.strip()
            env["GITHUB_TOKEN"] = gh_token.strip()
            env["GH_PROMPT_DISABLED"] = "1"
            env["GH_NO_UPDATE_NOTIFIER"] = "1"
        if backend:
            env["TEN_PROVIDER_TOKEN"] = provider_token.strip()
        if PROXY_READY:
            proxy = f"http://127.0.0.1:{PROXY_PORT}"
            env["HTTPS_PROXY"] = proxy
            env["HTTP_PROXY"] = proxy
            env["ALL_PROXY"] = proxy
            env["NO_PROXY"] = "127.0.0.1,localhost"
        try:
            result = run_app_server(
                task,
                runtime_options + provider_options + effort_options
                + ["-c", 'model_reasoning_summary="detailed"'],
                model_id,
                "ten_provider" if backend else None,
                workspace,
                goal,
                env,
                1200,
            )
        except AppServerStopped:
            return 409, {"error": "Задача остановлена", "task_id": task.id}
        except AppServerUnavailable:
            result = run_process(task, command, goal, env, output, 1200)
        diagnostic = result.stderr or ""
        if "error building bubblewrap command" in diagnostic or "cannot establish app-server socket mount isolation" in diagnostic:
            message = "Локальная песочница Codex несовместима с окружением телефона. Выполнение команд не подтверждено."
            task.status = "failed"
            task.error = message
            return 503, {"error": message, "task_id": task.id}
        if result.returncode == -signal.SIGKILL:
            return 409, {"error": "Задача остановлена", "task_id": task.id}
        if result.returncode != 0:
            details = task.error or diagnostic[-1000:]
            message = "Локальный Codex завершился с ошибкой"
            if details:
                message += ": " + details.replace("\n", " ")[:300]
            task.status = "failed"
            task.error = message
            return 502, {"error": message, "task_id": task.id}
        answer = (result.stdout or "").strip()
        if not answer:
            message = "Codex не вернул текстовый результат"
            task.status = "failed"
            task.error = message
            return 502, {"error": message, "task_id": task.id}
        if task.tool_failures and _tool_runtime_failed(task):
            details = task.last_tool_error or "команда завершилась с ошибкой"
            message = "Инструмент выполнения команд Codex не запустился: " + details.replace("\n", " ")[:500]
            task.status = "failed"
            task.error = message
            return 502, {"error": message, "task_id": task.id}
        task.status = "done"
        task.last_answer = answer[-8000:]
        task.files = changed_files(workspace, before_files)
        return 200, {"result": answer, "task_id": task.id, "files": task.files}
    except subprocess.TimeoutExpired:
        task.status = "timeout"
        task.error = "Время задачи истекло"
        return 504, {"error": task.error, "task_id": task.id}
    except (OSError, UnicodeError) as exc:
        message = "Не удалось запустить локальный Codex: " + str(exc)[:200]
        task.status = "failed"
        task.error = message
        return 500, {"error": message, "task_id": task.id}
    finally:
        task.finished = time.time()
        try:
            if output_dir is not None and output_dir.exists():
                for child in output_dir.iterdir():
                    child.unlink(missing_ok=True)
                output_dir.rmdir()
        except OSError:
            pass


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *args):
        return

    def reply(self, status: int, value: dict) -> None:
        data = json.dumps(value, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Connection", "close")
        self.end_headers()
        self.wfile.write(data)
        self.wfile.flush()
        self.close_connection = True

    def authorized(self) -> bool:
        return hmac.compare_digest(self.headers.get("Authorization", ""), "Bearer " + SECRET)

    def do_GET(self) -> None:
        path = urlsplit(self.path)
        if path.path == "/health":
            with TASKS_LOCK:
                busy = any(t.status in ("queued", "running") for t in TASKS.values())
            return self.reply(200, {"status": "ok", "busy": busy})
        if path.path == "/status":
            if not self.authorized():
                return self.reply(401, {"error": "Проверь ключ локального окружения"})
            task_id = path.query.removeprefix("task_id=") if path.query.startswith("task_id=") else ""
            if task_id:
                with TASKS_LOCK:
                    task = TASKS.get(safe_task_id(task_id))
                if task is None:
                    return self.reply(404, {"error": "Задача не найдена"})
                return self.reply(200, task.snapshot())
            with TASKS_LOCK:
                return self.reply(200, {"tasks": [t.snapshot() for t in TASKS.values()][-20:]})
        return self.reply(404, {"error": "Неизвестный адрес"})

    def do_POST(self) -> None:
        path = urlsplit(self.path).path
        if path not in {"/run", "/start", "/cancel"}:
            return self.reply(404, {"error": "Неизвестный адрес"})
        if not self.authorized():
            return self.reply(401, {"error": "Проверь ключ локального окружения"})
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 < length <= 100000:
                raise ValueError()
            request = json.loads(self.rfile.read(length))
            if not isinstance(request, dict):
                raise ValueError()
        except (ValueError, json.JSONDecodeError):
            return self.reply(400, {"error": "Некорректный запрос"})
        if path == "/cancel":
            task_id = request.get("task_id")
            return self.reply(200, {"stopped": stop_task(safe_task_id(task_id) if task_id else None)})
        try:
            goal = request["goal"]
            if not isinstance(goal, str) or not 0 < len(goal) <= 16000:
                raise ValueError()
        except (KeyError, TypeError, ValueError):
            return self.reply(400, {"error": "Некорректная задача"})
        task_id = safe_task_id(request.get("task_id", "default"))
        if active_task(task_id):
            return self.reply(409, {"error": "Codex уже выполняет задачу в этом диалоге", "task_id": task_id})
        selected = request.get("selected", "")
        provider_token = request.get("provider_token", "")
        base_url = request.get("base_url", "")
        gh_token = request.get("gh_token", "")
        reasoning_effort = request.get("reasoning_effort", "medium")
        if not isinstance(selected, str) or not re.fullmatch(r"[a-zA-Z0-9._/:\-]{0,160}", selected):
            return self.reply(400, {"error": "Некорректная модель"})
        backend = None
        model_id = selected
        if selected.startswith("chatgpt:"):
            backend = "https://api.openai.com/v1"
            model_id = selected.split(":", 1)[1]
        elif selected.startswith("deepseek:"):
            backend = "https://api.deepseek.com"
            model_id = selected.split(":", 1)[1]
        elif selected.startswith("any:"):
            backend = "https://anymodel.org/v1"
            model_id = selected.split(":", 1)[1]
        elif re.match(r"^(?:cx|cc|ds|ag|kmc)/", selected, re.IGNORECASE):
            backend = "https://anymodel.org/v1"
        elif selected.startswith("compatible:"):
            model_id = selected.split(":", 1)[1]
            backend = base_url if isinstance(base_url, str) else ""
            if not re.fullmatch(r"https://[a-zA-Z0-9._:-]+(?:/[a-zA-Z0-9._/-]*)?", backend):
                return self.reply(400, {"error": "Некорректный адрес провайдера"})
        elif selected:
            return self.reply(400, {"error": "Провайдер пока не поддерживается"})
        if selected and not model_id.strip():
            return self.reply(400, {"error": "Некорректная модель"})
        if backend and (not isinstance(provider_token, str) or not provider_token.strip()):
            return self.reply(400, {"error": "Укажи ключ выбранного провайдера"})
        task = Task(task_id)
        with TASKS_LOCK:
            TASKS[task_id] = task
        if path == "/start" or request.get("background") is True:
            task.status = "queued"
            def worker() -> None:
                status, payload = execute_task(task, goal, selected, provider_token, base_url, gh_token, reasoning_effort)
                if status != 200 and task.status not in ("cancelled", "timeout"):
                    task.status = "failed"
                    task.error = str(payload.get("error", "Ошибка локального Codex"))[-2000:]
                task.finished = time.time()
            threading.Thread(target=worker, name="codex-task-" + task_id, daemon=True).start()
            return self.reply(202, {"status": "started", "task_id": task_id})
        status, payload = execute_task(task, goal, selected, provider_token, base_url, gh_token, reasoning_effort)
        return self.reply(status, payload)


if __name__ == "__main__":
    start_proxy()
    print("Вайбкодер: локальный исполнитель на 127.0.0.1:18766", flush=True)
    ThreadingHTTPServer(("127.0.0.1", 18766), Handler).serve_forever()
