import json
import unittest
import urllib.error
import urllib.request
from unittest.mock import patch

import nvidia_chat


class NvidiaChatTest(unittest.TestCase):
    def test_bridge_streams_a_tool_call_and_its_followup(self):
        def post(url, token, body):
            request = urllib.request.Request(url + "/responses", json.dumps(body).encode(), {
                "Authorization": "Bearer " + token,
            })
            with urllib.request.urlopen(request, timeout=5) as response:
                self.assertEqual(response.headers.get_content_type(), "text/event-stream")
                return [json.loads(line[6:]) for line in response if line.startswith(b"data: ")]

        def stream(*choices):
            return [b"data: " + json.dumps({"choices": [choice]}).encode() + b"\n" for choice in choices] + [b"data: [DONE]\n"]

        body = {
            "model": "moonshotai/kimi-k3.1-pro",
            "instructions": "Use the workspace.",
            "input": [{"type": "message", "role": "user", "content": [{"type": "input_text", "text": "Read the file."}]}],
            "tools": [{"type": "namespace", "name": "functions", "tools": [
                {"type": "function", "name": "read_file", "parameters": {"type": "object"}},
            ]}],
        }
        name = nvidia_chat.tool_name("read_file", "functions")
        with patch.object(nvidia_chat.http.client, "HTTPSConnection") as connection, nvidia_chat.adapter("nvidia-key") as (url, token):
            upstream = connection.return_value
            response = upstream.getresponse.return_value
            response.status = 200
            response.__enter__.return_value = response
            response.__iter__.return_value = iter(stream(
                {"delta": {"reasoning_content": "Read first."}},
                {"delta": {"tool_calls": [{"index": 0, "id": "call_1", "function": {
                    "name": name, "arguments": '{"path":',
                }}]}},
                {"delta": {"tool_calls": [{"index": 0, "function": {"arguments": '"note.txt"}'}}]}, "finish_reason": "tool_calls"},
            ))
            with self.assertRaises(urllib.error.HTTPError) as denied:
                post(url, "nvidia-key", body)
            self.assertEqual(denied.exception.code, 401)
            denied.exception.close()
            events = post(url, token, body)
            connection.assert_called_once_with(nvidia_chat.HOST, timeout=120)
            self.assertEqual(upstream.request.call_args.args, ("POST", "/v1/chat/completions"))
            self.assertEqual(upstream.request.call_args.kwargs["headers"]["Authorization"], "Bearer nvidia-key")
            sent = json.loads(upstream.request.call_args.kwargs["body"])
            self.assertEqual(sent["messages"], [
                {"role": "system", "content": "Use the workspace."},
                {"role": "user", "content": "Read the file."},
            ])
            self.assertEqual(sent["tools"][0]["function"]["name"], name)
            item = next(event["item"] for event in events if event["type"] == "response.output_item.done")
            self.assertEqual((item["name"], item["namespace"], item["call_id"]), ("read_file", "functions", "call_1"))
            self.assertEqual(json.loads(item["arguments"]), {"path": "note.txt"})
            self.assertNotIn("Read first.", json.dumps(events))

            body["input"] += [item, {"type": "function_call_output", "call_id": "call_1", "output": "file contents"}]
            response.__iter__.return_value = iter(stream({"delta": {"content": "Done"}, "finish_reason": "stop"}))
            events = post(url, token, body)
            self.assertEqual(next(event["delta"] for event in events if event["type"] == "response.output_text.delta"), "Done")
            self.assertEqual(events[-1]["type"], "response.completed")
            sent = json.loads(upstream.request.call_args.kwargs["body"])
            self.assertEqual(sent["messages"][-2]["reasoning_content"], "Read first.")
            self.assertEqual(sent["messages"][-2]["tool_calls"][0]["function"]["name"], name)
            self.assertEqual(sent["messages"][-1], {"role": "tool", "tool_call_id": "call_1", "content": "file contents"})
