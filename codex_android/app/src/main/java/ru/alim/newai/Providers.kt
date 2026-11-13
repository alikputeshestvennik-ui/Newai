package ru.alim.newai

import android.content.Context
import android.content.SharedPreferences
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

data class Provider(
    val id: String,
    val name: String,
    val kind: String,
    val baseUrl: String,
    val builtIn: Boolean = false,
    val models: List<String> = emptyList(),
    val note: String = "",
) {
    val prefix: String
        get() = when (kind) {
            Providers.CHATGPT -> "chatgpt:"
            Providers.DEEPSEEK -> "deepseek:"
            Providers.ANY -> "any:"
            else -> "compatible:"
        }

    fun runtimeModel(model: String): String = prefix + model
}

/** Провайдеры и их модели. Список моделей всегда загружается у самого API. */
object Providers {
    const val CHATGPT = "chatgpt"
    const val DEEPSEEK = "deepseek"
    const val ANY = "any"
    const val CUSTOM = "custom"

    val list = mutableStateListOf<Provider>()
    val refreshing = mutableStateMapOf<String, Boolean>()
    private lateinit var prefs: SharedPreferences
    private val http = OkHttpClient.Builder().connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS).callTimeout(40, TimeUnit.SECONDS).build()

    fun init(ctx: Context) {
        if (::prefs.isInitialized) return
        val key = MasterKey.Builder(ctx.applicationContext).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build()
        prefs = EncryptedSharedPreferences.create(ctx.applicationContext, "vibe_providers", key,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM)
        reload()
    }

    private fun reload() {
        list.clear()
        list += Provider("codex", "GPT", CHATGPT, "https://api.openai.com/v1", builtIn = true, models = cached("codex"))
        list += Provider("deepseek", "DeepSeek", DEEPSEEK, "https://api.deepseek.com", builtIn = true, models = cached("deepseek"))
        list += Provider("anymodel", "AnyModel", ANY, "https://anymodel.org/v1", builtIn = true, models = cached("anymodel"))
        runCatching {
            val array = JSONArray(prefs.getString("custom", "[]"))
            for (i in 0 until array.length()) {
                val item = array.getJSONObject(i)
                val id = item.optString("id")
                if (id.isBlank()) continue
                list += Provider(id, item.optString("name", "Провайдер"), CUSTOM,
                    item.optString("base", ""), builtIn = false, models = cached(id))
            }
        }
    }

    fun find(id: String): Provider? = list.firstOrNull { it.id == id }

    fun models(providerId: String): List<String> = find(providerId)?.models.orEmpty()

    fun choices(providerId: String): List<String> {
        val provider = find(providerId) ?: return emptyList()
        return provider.models.map { provider.runtimeModel(it) }
    }

    fun modelName(model: String): String = model.substringAfter(':', model)

    /** Имя модели без префикса провайдера: провайдер уже виден в соседнем селекторе. */
    fun label(providerId: String, model: String): String = modelName(model)

    fun firstRuntimeModel(providerId: String): String = choices(providerId).firstOrNull().orEmpty()

    fun defaultProvider(ctx: Context): String = when {
        ChatGptAccount.connected && models("codex").isNotEmpty() -> "codex"
        key(ctx, "deepseek").isNotBlank() -> "deepseek"
        key(ctx, "anymodel").isNotBlank() -> "anymodel"
        else -> list.firstOrNull { !it.builtIn }?.id ?: "codex"
    }

    fun key(ctx: Context, providerId: String): String {
        val provider = find(providerId) ?: return ""
        val saved = if (provider.builtIn) CodexGateway.providerToken(ctx, providerId)
        else prefs.getString("key_$providerId", "").orEmpty()
        if (saved.isNotBlank()) return saved
        return when (providerId) {
            DEEPSEEK -> BuildConfig.DEEPSEEK_API.trim()
            ANY -> BuildConfig.ANYMODEL_KEY.trim()
            else -> ""
        }
    }

    fun saveKey(ctx: Context, providerId: String, value: String) {
        val provider = find(providerId) ?: error("Провайдер не найден")
        require(value.isNotBlank()) { "Введи API-ключ" }
        if (provider.builtIn) CodexGateway.saveProviderToken(ctx, providerId, value)
        else prefs.edit().putString("key_$providerId", value.trim()).apply()
    }

    fun addCustom(ctx: Context, name: String, baseUrl: String, key: String): Provider {
        val cleanName = name.trim()
        require(cleanName.length in 1..40) { "Укажи название провайдера" }
        val url = cleanUrl(baseUrl)
        require(key.isNotBlank()) { "Введи API-ключ" }
        val id = "p" + System.currentTimeMillis().toString(36)
        prefs.edit().putString("key_$id", key.trim()).apply()
        val provider = Provider(id, cleanName, CUSTOM, url, builtIn = false)
        list += provider
        persistCustom()
        return provider
    }

    fun updateCustom(ctx: Context, providerId: String, name: String, baseUrl: String, key: String) {
        val index = list.indexOfFirst { it.id == providerId && !it.builtIn }
        require(index >= 0) { "Провайдер не найден" }
        val cleanName = name.trim()
        require(cleanName.length in 1..40) { "Укажи название провайдера" }
        val url = cleanUrl(baseUrl)
        if (key.isNotBlank()) prefs.edit().putString("key_$providerId", key.trim()).apply()
        val old = list[index]
        list[index] = old.copy(name = cleanName, baseUrl = url, note = "")
        persistCustom()
    }

    fun deleteCustom(providerId: String) {
        list.removeAll { it.id == providerId && !it.builtIn }
        prefs.edit().remove("key_$providerId").remove("models_$providerId").apply()
        persistCustom()
    }

    /** Загружает модели провайдера и сохраняет их на устройстве. */
    suspend fun refresh(ctx: Context, providerId: String): Result<List<String>> {
        val provider = find(providerId) ?: return Result.failure(IllegalStateException("Провайдер не найден"))
        refreshing[providerId] = true
        return try {
            val models = withContext(Dispatchers.IO) {
                when (provider.kind) {
                    CHATGPT -> {
                        check(ChatGptAccount.connected) { "Сначала войди в ChatGPT" }
                        ChatGptAccount.refreshModels()
                        ChatGptAccount.models.map { it.removePrefix("chatgpt:") }
                    }
                    else -> {
                        val key = key(ctx, providerId)
                        check(key.isNotBlank()) { "Сначала сохрани API-ключ" }
                        fetchModels(provider.baseUrl, key)
                    }
                }
            }.distinct().sortedBy { it.lowercase() }
            check(models.isNotEmpty()) { "API не вернул ни одной модели" }
            val index = list.indexOfFirst { it.id == providerId }
            if (index >= 0) list[index] = list[index].copy(models = models, note = "")
            if (provider.builtIn) prefs.edit().putString("models_$providerId", models.joinToString("\n")).apply()
            else prefs.edit().putString("models_$providerId", models.joinToString("\n")).apply()
            Result.success(models)
        } catch (e: Exception) {
            val message = e.message.orEmpty().ifBlank { "Не удалось загрузить модели" }
            val index = list.indexOfFirst { it.id == providerId }
            if (index >= 0) list[index] = list[index].copy(note = message)
            Result.failure(IllegalStateException(message, e))
        } finally {
            refreshing[providerId] = false
        }
    }

    private fun fetchModels(baseUrl: String, key: String): List<String> {
        val url = cleanUrl(baseUrl).trimEnd('/') + "/models"
        val request = Request.Builder().url(url)
            .header("Authorization", "Bearer ${key.trim()}")
            .header("Accept", "application/json")
            .get().build()
        return http.newCall(request).execute().use { response ->
            val body = response.body?.string().orEmpty()
            if (!response.isSuccessful) {
                val hint = when (response.code) {
                    401, 403 -> "ключ не принят"
                    404 -> "проверь адрес, обычно нужен суффикс /v1"
                    429 -> "слишком много запросов"
                    else -> "HTTP ${response.code}"
                }
                error("Не удалось получить модели: $hint")
            }
            val ids = ArrayList<String>()
            val root = runCatching { JSONObject(body) }.getOrNull()
            val array = root?.optJSONArray("data") ?: root?.optJSONArray("models")
                ?: runCatching { JSONArray(body) }.getOrNull()
            if (array != null) {
                for (i in 0 until array.length()) {
                    val item = array.opt(i)
                    val id = when (item) {
                        is JSONObject -> item.optString("id").ifBlank { item.optString("name") }
                        is String -> item
                        else -> ""
                    }
                    if (id.isNotBlank()) ids += id.trim()
                }
            }
            ids.distinct()
        }
    }

    private fun cached(providerId: String): List<String> =
        prefs.getString("models_$providerId", "").orEmpty().lines().filter { it.isNotBlank() }

    private fun persistCustom() {
        val array = JSONArray()
        list.filter { !it.builtIn }.forEach { p ->
            array.put(JSONObject().put("id", p.id).put("name", p.name).put("base", p.baseUrl))
        }
        prefs.edit().putString("custom", array.toString()).apply()
    }

    private fun cleanUrl(value: String): String {
        val parsed = value.trim().toHttpUrlOrNull() ?: error("Укажи HTTPS-адрес API")
        require(parsed.isHttps) { "Нужен HTTPS-адрес API" }
        require(parsed.query == null && parsed.fragment == null) { "Адрес не должен содержать параметры" }
        return parsed.toString().trimEnd('/')
    }
}
