package ru.alim.newai

import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/** Responses API for an explicitly authorized ChatGPT-plan access token. */
internal object ChatGptResponses {
    private val http = OkHttpClient.Builder().connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(200, TimeUnit.SECONDS).callTimeout(300, TimeUnit.SECONDS).build()
    private val json = "application/json; charset=utf-8".toMediaType()

    data class Result(val text: String, val inputTokens: Int, val outputTokens: Int)
    data class Model(val id: String, val title: String)

    fun models(token: String): List<Model> {
        require(token.isNotBlank()) { "Нет разрешения на использование подписки ChatGPT" }
        val req = Request.Builder().url("https://api.openai.com/v1/models")
            .header("Authorization", "Bearer $token").build()
        http.newCall(req).execute().use { response ->
            if (!response.isSuccessful) error("ChatGPT: список моделей недоступен (${response.code})")
            val array = JSONObject(response.body?.string() ?: "{}").optJSONArray("models") ?: JSONArray()
            return (0 until array.length()).mapNotNull { i ->
                val m = array.optJSONObject(i) ?: return@mapNotNull null
                val id = m.optString("slug")
                if (m.optString("visibility") != "list" || id.isBlank()) null
                else Model(id, m.optString("display_name", id))
            }
        }
    }

}
