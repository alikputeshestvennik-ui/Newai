"""Adapt NVIDIA Chat Completions to the Responses stream read by Codex."""

import contextlib
import hashlib
import hmac
import http.client
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import re
import secrets
import threading
from urllib.parse import urlsplit


HOST = "integrate.api.nvidia.com"


def is_nvidia_endpoint(url):
    address = urlsplit(url)
    return (
        address.scheme == "https"
        and address.netloc.lower() in (HOST, HOST + ":443")
        and address.path.rstrip("/") in ("", "/v1")
    )


def tool_name(name, namespace):
    if not namespace:
        return name
    identity = f"{namespace}.{name}"
    prefix = re.sub(r"[^a-zA-Z0-9_-]", "_", identity)[:48]
    return prefix + "_" + hashlib.sha256(identity.encode()).hexdigest()[:12]


def chat_tools(definitions, namespace=None):
    for tool in definitions:
        kind = tool["type"]
        if kind == "namespace":
            yield from chat_tools(tool["tools"], tool["name"])
        elif kind in ("function", "custom"):
            yield tool_name(tool["name"], namespace), (tool, namespace)


def chat_content(content):
    if isinstance(content, str):
        return content
    parts = []
    for item in content:
        if item["type"] in ("input_text", "output_text", "text"):
            parts.append({"type": "text", "text": item["text"]})
        elif item["type"] in ("input_image", "image_url"):
            image = item["image_url"]
            parts.append({"type": "image_url", "image_url": image if isinstance(image, dict) else {"url": image}})
    if all(part["type"] == "text" for part in parts):
        return "\n".join(part["text"] for part in parts)
    return parts


def chat_request(request, reasoning_by_call):
    tools = dict(chat_tools(request.get("tools", [])))
    messages = []
    if request.get("instructions"):
        messages.append({"role": "system", "content": request["instructions"]})
    items = request.get("input", [])
    if isinstance(items, str):
        items = [{"type": "message", "role": "user", "content": items}]
    for item in items:
        kind = item.get("type", "message")
        if kind == "message":
            role = "system" if item["role"] == "developer" else item["role"]
            content = chat_content(item["content"])
            if role == "system" and messages and messages[-1]["role"] == "system" and isinstance(content, str):
                messages[-1]["content"] += "\n\n" + content
            else:
                messages.append({"role": role, "content": content})
        elif kind in ("function_call", "custom_tool_call"):
            if not messages or messages[-1]["role"] != "assistant":
                messages.append({"role": "assistant", "content": None})
            assistant = messages[-1]
            call_id = item["call_id"]
            if call_id in reasoning_by_call:
                assistant["reasoning_content"] = reasoning_by_call[call_id]
            arguments = item["arguments"] if kind == "function_call" else json.dumps({"input": item["input"]})
            assistant.setdefault("tool_calls", []).append({
                "id": call_id, "type": "function",
                "function": {"name": tool_name(item["name"], item.get("namespace")), "arguments": arguments},
            })
        elif kind in ("function_call_output", "custom_tool_call_output"):
            messages.append({"role": "tool", "tool_call_id": item["call_id"], "content": chat_content(item["output"])})

    body = {"model": request["model"], "messages": messages, "stream": True}
    if tools:
        body["tools"] = []
        for name, (tool, _) in tools.items():
            function = {"name": name, "description": tool.get("description") or ""}
            if tool["type"] == "custom":
                function["parameters"] = {
                    "type": "object",
                    "properties": {"input": {"type": "string", "description": "Full raw tool input"}},
                    "required": ["input"],
                }
            else:
                function["parameters"] = tool.get("parameters") or {"type": "object", "properties": {}}
            body["tools"].append({"type": "function", "function": function})
    if request.get("max_output_tokens") is not None:
        body["max_tokens"] = request["max_output_tokens"]
    return body, tools


def response_tool(call_id, name, arguments, tools):
    tool, namespace = tools.get(name, ({"type": "function", "name": name}, None))
    item = {"id": "tool_" + secrets.token_hex(12), "call_id": call_id, "name": tool["name"]}
    if namespace:
        item["namespace"] = namespace
    if tool["type"] == "custom":
        item.update(type="custom_tool_call", input=json.loads(arguments)["input"])
        if not isinstance(item["input"], str):
            raise ValueError("NVIDIA вернула некорректные аргументы инструмента")
    else:
        item.update(type="function_call", arguments=arguments)
    return item


