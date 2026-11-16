package ru.alim.newai

import android.content.Context
import android.net.Uri
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshots.SnapshotStateList
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

object Docs {
    data class FileRef(val name: String, val uri: Uri, val mime: String, val path: String = "")

    fun toJson(files: List<FileRef>): JSONArray = JSONArray().apply {
        files.forEach { file ->
            put(JSONObject().put("name", file.name).put("uri", file.uri.toString())
                .put("mime", file.mime).put("path", file.path))
        }
    }

    fun fromJson(array: JSONArray?): List<FileRef> {
        if (array == null) return emptyList()
        return (0 until array.length()).mapNotNull { index ->
            val file = array.optJSONObject(index) ?: return@mapNotNull null
            FileRef(
                name = file.optString("name", "file"),
                uri = Uri.parse(file.optString("uri", "")),
                mime = file.optString("mime", "application/octet-stream"),
                path = file.optString("path", ""),
            )
        }
    }
}

private val ignoredArtifactDirs = setOf(
    ".git", "__pycache__", ".gradle", ".kotlin", ".idea", ".vscode", "node_modules", "build",
)
private val ignoredArtifactSuffixes = setOf(
    "pyc", "pyo", "class", "dex", "o", "obj", "tmp", "temp", "log",
)
private val ignoredArtifactNames = setOf(".ds_store", "thumbs.db", "desktop.ini")

internal fun isGeneratedArtifact(name: String, path: String): Boolean {
    val parts = path.split('/', '\\').dropLast(1).map { it.lowercase() }
    if (parts.any { it in ignoredArtifactDirs }) return true
    if (name.lowercase() in ignoredArtifactNames) return true
    return name.substringAfterLast('.', "").lowercase() in ignoredArtifactSuffixes
}

internal fun Docs.FileRef.isGeneratedArtifact(): Boolean = isGeneratedArtifact(name, path)

object ModelRouting {
    fun isChatGpt(model: String) = model.startsWith("chatgpt:")
    fun isDeepSeek(model: String) = model.startsWith("deepseek:")
    fun isAny(model: String) = model.startsWith("any:") || Regex("^(cx|cc|ds|ag|kmc)/", RegexOption.IGNORE_CASE).containsMatchIn(model)
    fun codexModel(model: String): String {
        val value = model.trim()
        require(value.isNotEmpty() && Regex("[^\\s]{1,200}").matches(value) &&
            (isChatGpt(value) || isDeepSeek(value) || isAny(value) || value.startsWith("compatible:"))) {
            "Выбери провайдера и модель в настройках"
        }
        require(!value.endsWith(':')) { "Выбери конкретную модель" }
        return value
    }
}

object Prefs {
    private lateinit var storage: android.content.SharedPreferences
    fun init(ctx: Context) { storage = ctx.getSharedPreferences("settings", Context.MODE_PRIVATE) }
    var theme: String
        get() = storage.getString("theme", "sky").orEmpty()
        set(v) { storage.edit().putString("theme", v).apply() }
    var followUp: String
        get() = storage.getString("follow_up", "queue").orEmpty()
        set(v) { storage.edit().putString("follow_up", v).apply() }
    var lastSession: String
        get() = storage.getString("last_session", "").orEmpty()
        set(v) { storage.edit().putString("last_session", v).apply() }
    var floatingOverlay: Boolean
        get() = storage.getBoolean("floating_overlay", false)
        set(v) { storage.edit().putBoolean("floating_overlay", v).apply() }
    var overlayTask: String
        get() = storage.getString("overlay_task", "").orEmpty()
        set(v) { storage.edit().putString("overlay_task", v).apply() }
    var overlaySession: String
        get() = storage.getString("overlay_session", "").orEmpty()
        set(v) { storage.edit().putString("overlay_session", v).apply() }
}

/** Навигация и действия, доступные из Compose и из фонового сервиса. */
object AppNav {
    lateinit var ctx: Context
    @Volatile var foreground = true
    var settingsOpen by mutableStateOf(false)
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    fun init(ctx: Context) { this.ctx = ctx.applicationContext }
    fun stop(session: CodexSession) {
        session.pending = ""
        scope.launch { runCatching { CodexGateway.cancel(ctx, session.taskId) } }
    }
}

data class TokenUsage(val input: Long?, val output: Long?, val cached: Long?) {
    fun toJson() = JSONObject().put("input", input).put("output", output).put("cached", cached)
    companion object {
        fun fromJson(json: JSONObject?): TokenUsage? {
            if (json == null) return null
            fun value(key: String): Long? = if (json.has(key) && !json.isNull(key)) json.optLong(key) else null
            return TokenUsage(value("input"), value("output"), value("cached"))
        }
    }
}

data class Message(
    val id: String = UUID.randomUUID().toString(),
    val role: String,
    val text: String,
    val files: List<Docs.FileRef> = emptyList(),
    val ts: Long = System.currentTimeMillis(),
    val durationMs: Long? = null,
    val usage: TokenUsage? = null,
) {
    val mine: Boolean get() = role == "me"
    val system: Boolean get() = role == "system"
}

class CodexSession(
    val id: String,
    name: String,
    taskId: String,
    val created: Long = System.currentTimeMillis(),
) {
    var name by mutableStateOf(name)
    var taskId by mutableStateOf(taskId)
    val messages: SnapshotStateList<Message> = mutableStateListOf()
    val attachments = mutableStateListOf<Docs.FileRef>()
    var pendingFiles: List<Docs.FileRef> = emptyList()
    var draft by mutableStateOf("")
    var providerId by mutableStateOf("")
    var model by mutableStateOf("")
    var busy by mutableStateOf(false)
    var progress by mutableStateOf("")
    var pending by mutableStateOf("")
    var reasoningEffort by mutableStateOf("medium")
}

