package ru.alim.newai

import org.json.JSONObject

internal object ChatGptUsage {
    data class Window(val usedPercent: Int, val resetAt: Long?)
    data class Limits(val fiveHours: Window?, val week: Window?)

    fun parseCodex(response: JSONObject): Limits {
        val rate = response.optJSONObject("rateLimits") ?: error("ChatGPT не вернул данные о лимитах")
        val windows = listOfNotNull(rate.optJSONObject("primary"), rate.optJSONObject("secondary"))
        fun find(minutes: Int): Window? = windows.firstOrNull { it.optInt("windowDurationMins") == minutes }
            ?.let { window ->
                val used = window.optInt("usedPercent", -1)
                if (used in 0..100) Window(used, window.optLong("resetsAt").takeIf { it > 0 }) else null
            }
        return Limits(find(300), find(10_080)).also {
            check(it.fiveHours != null || it.week != null) { "ChatGPT не вернул лимиты на 5 часов или неделю" }
        }
    }

    fun parse(body: String): Limits {
        val rate = JSONObject(body).optJSONObject("rate_limit")
            ?: error("ChatGPT не вернул данные о лимитах")
        var fiveHours: Window? = null
        var week: Window? = null
        for (key in listOf("primary_window", "secondary_window")) {
            val item = rate.optJSONObject(key) ?: continue
            val percent = item.optDouble("used_percent", Double.NaN)
            if (!percent.isFinite() || percent < 0 || percent > 100) continue
            val reset = item.optLong("reset_at", 0).takeIf { it > 0 }
            val window = Window(kotlin.math.round(percent).toInt(), reset)
            when (item.optLong("limit_window_seconds", 0)) {
                5 * 60 * 60L -> fiveHours = window
                7 * 24 * 60 * 60L -> week = window
            }
        }
        check(fiveHours != null || week != null) { "ChatGPT не вернул лимиты на 5 часов или неделю" }
        return Limits(fiveHours, week)
    }
}
