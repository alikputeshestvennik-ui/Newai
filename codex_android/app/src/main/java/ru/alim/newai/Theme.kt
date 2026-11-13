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
        Pal("cockpit", "Кабина", true,
            bg = Color(0xFF0B1422), card = Color(0xFF13233A), line = Color(0xFF243A55), ink = Color(0xFFEAF2FB), muted = Color(0xFF9DB2C8),
            accent = Color(0xFF6CC6EE), onAccent = Color(0xFF06121F), violet = Color(0xFF8B9CFF), amber = Color(0xFFF2C58A), danger = Color(0xFFFF9A8F),
            inBubble = Color(0xF0142740), outBubble = Color(0xFF2A5079), outInk = Color(0xFFF2F8FF), outMeta = Color(0xFFB7CDE6), meta = Color(0xFF8DA3BA)),
        Pal("mint", "Мята", false,
            bg = Color(0xFFF3F6F5), card = Color(0xFFFFFFFF), line = Color(0xFFDCE3E0), ink = Color(0xFF14201C), muted = Color(0xFF5F6E69),
            accent = Color(0xFF0E8C77), onAccent = Color.White, violet = Color(0xFF6D5BD0), amber = Color(0xFFB45309), danger = Color(0xFFC62828),
            inBubble = Color.White, outBubble = Color(0xFFD3F5C6), outInk = Color(0xFF14201C), outMeta = Color(0xFF3F7A55), meta = Color(0xFF6B7A75)),
        Pal("sand", "Песок", false,
            bg = Color(0xFFF7F3EC), card = Color(0xFFFFFFFF), line = Color(0xFFE6DDCF), ink = Color(0xFF2A2118), muted = Color(0xFF75685A),
            accent = Color(0xFFC46A1E), onAccent = Color.White, violet = Color(0xFF7A5BC8), amber = Color(0xFFB45309), danger = Color(0xFFC62828),
            inBubble = Color.White, outBubble = Color(0xFFFFE2B8), outInk = Color(0xFF2A2118), outMeta = Color(0xFF8A6A3C), meta = Color(0xFF7D7064)),
        Pal("sky", "Небо", false,
            bg = Color(0xFFF2F5F9), card = Color(0xFFFFFFFF), line = Color(0xFFDCE3EC), ink = Color(0xFF131C28), muted = Color(0xFF5B6878),
            accent = Color(0xFF2F6FD6), onAccent = Color.White, violet = Color(0xFF6D5BD0), amber = Color(0xFFB45309), danger = Color(0xFFC62828),
            inBubble = Color.White, outBubble = Color(0xFFCFE3FF), outInk = Color(0xFF131C28), outMeta = Color(0xFF41618E), meta = Color(0xFF677486)),
        Pal("dawn", "Рассвет", false,
            bg = Color(0xFFF3EFE6), card = Color(0xFFFFFFFF), line = Color(0xFFE2DACB), ink = Color(0xFF1D2430), muted = Color(0xFF5D6672),
            accent = Color(0xFF1F5FD1), onAccent = Color.White, violet = Color(0xFF5A49C2), amber = Color(0xFFA3560F), danger = Color(0xFFC62828),
            inBubble = Color.White, outBubble = Color(0xFFDCE7FA), outInk = Color(0xFF1D2430), outMeta = Color(0xFF41618E), meta = Color(0xFF6A727D)),
        Pal("night", "Ночь", true,
            bg = Color(0xFF0E1116), card = Color(0xFF151A21), line = Color(0xFF262C36), ink = Color(0xFFE8EAED), muted = Color(0xFF9AA3AE),
            accent = Color(0xFF3DD9C1), onAccent = Color(0xFF0E1116), violet = Color(0xFF8B7CFF), amber = Color(0xFFF5B83D), danger = Color(0xFFFF8A80),
            inBubble = Color(0xFF1A2028), outBubble = Color(0xFF1F6F65), outInk = Color(0xFFF2FFFC), outMeta = Color(0xFFBFEDE5), meta = Color(0xFF8A939E)),
        Pal("mono", "Монохром", false,
            bg = Color(0xFFF6F6F4), card = Color(0xFFFFFFFF), line = Color(0xFFD6D6D2), ink = Color(0xFF111111), muted = Color(0xFF5E5E5E),
            accent = Color(0xFF111111), onAccent = Color.White, violet = Color(0xFF3E3E3E), amber = Color(0xFF3E3E3E), danger = Color(0xFF111111),
            inBubble = Color.White, outBubble = Color(0xFFE4E4E0), outInk = Color(0xFF111111), outMeta = Color(0xFF5E5E5E), meta = Color(0xFF6B6B6B), square = true),
        Pal("mono_night", "Монохром ночь", true,
            bg = Color(0xFF0E0E0E), card = Color(0xFF171717), line = Color(0xFF2E2E2E), ink = Color(0xFFF2F2F0), muted = Color(0xFFA3A39F),
            accent = Color(0xFFF2F2F0), onAccent = Color(0xFF111111), violet = Color(0xFFC8C8C4), amber = Color(0xFFC8C8C4), danger = Color(0xFFF2F2F0),
            inBubble = Color(0xFF171717), outBubble = Color(0xFF2A2A2A), outInk = Color(0xFFF2F2F0), outMeta = Color(0xFFA3A39F), meta = Color(0xFF8E8E8A), square = true),
    )

    private var base by mutableStateOf(all.first { it.id == "sky" })
    val c: Pal get() = base

    fun load() {
        base = all.firstOrNull { it.id == Prefs.theme } ?: all.first { it.id == "sky" }
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
