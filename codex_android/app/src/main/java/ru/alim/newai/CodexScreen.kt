package ru.alim.newai

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.rememberVectorPainter
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

private val hhmm = SimpleDateFormat("HH:mm", Locale("ru"))

@Composable
fun CodexScreen(onSettings: () -> Unit) {
    val ctx = LocalContext.current
    val session = Sessions.current
    val activity = rememberCodexActivity(session)
    val list = rememberLazyListState()
    val scope = rememberCoroutineScope()
    var composerFocused by remember { mutableStateOf(false) }
    var composerH by remember { mutableIntStateOf(190) }
    var askDelete by remember { mutableStateOf(false) }
    var hint by remember { mutableStateOf<String?>(null) }
    var listening by remember { mutableStateOf(false) }
    var transcribing by remember { mutableStateOf(false) }
    var seconds by remember { mutableIntStateOf(0) }
    var voice by remember { mutableStateOf<CodexVoiceSession?>(null) }

    val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { ok ->
        hint = if (ok) "Микрофон разрешён — нажми ещё раз" else "Нужен доступ к микрофону"
    }

    fun send() {
        val text = session.draft.trim()
        if (text.isBlank()) return
        val providerId = session.providerId.ifBlank { Providers.defaultProvider(ctx) }
        val provider = Providers.find(providerId)
        val model = session.model.ifBlank { Providers.firstRuntimeModel(providerId) }
        if (provider == null || model.isBlank()) {
            hint = "Сначала добавь провайдера и загрузи модели в настройках"
            return
        }
        session.providerId = providerId
        session.model = model
        session.draft = ""
        hint = null
        Sessions.save()
        ctx.startForegroundService(Intent(ctx, TaskService::class.java)
            .putExtra("session", session.id).putExtra("text", text))
        Prefs.overlayTask = session.taskId
        Prefs.overlaySession = session.id
        if (Prefs.floatingOverlay) CodexOverlayService.start(ctx, session.taskId, session.id)
    }

    fun startVoice() {
        if (listening || transcribing) return
        val key = runCatching { CodexGateway.deepSeekAsrKey(ctx) }.getOrDefault("")
        if (key.isBlank()) { hint = "Для диктовки добавь ключ DeepSeek в настройках"; return }
        if (ContextCompat.checkSelfPermission(ctx, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            permission.launch(Manifest.permission.RECORD_AUDIO)
            return
        }
        val current = CodexVoiceSession()
        voice = current
        listening = true
        seconds = 0
        hint = null
        scope.launch {
            try {
                val wav = withContext(Dispatchers.IO) { current.record() }
                listening = false
                if (!current.cancelled) {
                    transcribing = true
                    val text = withContext(Dispatchers.IO) { current.transcribe(wav, key) }
                    session.draft = (session.draft + " " + text).trim().take(4000)
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                if (!current.cancelled) hint = e.message ?: "Не удалось распознать речь"
            } finally {
                listening = false
                transcribing = false
                if (voice === current) voice = null
            }
        }
    }

    fun finishVoice(cancel: Boolean) {
        val current = voice ?: return
        if (cancel) current.cancel() else current.stop = true
    }

    LaunchedEffect(listening) {
        var n = 0
        while (listening) { delay(1000); n++; seconds = n }
    }
    LaunchedEffect(session.id, session.messages.size) {
        if (session.messages.isNotEmpty()) runCatching { list.animateScrollToItem(0) }
    }

    val ime = WindowInsets.ime.asPaddingValues().calculateBottomPadding()
    val nav = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    val bottomPad = maxOf(ime, nav) + with(LocalDensity.current) { composerH.toDp() } + 18.dp
    val topPad = WindowInsets.statusBars.asPaddingValues().calculateTopPadding() + 72.dp

    Box(Modifier.fillMaxSize().background(Bg)) {
        Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(
            Teal.copy(alpha = if (Th.c.dark) 0.10f else 0.06f), Color.Transparent, Th.c.violet.copy(alpha = 0.04f)
        ))))
        LazyColumn(
            Modifier.fillMaxSize(), state = list, reverseLayout = true,
            contentPadding = PaddingValues(start = 14.dp, end = 14.dp, top = topPad, bottom = bottomPad),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            if (session.messages.isEmpty()) item(key = "hello") { EmptyCodex() }
            items(session.messages.toList().asReversed(), key = { it.id }) { message ->
                MessageBubble(message)
            }
        }
        Box(Modifier.align(Alignment.TopCenter).fillMaxWidth().height(topPad)
            .background(Brush.verticalGradient(listOf(Bg.copy(alpha = 0.98f), Bg.copy(alpha = 0.82f), Color.Transparent))))
        CodexTopBar(session, activity.running, onExit = { (ctx as? android.app.Activity)?.finish() },
            onSettings = onSettings, onDelete = { askDelete = true })

        Column(Modifier.align(Alignment.BottomCenter).fillMaxWidth().navigationBarsPadding().imePadding()
            .padding(horizontal = 10.dp).padding(top = 4.dp, bottom = 10.dp)
            .onSizeChanged { composerH = it.height }) {
            if (session.busy && session.pending.isNotBlank()) {
                Text(if (Prefs.followUp == "interrupt") "Новое сообщение остановит текущую задачу" else "Новое сообщение пойдёт после текущей задачи",
                    style = body(11, color = Muted), modifier = Modifier.padding(start = 8.dp, bottom = 4.dp))
            }
            if (composerFocused) CodexKeyboardBar(session)
            CodexRunBubble(activity)
            hint?.let { Text(it, style = body(12, color = Danger), modifier = Modifier.padding(start = 8.dp, bottom = 4.dp)) }
            if (listening || transcribing) {
                Row(Modifier.fillMaxWidth().padding(bottom = 6.dp).clip(shp(12.dp)).background(AccentSoft)
                    .padding(horizontal = 12.dp, vertical = 7.dp), verticalAlignment = Alignment.CenterVertically) {
                    ThinkDots()
                    Spacer(Modifier.width(8.dp))
                    Text(if (transcribing) "DeepSeek · распознаю…" else "Слушаю… %d:%02d".format(seconds / 60, seconds % 60),
                        style = body(12, FontWeight.SemiBold, Teal), modifier = Modifier.weight(1f))
                    if (listening) {
                        Text("Отмена", style = body(12, color = Muted), modifier = Modifier.clickable { finishVoice(true) }.padding(6.dp))
                        Text("Готово", style = body(12, FontWeight.SemiBold, Teal), modifier = Modifier.clickable { finishVoice(false) }.padding(6.dp))
                    }
                }
            }
            Box(Modifier.fillMaxWidth().heightIn(min = 46.dp)) {
                Row(Modifier.fillMaxWidth().padding(end = 56.dp).heightIn(min = 48.dp).clip(shp(24.dp))
                    .background(Card).border(1.dp, Line, shp(24.dp)).padding(horizontal = 12.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically) {
                    BasicTextField(session.draft, { session.draft = it.take(4000); hint = null },
                        Modifier.weight(1f).onFocusChangedCompat { composerFocused = it },
                        textStyle = body(16), cursorBrush = SolidColor(Teal), maxLines = 6,
                        decorationBox = { inner ->
                            if (session.draft.isEmpty()) Text("Сообщение", style = body(16, color = Muted))
                            inner()
                        })
                    Spacer(Modifier.width(8.dp))
                    Icon(rememberVectorPainter(icFile), "Файлы задачи", tint = Muted,
                        modifier = Modifier.size(34.dp).clickable { hint = "Файлы создаются Codex и появятся в ответе" }.padding(6.dp))
                }
                val canSend = session.draft.isNotBlank()
                val showStop = session.busy && !canSend && !listening && !transcribing
                Box(Modifier.align(Alignment.BottomEnd).size(48.dp).clip(circ).background(Teal).clickable(onClickLabel = when {
                    listening -> "Закончить запись"
                    showStop -> "Остановить Codex"
                    canSend -> "Отправить"
                    else -> "Голосовой ввод"
                }) {
                    when {
                        listening -> finishVoice(false)
                        showStop -> AppNav.stop(session)
                        canSend -> send()
                        transcribing -> Unit
                        else -> startVoice()
                    }
                }, contentAlignment = Alignment.Center) {
                    when {
                        listening -> Box(Modifier.size(13.dp).clip(shp(3.dp)).background(OnAccent))
                        showStop -> Icon(rememberVectorPainter(icStop), "Остановить", tint = OnAccent, modifier = Modifier.size(21.dp))
                        canSend -> Icon(rememberVectorPainter(icSend), "Отправить", tint = OnAccent, modifier = Modifier.size(21.dp))
                        transcribing -> ThinkDots(OnAccent)
                        else -> Icon(rememberVectorPainter(icMic), "Голосовой ввод", tint = OnAccent, modifier = Modifier.size(22.dp))
                    }
                }
            }
        }
    }

    if (askDelete) {
        val last = Sessions.list.size <= 1
        AlertDialog(
            onDismissRequest = { askDelete = false },
            title = { Text(if (last) "Очистить диалог?" else "Удалить диалог?") },
            text = { Text(if (last) "Переписка будет очищена, сам режим останется." else "«${session.name}» и вся переписка будут удалены.") },
            confirmButton = {
                TextButton({
                    askDelete = false
                    Sessions.remove(session.id)
                }) { Text(if (last) "Очистить" else "Удалить", color = Danger) }
            },
            dismissButton = { TextButton({ askDelete = false }) { Text("Отмена") } },
        )
    }
}

