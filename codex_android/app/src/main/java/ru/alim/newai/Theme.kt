package ru.alim.newai

import android.content.res.AssetManager
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.ExperimentalTextApi
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/** Палитра «Тени»: те же цвета и формы, чтобы Codex-режим выглядел один в один. */
class Pal(
    val id: String, val title: String, val dark: Boolean,
    val bg: Color, val card: Color, val line: Color, val ink: Color, val muted: Color,
    val accent: Color, val onAccent: Color, val violet: Color, val amber: Color, val danger: Color,
    val inBubble: Color, val outBubble: Color, val outInk: Color, val outMeta: Color, val meta: Color,
    val square: Boolean = false,
)

object Th {
    val all = listOf(
        Pal("sky", "Небо", false,
            bg = Color(0xFFF2F5F9), card = Color(0xFFFFFFFF), line = Color(0xFFDCE3EC), ink = Color(0xFF131C28), muted = Color(0xFF5B6878),
            accent = Color(0xFF2F6FD6), onAccent = Color.White, violet = Color(0xFF6D5BD0), amber = Color(0xFFB45309), danger = Color(0xFFC62828),
            inBubble = Color.White, outBubble = Color(0xFFCFE3FF), outInk = Color(0xFF131C28), outMeta = Color(0xFF41618E), meta = Color(0xFF677486)),
    )

    private var base by mutableStateOf(all.first { it.id == "sky" })
    val c: Pal get() = base

    fun load() {
        base = all.first()
    }

    fun set(id: String) {
        Prefs.theme = id
        load()
    }
}

object Fonts {
    var body: FontFamily = FontFamily.SansSerif; private set
    var display: FontFamily = FontFamily.SansSerif; private set

    @OptIn(ExperimentalTextApi::class)
    fun load(am: AssetManager) {
        val have = runCatching { am.list("fonts")?.toSet() }.getOrNull() ?: emptySet()
        runCatching {
            if ("manrope.ttf" in have) body = FontFamily(
                Font("fonts/manrope.ttf", am, FontWeight.Normal),
                Font("fonts/manrope.ttf", am, FontWeight.Medium),
                Font("fonts/manrope.ttf", am, FontWeight.SemiBold),
                Font("fonts/manrope.ttf", am, FontWeight.Bold),
            )
        }
        runCatching {
            if ("unbounded.ttf" in have) display = FontFamily(Font("fonts/unbounded.ttf", am, FontWeight.SemiBold))
        }
    }
}

fun body(size: Int, weight: FontWeight = FontWeight.Normal, color: Color = Ink) =
    TextStyle(fontFamily = Fonts.body, fontSize = size.sp, fontWeight = weight, color = color)

@Composable
fun VibeTheme(content: @Composable () -> Unit) {
    val p = Th.c
    val scheme = if (p.dark) darkColorScheme(
        primary = p.accent, onPrimary = p.onAccent, background = p.bg, onBackground = p.ink,
        surface = p.card, onSurface = p.ink, outline = p.line, error = p.danger,
    ) else lightColorScheme(
        primary = p.accent, onPrimary = p.onAccent, background = p.bg, onBackground = p.ink,
        surface = p.card, onSurface = p.ink, outline = p.line, error = p.danger,
    )
    MaterialTheme(colorScheme = scheme, content = content)
}

val Bg: Color get() = Th.c.bg
val Card: Color get() = Th.c.card
val Line: Color get() = Th.c.line
val Ink: Color get() = Th.c.ink
val Muted: Color get() = Th.c.muted
val Teal: Color get() = Th.c.accent
val Violet: Color get() = Th.c.violet
val Amber: Color get() = Th.c.amber
val Danger: Color get() = Th.c.danger
val OnAccent: Color get() = Th.c.onAccent
val AccentSoft: Color get() = Teal.copy(alpha = if (Th.c.dark) 0.18f else 0.12f)
val Track: Color get() = if (Th.c.dark) Color(0xFF1B2129) else Color(0xFFE6EBE9)

val circ: androidx.compose.ui.graphics.Shape get() = if (Th.c.square) androidx.compose.ui.graphics.RectangleShape else androidx.compose.foundation.shape.CircleShape
fun shp(all: androidx.compose.ui.unit.Dp): androidx.compose.ui.graphics.Shape =
    if (Th.c.square) androidx.compose.ui.graphics.RectangleShape else androidx.compose.foundation.shape.RoundedCornerShape(all)
fun shp(topStart: androidx.compose.ui.unit.Dp = 0.dp, topEnd: androidx.compose.ui.unit.Dp = 0.dp,
        bottomEnd: androidx.compose.ui.unit.Dp = 0.dp, bottomStart: androidx.compose.ui.unit.Dp = 0.dp): androidx.compose.ui.graphics.Shape =
    if (Th.c.square) androidx.compose.ui.graphics.RectangleShape else androidx.compose.foundation.shape.RoundedCornerShape(topStart, topEnd, bottomEnd, bottomStart)
