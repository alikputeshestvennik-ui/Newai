package ru.alim.newai

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

internal sealed interface MarkdownBlock {
    data class Paragraph(val text: String, val heading: Int = 0) : MarkdownBlock
    data class ListItem(val marker: String, val text: String) : MarkdownBlock
    data class Code(val text: String) : MarkdownBlock
    data class Quote(val text: String) : MarkdownBlock
    data object Divider : MarkdownBlock
}

private val orderedListItem = Regex("""^\s*(\d+[.)])\s+(.+)$""")
private val divider = Regex("""^\s{0,3}([-*_])(?:\s*\1){2,}\s*$""")

internal fun parseMarkdown(source: String): List<MarkdownBlock> {
    val lines = source.replace("\r\n", "\n").replace('\r', '\n').lines()
    val blocks = mutableListOf<MarkdownBlock>()
    var index = 0
    while (index < lines.size) {
        val raw = lines[index]
        val trimmed = raw.trim()
        when {
            trimmed.isEmpty() -> index++
            trimmed.startsWith("```") -> {
                val code = mutableListOf<String>()
                index++
                while (index < lines.size && !lines[index].trim().startsWith("```")) {
                    code += lines[index]
                    index++
                }
                if (index < lines.size) index++
                blocks += MarkdownBlock.Code(code.joinToString("\n"))
            }
            divider.matches(raw) -> {
                blocks += MarkdownBlock.Divider
                index++
            }
            trimmed.startsWith("#") -> {
                val level = trimmed.takeWhile { it == '#' }.length.coerceIn(1, 6)
                val text = trimmed.drop(level).trim()
                if (text.isNotEmpty()) blocks += MarkdownBlock.Paragraph(text, level)
                index++
            }
            trimmed.startsWith("- ") || trimmed.startsWith("* ") || trimmed.startsWith("+ ") -> {
                blocks += MarkdownBlock.ListItem("•", trimmed.drop(2).trim())
                index++
            }
            orderedListItem.matches(raw) -> {
                val match = orderedListItem.matchEntire(raw)!!
                blocks += MarkdownBlock.ListItem(match.groupValues[1], match.groupValues[2].trim())
                index++
            }
            trimmed.startsWith(">") -> {
                blocks += MarkdownBlock.Quote(trimmed.removePrefix(">").trim())
                index++
            }
            else -> {
                blocks += MarkdownBlock.Paragraph(trimmed)
                index++
            }
        }
    }
    return blocks
}

internal fun markdownInline(text: String, codeBackground: Color): AnnotatedString = buildAnnotatedString {
    appendInline(this, text, codeBackground)
}

private fun appendInline(out: AnnotatedString.Builder, text: String, codeBackground: Color) {
    var index = 0
    while (index < text.length) {
        if (text[index] == '\\' && index + 1 < text.length) {
            out.append(text[index + 1])
            index += 2
            continue
        }

        val boldMarker = when {
            text.startsWith("**", index) -> "**"
            text.startsWith("__", index) -> "__"
            else -> null
        }
        if (boldMarker != null) {
            val end = text.indexOf(boldMarker, index + 2)
            if (end > index + 2) {
                out.withStyle(SpanStyle(fontWeight = FontWeight.SemiBold)) {
                    appendInline(out, text.substring(index + 2, end), codeBackground)
                }
                index = end + 2
                continue
            }
        }

        if (text[index] == '`') {
            val end = text.indexOf('`', index + 1)
            if (end > index + 1) {
                out.withStyle(SpanStyle(fontFamily = FontFamily.Monospace, background = codeBackground)) {
                    append(text.substring(index + 1, end))
                }
                index = end + 1
                continue
            }
        }

        val image = text[index] == '!' && index + 1 < text.length && text[index + 1] == '['
        if (text[index] == '[' || image) {
            val labelStart = if (image) index + 2 else index + 1
            val labelEnd = text.indexOf("](", labelStart)
            val urlEnd = if (labelEnd >= 0) text.indexOf(')', labelEnd + 2) else -1
            if (labelEnd >= 0 && urlEnd > labelEnd + 2) {
                out.append(text.substring(labelStart, labelEnd))
                index = urlEnd + 1
                continue
            }
        }

        out.append(text[index])
        index++
    }
}

@Composable
internal fun MarkdownText(text: String, color: Color, modifier: Modifier = Modifier) {
    val blocks = remember(text) { parseMarkdown(text) }
    val codeBackground = Track.copy(alpha = if (Th.c.dark) 0.7f else 0.9f)
    Column(modifier, verticalArrangement = Arrangement.spacedBy(5.dp)) {
        blocks.forEach { block ->
            when (block) {
                is MarkdownBlock.Paragraph -> {
                    val size = when (block.heading) {
                        1 -> 21
                        2 -> 19
                        3 -> 17
                        4, 5, 6 -> 16
                        else -> 16
                    }
                    val weight = if (block.heading > 0) FontWeight.Bold else FontWeight.Normal
                    Text(markdownInline(block.text, codeBackground), style = body(size, weight, color),
                        lineHeight = (size + 7).sp)
                }
                is MarkdownBlock.ListItem -> Row(Modifier.fillMaxWidth()) {
                    Text(block.marker, style = body(16, FontWeight.SemiBold, color), modifier = Modifier.width(20.dp))
                    Text(markdownInline(block.text, codeBackground), style = body(16, color = color),
                        lineHeight = 23.sp, modifier = Modifier.weight(1f))
                }
                is MarkdownBlock.Code -> Box(Modifier.fillMaxWidth().clip(shp(10.dp)).background(codeBackground)
                    .horizontalScroll(rememberScrollState()).padding(horizontal = 10.dp, vertical = 8.dp)) {
                    Text(block.text.ifBlank { " " }, style = body(12, color = color).copy(
                        fontFamily = FontFamily.Monospace, lineHeight = 18.sp))
                }
                is MarkdownBlock.Quote -> Row(Modifier.fillMaxWidth()) {
                    Box(Modifier.width(3.dp).height(20.dp).clip(shp(2.dp)).background(Teal))
                    Spacer(Modifier.width(8.dp))
                    Text(markdownInline(block.text, codeBackground), style = body(15, color = color),
                        lineHeight = 22.sp, modifier = Modifier.weight(1f))
                }
                MarkdownBlock.Divider -> Box(Modifier.fillMaxWidth().padding(vertical = 3.dp)
                    .height(1.dp).background(Line.copy(alpha = 0.75f)))
            }
        }
    }
}