private fun Modifier.onFocusChangedCompat(onChange: (Boolean) -> Unit): Modifier =
    this.onFocusChanged { onChange(it.isFocused) }

@Composable
private fun EmptyCodex() {
    Column(Modifier.fillMaxWidth().padding(top = 48.dp), horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Box(Modifier.size(84.dp).clip(circ).background(AccentSoft).border(1.dp, Teal.copy(alpha = 0.35f), circ),
            contentAlignment = Alignment.Center) {
            Icon(rememberVectorPainter(icBrain), null, tint = Teal, modifier = Modifier.size(38.dp))
        }
        Text("Вайбкодер", style = body(20, FontWeight.Bold))
        Text("Опиши задачу — разберусь в коде, запущу инструменты и принесу результат.",
            style = body(14, color = Muted), modifier = Modifier.widthIn(max = 320.dp).clip(shp(14.dp))
                .background(Th.c.inBubble.copy(alpha = 0.8f)).padding(12.dp))
    }
}

@Composable
private fun MessageBubble(message: Message) {
    if (message.system) {
        Column(Modifier.fillMaxWidth().padding(vertical = 2.dp)) {
            Column(Modifier.fillMaxWidth().clip(shp(12.dp)).background(Card).border(1.dp, Line, shp(12.dp))
                .padding(horizontal = 14.dp, vertical = 10.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(message.text, style = body(14, color = Danger), lineHeight = 19.sp)
                Text(hhmm.format(Date(message.ts)), style = body(11, color = Muted))
            }
        }
        return
    }
    val shape = if (message.mine) shp(20.dp, 20.dp, 6.dp, 20.dp) else shp(20.dp, 20.dp, 20.dp, 6.dp)
    val bubble = if (message.mine) Th.c.outBubble else Th.c.inBubble
    val ink = if (message.mine) Th.c.outInk else Th.c.ink
    val meta = if (message.mine) Th.c.outMeta else Th.c.meta
    Column(Modifier.fillMaxWidth(), horizontalAlignment = if (message.mine) Alignment.End else Alignment.Start) {
        Column(Modifier.widthIn(max = if (message.mine) 320.dp else 600.dp).clip(shape).background(bubble)
            .padding(16.dp, 12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            androidx.compose.foundation.text.selection.SelectionContainer {
                Text(message.text, style = body(16, color = ink), lineHeight = 24.sp)
            }
            message.files.forEach { file -> FileCard(file) }
            Text(hhmm.format(Date(message.ts)), style = body(11, color = meta), modifier = Modifier.align(Alignment.End))
        }
    }
}

@Composable
private fun FileCard(file: Docs.FileRef) {
    val ctx = LocalContext.current
    val badge = when {
        file.name.endsWith(".pdf", true) -> "PDF"
        file.name.endsWith(".xlsx", true) -> "XLS"
        else -> "DOC"
    }
    Row(Modifier.fillMaxWidth().clip(shp(12.dp)).background(Card.copy(alpha = 0.7f))
        .clickable {
            runCatching {
                ctx.startActivity(Intent.createChooser(Intent(Intent.ACTION_VIEW).setDataAndType(file.uri, file.mime)
                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION), "Открыть").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            }
        }.padding(8.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(40.dp).clip(shp(10.dp)).background(Teal), contentAlignment = Alignment.Center) {
            Text(badge, style = body(11, FontWeight.Bold, OnAccent))
        }
        Spacer(Modifier.width(10.dp))
        Text(file.name, style = body(13, FontWeight.SemiBold, Ink), maxLines = 2, overflow = TextOverflow.Ellipsis)
    }
}
