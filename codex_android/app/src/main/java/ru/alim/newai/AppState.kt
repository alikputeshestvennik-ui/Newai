package ru.alim.newai

import android.content.Context
import android.net.Uri
import androidx.compose.runtime.*
import org.json.JSONArray
import org.json.JSONObject

object Docs { data class FileRef(val name: String, val uri: Uri, val mime: String) }

object ModelRouting {
    fun isChatGpt(model: String) = model.startsWith("chatgpt:")
    fun isDeepSeek(model: String) = model.startsWith("deepseek:")
    fun isAny(model: String) = model.startsWith("any:") || Regex("^(cx|cc|ds|ag|kmc)/", RegexOption.IGNORE_CASE).containsMatchIn(model)
    fun codexModel(model: String): String {
        val value = model.trim()
        require(Regex("[a-zA-Z0-9._/:-]{1,160}").matches(value) &&
            (isChatGpt(value) || isDeepSeek(value) || isAny(value) || value.startsWith("compatible:")) && !value.endsWith(':')) {
            "Выбери провайдера и укажи модель в настройках"
        }
        return value
    }
}

object Prefs {
    private lateinit var storage: android.content.SharedPreferences
    fun init(ctx: Context) { storage = ctx.getSharedPreferences("settings", Context.MODE_PRIVATE) }
    var compatibleModel: String
        get() = storage.getString("compatibleModel", "").orEmpty()
        set(v) { storage.edit().putString("compatibleModel", v).apply() }
    var model: String
        get() = storage.getString("model", "").orEmpty()
        set(v) { storage.edit().putString("model", v).apply() }
}

data class Message(val role: String, val text: String, val files: List<Docs.FileRef> = emptyList())
object Conversation {
    val messages = mutableStateListOf<Message>()
    var busy by mutableStateOf(false)
    var progress by mutableStateOf("")
    var draft by mutableStateOf("")
    var taskId = "chat_" + java.util.UUID.randomUUID().toString().replace("-", "")
    private var loaded = false
    private lateinit var storage: android.content.SharedPreferences
    fun init(ctx: Context) {
        if (loaded) return
        storage = ctx.getSharedPreferences("conversation", Context.MODE_PRIVATE)
        taskId = storage.getString("task_id", taskId).orEmpty()
        draft = storage.getString("draft", "").orEmpty()
        runCatching {
            val list = JSONArray(storage.getString("messages", "[]"))
            for (i in 0 until list.length()) {
                val item = list.getJSONObject(i)
                val files = item.optJSONArray("files") ?: JSONArray()
                messages += Message(item.getString("role"), item.getString("text"), (0 until files.length()).map { n ->
                    val file = files.getJSONObject(n)
                    Docs.FileRef(file.getString("name"), Uri.parse(file.getString("uri")), file.getString("mime"))
                })
            }
        }
        loaded = true
    }
    fun save() {
        val list = JSONArray()
        messages.forEach { m ->
            val files = JSONArray()
            m.files.forEach { files.put(JSONObject().put("name", it.name).put("uri", it.uri.toString()).put("mime", it.mime)) }
            list.put(JSONObject().put("role", m.role).put("text", m.text).put("files", files))
        }
        storage.edit().putString("task_id", taskId).putString("messages", list.toString()).putString("draft", draft).apply()
    }
    fun newChat() {
        if (busy) return
        messages.clear(); draft = ""; progress = ""
        taskId = "chat_" + java.util.UUID.randomUUID().toString().replace("-", "")
        save()
    }
    fun prompt(text: String): String {
        val history = messages.takeLast(12).joinToString("\n\n") { "${it.role}: ${it.text.takeLast(1500)}" }.takeLast(10000)
        return "Текущая задача:\n$text\n\nКонтекст переписки:\n$history"
    }
}
