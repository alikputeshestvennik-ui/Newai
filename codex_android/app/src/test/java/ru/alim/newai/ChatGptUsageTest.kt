package ru.alim.newai

import org.junit.Assert.*
import org.junit.Test

class ChatGptUsageTest {
    @Test fun parsesWindowsByDurationRatherThanOrder() {
        val result = ChatGptUsage.parse("""{"rate_limit":{
            "primary_window":{"used_percent":23,"limit_window_seconds":604800,"reset_at":1700000000},
            "secondary_window":{"used_percent":75,"limit_window_seconds":18000,"reset_at":1700001000}
        }}""")
        assertEquals(ChatGptUsage.Window(75, 1700001000), result.fiveHours)
        assertEquals(ChatGptUsage.Window(23, 1700000000), result.week)
    }

    @Test fun missingWindowIsNotReportedAsZero() {
        val result = ChatGptUsage.parse("""{"rate_limit":{
            "primary_window":{"used_percent":100,"limit_window_seconds":18000}
        }}""")
        assertEquals(ChatGptUsage.Window(100, null), result.fiveHours)
        assertNull(result.week)
    }

    @Test(expected = IllegalStateException::class)
    fun rejectsMissingOrUnknownWindows() {
        ChatGptUsage.parse("""{"rate_limit":{"primary_window":{"used_percent":10,"limit_window_seconds":60}}}""")
    }
}
