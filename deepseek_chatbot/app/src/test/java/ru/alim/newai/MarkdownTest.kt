package ru.alim.newai

import androidx.compose.ui.graphics.Color
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class MarkdownTest {
    @Test
    fun parsesHeadingsListsAndFencedCode() {
        val blocks = parseMarkdown(
            """
            **Макеты**
            - `Тихий` — тёплый стиль
            1. Первый пункт
            ```bash
            python3 server.py
            ```
            """.trimIndent(),
        )

        assertEquals(MarkdownBlock.Paragraph("**Макеты**"), blocks[0])
        assertEquals(MarkdownBlock.ListItem("•", "`Тихий` — тёплый стиль"), blocks[1])
        assertEquals(MarkdownBlock.ListItem("1.", "Первый пункт"), blocks[2])
        assertEquals(MarkdownBlock.Code("python3 server.py"), blocks[3])
    }

    @Test
    fun stripsMarkdownMarkersAndLocalLinkTargets() {
        val value = markdownInline(
            "**Готово** · `index.html` · [Открыть](/data/user/0/app/index.html)",
            Color.Transparent,
        )

        assertEquals("Готово · index.html · Открыть", value.text)
        assertTrue(value.spanStyles.any { it.item.fontWeight != null })
        assertTrue(value.spanStyles.any { it.item.fontFamily != null })
    }
}
