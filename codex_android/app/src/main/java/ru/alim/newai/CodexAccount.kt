package ru.alim.newai

import android.content.Context
import android.net.Uri
import android.os.SystemClock
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runInterruptible
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.IOException
import android.util.Log
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.TimeUnit

internal object CodexAccount {
    data class DeviceCode(val value: String, val url: String)
    data class Account(val email: String)

    var account by mutableStateOf<Account?>(null)
        private set

    suspend fun refresh(ctx: Context) {
        account = rpc(ctx) { readAccount() }
    }

    suspend fun signIn(ctx: Context, show: suspend (DeviceCode) -> Unit) {
        account = rpc(ctx) {
            val login = request("account/login/start", JSONObject().put("type", "chatgptDeviceCode"))
            val loginId = login.getString("loginId")
            val url = Uri.parse(login.getString("verificationUrl"))
            require(url.scheme == "https" && url.host == "auth.openai.com") { "Неверный адрес входа OpenAI" }
            show(DeviceCode(login.getString("userCode"), url.toString()))
            val completed = receive(15 * 60_000L) { message ->
                message.optString("method") == "account/login/completed" &&
                    message.optJSONObject("params")?.optString("loginId") == loginId
            }.getJSONObject("params")
            check(completed.optBoolean("success")) {
                completed.optString("error", "Не удалось подтвердить вход в ChatGPT")
            }
            readAccount() ?: error("Codex не сохранил сессию ChatGPT")
        }
    }

    suspend fun signOut(ctx: Context) {
        rpc(ctx) { request("account/logout") }
        account = null
    }

    suspend fun models(ctx: Context): List<String> = rpc(ctx) {
        check(readAccount() != null) { "Сначала войди в ChatGPT" }
        val models = mutableListOf("auto")
        var cursor = ""
        do {
            val params = JSONObject().put("limit", 100)
            if (cursor.isNotEmpty()) params.put("cursor", cursor)
            val page = request("model/list", params)
            val data = page.getJSONArray("data")
            for (index in 0 until data.length()) {
                val item = data.getJSONObject(index)
                if (!item.optBoolean("hidden")) item.optString("model").takeIf { it.isNotBlank() }?.let(models::add)
            }
            val next = page.optString("nextCursor", "")
            if (next == cursor) break
            cursor = if (page.isNull("nextCursor")) "" else next
        } while (cursor.isNotEmpty())
        models.distinct()
    }

    suspend fun limits(ctx: Context): ChatGptUsage.Limits = rpc(ctx) {
        ChatGptUsage.parseCodex(request("account/rateLimits/read"))
    }

    private suspend fun <Result> rpc(ctx: Context, action: suspend Rpc.() -> Result): Result =
        withContext(Dispatchers.IO) {
            runInterruptible { EmbeddedRuntime.awaitServer(ctx) }
            val process = EmbeddedRuntime.codexProcess(ctx, "app-server", "--stdio")
            try {
                val rpc = Rpc(process)
                rpc.request("initialize", JSONObject().put("clientInfo", JSONObject()
                    .put("name", "vibecoder").put("version", "1.0.0")))
                rpc.send(JSONObject().put("method", "initialized"))
                rpc.action()
            } finally {
                process.destroy()
            }
        }

    private class Rpc(process: Process) {
        private val input = process.outputStream.bufferedWriter(Charsets.UTF_8)
        private val messages = LinkedBlockingQueue<JSONObject>()
        private val closed = JSONObject()
        private var nextId = 0

        init {
            Thread({
                try {
                    process.inputStream.bufferedReader(Charsets.UTF_8).useLines { lines ->
                        lines.forEach { line -> runCatching { JSONObject(line) }.getOrNull()?.let(messages::offer) }
                    }
                } catch (e: IOException) {
                    // The RPC owner destroys the subprocess in finally. Android may
                    // interrupt a blocking read when the process pipe is closed.
                    // This is normal shutdown, not an uncaught application crash.
                    Log.d("CodexAccount", "RPC input stream closed: ${e.message}")
                } catch (e: Exception) {
                    Log.e("CodexAccount", "RPC reader stopped unexpectedly", e)
                } finally {
                    messages.offer(closed)
                }
            }, "codex-account-rpc").apply { isDaemon = true; start() }
        }

        fun send(message: JSONObject) {
            input.write(message.put("jsonrpc", "2.0").toString())
            input.newLine()
            input.flush()
        }

        suspend fun request(method: String, params: JSONObject? = null): JSONObject {
            val id = ++nextId
            send(JSONObject().put("id", id).put("method", method).apply { if (params != null) put("params", params) })
            val response = receive(45_000L) { it.optInt("id", -1) == id && (it.has("result") || it.has("error")) }
            response.optJSONObject("error")?.let { error(it.optString("message", "Ошибка Codex")) }
            return response.optJSONObject("result") ?: JSONObject()
        }

        suspend fun receive(timeout: Long, matches: (JSONObject) -> Boolean): JSONObject {
            val deadline = SystemClock.elapsedRealtime() + timeout
            while (true) {
                val remaining = (deadline - SystemClock.elapsedRealtime()).coerceAtLeast(0)
                val message = runInterruptible { messages.poll(remaining, TimeUnit.MILLISECONDS) }
                    ?: error("Codex не ответил вовремя")
                check(message !== closed) { "Процесс Codex завершился до ответа" }
                if (matches(message)) return message
                check(remaining > 0) { "Codex не ответил вовремя" }
            }
        }

        suspend fun readAccount(): Account? {
            val value = request("account/read", JSONObject().put("refreshToken", false)).optJSONObject("account")
            return value?.takeIf { it.optString("type") == "chatgpt" }?.let { Account(it.optString("email")) }
        }
    }
}
