package ru.alim.newai

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.addPathNodes
import androidx.compose.ui.graphics.vector.rememberVectorPainter
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

internal fun lineIco(name: String, path: String, w: Float = 1.9f): ImageVector = ImageVector.Builder(name, 24.dp, 24.dp, 24f, 24f).apply {
    addPath(addPathNodes(path), stroke = SolidColor(Color.Black), strokeLineWidth = w,
        strokeLineCap = StrokeCap.Round, strokeLineJoin = StrokeJoin.Round)
}.build()

val icBrain by lazy { lineIco("brain", "M12 5a3 3 0 0 0-5.5-1.6A3.4 3.4 0 0 0 4 9.1a3.8 3.8 0 0 0 .7 6.5A3.5 3.5 0 0 0 12 18V5M12 5a3 3 0 0 1 5.5-1.6A3.4 3.4 0 0 1 20 9.1a3.8 3.8 0 0 1-.7 6.5A3.5 3.5 0 0 1 12 18M8 7c0 1.5.8 2.3 2 2.5M16 7c0 1.5-.8 2.3-2 2.5M7 14c1.4 0 2.2.7 2.5 2M17 14c-1.4 0-2.2.7-2.5 2") }
val icProvider by lazy { lineIco("provider", "M7 18a4 4 0 0 1-.6-7.96A6 6 0 0 1 18 9.5a3.5 3.5 0 1 1 .5 6.96H7z") }
val icExit by lazy { lineIco("exit", "M4 5h8v14H4zM12 12h8M17 8l4 4-4 4") }
val icGear by lazy { lineIco("gear", "M12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3a1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5a1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8a1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1a1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5a1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z") }
val icTrash by lazy { lineIco("trash", "M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6M14 11v6") }
val icPlus by lazy { lineIco("plus", "M12 5v14M5 12h14", 2.2f) }
val icStop by lazy { lineIco("stop", "M7 7h10v10H7z", 2f) }
val icRefresh by lazy { lineIco("refresh", "M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7", 2f) }
val icCheck by lazy { lineIco("check", "M5 12l5 5 9-10", 2.5f) }
val icBack by lazy { lineIco("back", "M15 5l-7 7 7 7", 2.1f) }
val icKey by lazy { lineIco("key", "M14 10a4 4 0 1 0-3.5 4H14l6 6M17 17l2-2M20 20l2-2") }
val icSend by lazy { lineIco("send", "M4 12l16-8-5 16-3-6-8-2z", 2f) }
val icMic by lazy { lineIco("mic", "M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3M9 21h6", 2f) }
val icFile by lazy { lineIco("file", "M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h7") }
val icClip by lazy { lineIco("clip", "M21 12.5l-8.5 8.5a5 5 0 0 1-7-7L14 5.5a3.5 3.5 0 0 1 5 5L10.5 19a2 2 0 0 1-3-3L15 8.5", 1.8f) }
val icSpark by lazy { lineIco("spark", "M12 3l1.7 4.6L18 9l-4.3 1.4L12 15l-1.7-4.6L6 9l4.3-1.4L12 3zM19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8L19 14z", 1.7f) }
val icExpand by lazy { lineIco("expand", "M8 3H3v5M3 3l6 6M16 3h5v5M21 3l-6 6M8 21H3v-5M3 21l6-6M16 21h5v-5M21 21l-6-6", 1.8f) }

@Composable
fun CardBox(modifier: Modifier = Modifier, border: Color? = null, bg: Color = Card, content: @Composable ColumnScope.() -> Unit) {
    val shape = shp(16.dp)
    Column(modifier.fillMaxWidth().clip(shape).background(bg)
        .let { if (border != null) it.border(BorderStroke(1.dp, border), shape) else it }
        .padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp), content = content)
}

@Composable
fun BigButton(text: String, onClick: () -> Unit, bg: Color = Teal, fg: Color = Bg, border: Color? = null, modifier: Modifier = Modifier) {
    val shape = shp(16.dp)
    Box(modifier.fillMaxWidth().height(48.dp).clip(shape).background(bg)
        .let { if (border != null) it.border(1.dp, border, shape) else it }
        .clickable(onClick = onClick), contentAlignment = Alignment.Center) {
        Text(text, style = body(15, FontWeight.Bold, fg))
    }
}

@Composable
fun Toggle(checked: Boolean, onChange: (Boolean) -> Unit) =
    Switch(checked, onChange, colors = SwitchDefaults.colors(checkedTrackColor = Teal, checkedThumbColor = Bg,
        uncheckedTrackColor = Line, uncheckedThumbColor = Muted, uncheckedBorderColor = Line))

@Composable
fun Seg(options: List<Pair<String, String>>, cur: String, set: (String) -> Unit) {
    Row(Modifier.fillMaxWidth().clip(shp(14.dp)).background(Track).padding(4.dp), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        options.forEach { (id, label) ->
            Box(Modifier.weight(1f).height(38.dp).clip(shp(11.dp)).background(if (cur == id) Card else Color.Transparent)
                .clickable { set(id) }, contentAlignment = Alignment.Center) {
                Text(label, style = body(14, FontWeight.SemiBold, if (cur == id) Ink else Muted))
            }
        }
    }
}

@Composable
fun PickerButton(icon: ImageVector, label: String, accessibility: String, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Row(modifier.height(44.dp).clip(shp(12.dp)).background(Card).background(AccentSoft).border(1.dp, Line, shp(12.dp))
        .clickable(onClickLabel = accessibility, onClick = onClick).padding(horizontal = 10.dp), verticalAlignment = Alignment.CenterVertically) {
        androidx.compose.material3.Icon(rememberVectorPainter(icon), null, tint = Teal, modifier = Modifier.size(18.dp))
        Spacer(Modifier.width(7.dp))
        Text(label, style = body(12, FontWeight.SemiBold, Teal), modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
        Text("⌄", style = body(14, color = Teal))
    }
}

@Composable
fun SecretField(value: String, onChange: (String) -> Unit, title: String, modifier: Modifier = Modifier) {
    OutlinedTextField(value, onChange, modifier.fillMaxWidth(), label = { Text(title) }, singleLine = true,
        visualTransformation = PasswordVisualTransformation())
}

/** Три пульсирующие точки — «ИИ думает». */
@Composable
fun ThinkDots(color: Color = Teal) {
    val inf = rememberInfiniteTransition(label = "dots")
    Row(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
        repeat(3) { i ->
            val a by inf.animateFloat(0.3f, 1f, infiniteRepeatable(tween(600, delayMillis = i * 200), RepeatMode.Reverse), label = "d$i")
            Box(Modifier.size(6.dp).alpha(a).clip(circ).background(color))
        }
    }
}

@Composable
fun HGap(w: Int) = Spacer(Modifier.width(w.dp))

@Composable
fun Gap(h: Int) = Spacer(Modifier.height(h.dp))