/** Несколько независимых диалогов; у каждого свой провайдер, модель и локальная задача. */
object Sessions {
    val list = mutableStateListOf<CodexSession>()
    var currentId by mutableStateOf("")
    private lateinit var storage: android.content.SharedPreferences
    private var loaded = false

    val current: CodexSession
        get() = list.firstOrNull { it.id == currentId } ?: list.first()

    fun init(ctx: Context) {
        if (loaded) return
        storage = ctx.getSharedPreferences("sessions", Context.MODE_PRIVATE)
        runCatching {
            val array = JSONArray(storage.getString("items", "[]"))
            for (i in 0 until array.length()) {
                val item = array.getJSONObject(i)
                val session = CodexSession(
                    id = item.getString("id"),
                    name = item.optString("name", "Вайбкодер"),
                    taskId = item.optString("task_id", newTaskId()),
                    created = item.optLong("created", System.currentTimeMillis()),
                )
                session.draft = item.optString("draft", "")
                session.attachments += Docs.fromJson(item.optJSONArray("attachments"))
                session.providerId = item.optString("provider", "")
                session.model = item.optString("model", "")
                session.reasoningEffort = item.optString("effort", "medium")
                val messages = item.optJSONArray("messages") ?: JSONArray()
                for (n in 0 until messages.length()) {
                    val m = messages.getJSONObject(n)
                    session.messages += Message(
                        id = m.optString("id", UUID.randomUUID().toString()),
                        role = m.optString("role", "codex"),
                        text = m.optString("text", ""),
                        files = Docs.fromJson(m.optJSONArray("files")),
                        ts = m.optLong("ts", System.currentTimeMillis()),
                        usage = TokenUsage.fromJson(m.optJSONObject("usage")),
                        durationMs = if (m.has("duration_ms") && !m.isNull("duration_ms")) m.optLong("duration_ms") else null,
                    )
                }
                list += session
            }
        }
        if (list.isEmpty()) new(save = false)
        currentId = Prefs.lastSession.takeIf { id -> list.any { it.id == id } } ?: list.first().id
        loaded = true
        save()
    }

    fun find(id: String): CodexSession? = list.firstOrNull { it.id == id }
    fun sessionForTask(taskId: String): CodexSession? = list.firstOrNull { it.taskId == taskId }

    fun open(id: String) {
        if (list.none { it.id == id }) return
        currentId = id
        Prefs.lastSession = id
    }

    fun new(save: Boolean = true): CodexSession {
        val n = list.size + 1
        val session = CodexSession(
            id = "chat-" + UUID.randomUUID().toString().replace("-", "").take(12),
            name = if (n <= 1) "Вайбкодер" else "Вайбкодер $n",
            taskId = newTaskId(),
        )
        list += session
        currentId = session.id
        Prefs.lastSession = session.id
        if (save) this.save()
        return session
    }

    fun remove(id: String) {
        val session = find(id) ?: return
        if (list.size <= 1) {
            session.messages.clear()
            session.draft = ""
            session.attachments.clear()
            session.progress = ""
            session.taskId = newTaskId()
            save()
            return
        }
        list.remove(session)
        if (currentId == id) open(list.first().id)
        save()
    }

    fun save() {
        if (!::storage.isInitialized) return
        val array = JSONArray()
        list.forEach { session ->
            val messages = JSONArray()
            session.messages.forEach { m ->
                messages.put(JSONObject().put("id", m.id).put("role", m.role).put("text", m.text)
                    .put("ts", m.ts).put("duration_ms", m.durationMs).put("usage", m.usage?.toJson()).put("files", Docs.toJson(m.files)))
            }
            array.put(JSONObject().put("id", session.id).put("name", session.name).put("task_id", session.taskId)
                .put("created", session.created).put("draft", session.draft).put("provider", session.providerId)
                .put("model", session.model).put("effort", session.reasoningEffort).put("messages", messages)
                .put("attachments", Docs.toJson(session.attachments)))
        }
        storage.edit().putString("items", array.toString()).apply()
    }

    fun prompt(session: CodexSession, text: String, files: List<Docs.FileRef> = emptyList()): String {
        val history = session.messages.takeLast(12).joinToString("\n\n") { "${it.role}: ${it.text.takeLast(1500)}" }.takeLast(10000)
        val attached = files.filter { it.path.isNotBlank() }
            .joinToString("\n") { "- ${it.name}: ${it.path}" }
        val task = if (attached.isBlank()) text else buildString {
            if (text.isNotBlank()) append(text).append("\n\n")
            else append("Посмотри прикреплённые пользователем файлы.\n\n")
            append("Файлы, прикреплённые пользователем (используй эти пути для чтения):\n")
            append(attached)
        }
        return "Текущая задача:\n$task\n\nКонтекст переписки:\n$history\n\n" +
            "Показывай пользователю только полезные промежуточные статусы и результат. " +
            "Не раскрывай внутреннее рассуждение и не дублируй в тексте список изменённых файлов: " +
            "приложение само покажет их как вложения. Если для продолжения нужен выбор пользователя, " +
            "задай короткий уточняющий вопрос."
    }

    private fun newTaskId() = "vibe_" + UUID.randomUUID().toString().replace("-", "")
}