def responses_stream(upstream, tools, reasoning_by_call, emit):
    response_id = "resp_" + secrets.token_hex(12)
    message = {"type": "message", "role": "assistant", "id": "msg_" + secrets.token_hex(12), "content": []}
    text = []
    reasoning = []
    calls = {}
    usage = None
    finish = None
    emit("response.created", response={"id": response_id})
    for line in upstream:
        if not line.startswith(b"data:"):
            continue
        data = line[5:].strip()
        if data == b"[DONE]":
            break
        chunk = json.loads(data)
        if chunk.get("error"):
            raise ValueError("NVIDIA вернула ошибку в потоке генерации")
        if counts := chunk.get("usage"):
            usage = {
                "input_tokens": counts["prompt_tokens"],
                "output_tokens": counts["completion_tokens"],
                "total_tokens": counts["total_tokens"],
            }
        for choice in chunk.get("choices", []):
            finish = choice.get("finish_reason") or finish
            delta = choice.get("delta", {})
            if thought := delta.get("reasoning_content"):
                reasoning.append(thought)
                emit("response.in_progress", response={"id": response_id})
            if content := delta.get("content"):
                if not text:
                    emit("response.output_item.added", item=message, output_index=0)
                text.append(content)
                emit("response.output_text.delta", item_id=message["id"], output_index=0, content_index=0, delta=content)
            for part in delta.get("tool_calls") or []:
                call = calls.setdefault(part["index"], {"id": "", "name": "", "arguments": []})
                call["id"] = part.get("id") or call["id"]
                function = part.get("function", {})
                call["name"] += function.get("name") or ""
                call["arguments"].append(function.get("arguments") or "")
    if finish not in ("stop", "tool_calls", "length", "content_filter"):
        raise ValueError("Поток NVIDIA закрылся без завершения ответа")
    if finish == "tool_calls" and not calls:
        raise ValueError("NVIDIA завершила ответ без данных вызова инструмента")

    items = []
    if text:
        message["content"] = [{"type": "output_text", "text": "".join(text)}]
        message["status"] = "completed"
        items.append(message)
        emit("response.output_item.done", item=message, output_index=0)
    if finish in ("length", "content_filter"):
        reason = "max_output_tokens" if finish == "length" else "content_filter"
        if text:
            message["status"] = "incomplete"
        emit("response.incomplete", response={
            "id": response_id, "incomplete_details": {"reason": reason}, "usage": usage, "output": items,
        })
        return
    for index in sorted(calls):
        call = calls[index]
        if not call["id"] or not call["name"]:
            raise ValueError("NVIDIA вернула неполный вызов инструмента")
        if reasoning:
            reasoning_by_call[call["id"]] = "".join(reasoning)
        item = response_tool(call["id"], call["name"], "".join(call["arguments"]), tools)
        emit("response.output_item.added", item=item, output_index=len(items))
        emit("response.output_item.done", item=item, output_index=len(items))
        items.append(item)
    emit("response.completed", response={"id": response_id, "usage": usage, "output": items})


@contextlib.contextmanager
def adapter(provider_token):
    """Start a private loopback listener for one Codex turn."""
    local_token = secrets.token_urlsafe(32)
    reasoning_by_call = {}

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):
            return

        def do_POST(self):
            if self.path != "/responses":
                self.send_error(404)
                return
            if not hmac.compare_digest(self.headers.get("Authorization", ""), "Bearer " + local_token):
                self.send_error(401)
                return
            try:
                length = int(self.headers["Content-Length"])
                if not 0 < length <= 64 * 1024 * 1024:
                    raise ValueError("invalid body size")
                request = json.loads(self.rfile.read(length))
                body, tools = chat_request(request, reasoning_by_call)
            except (KeyError, TypeError, ValueError):
                self.send_error(400, "Invalid Responses request")
                return

            upstream = http.client.HTTPSConnection(HOST, timeout=120)
            try:
                upstream.request("POST", "/v1/chat/completions", body=json.dumps(body), headers={
                    "Content-Type": "application/json", "Accept": "text/event-stream",
                    "Authorization": "Bearer " + provider_token,
                })
                response = upstream.getresponse()
            except (OSError, http.client.HTTPException):
                upstream.close()
                self.send_error(502, "Could not connect to NVIDIA")
                return

            with contextlib.closing(upstream), response:
                if response.status != 200:
                    details = response.read(4096).decode(errors="replace").replace(provider_token, "[redacted]")
                    self.send_response(response.status)
                    self.send_header("Content-Type", response.getheader("Content-Type", "text/plain"))
                    if retry_after := response.getheader("Retry-After"):
                        self.send_header("Retry-After", retry_after)
                    self.end_headers()
                    self.wfile.write(details.encode())
                    return
                self.send_response(200)
                self.send_header("Content-Type", "text/event-stream")
                self.end_headers()

                def emit(kind, **data):
                    event = json.dumps({"type": kind, **data}, ensure_ascii=False)
                    self.wfile.write(f"event: {kind}\ndata: {event}\n\n".encode())

                try:
                    responses_stream(response, tools, reasoning_by_call, emit)
                except (OSError, KeyError, ValueError, TypeError, http.client.HTTPException) as exc:
                    if not isinstance(exc, (BrokenPipeError, ConnectionResetError)):
                        with contextlib.suppress(OSError):
                            emit("response.failed", response={"error": {
                                "message": "Ошибка потока NVIDIA: " + str(exc)[:250],
                            }})

    with ThreadingHTTPServer(("127.0.0.1", 0), Handler) as server:
        thread = threading.Thread(target=server.serve_forever, kwargs={"poll_interval": 0.1}, daemon=True)
        thread.start()
        try:
            yield f"http://127.0.0.1:{server.server_port}", local_token
        finally:
            server.shutdown()
            thread.join()
