package ru.alim.newai

import android.content.Intent
import android.net.Uri
import android.provider.OpenableColumns
import android.webkit.MimeTypeMap
import android.webkit.WebView
import android.webkit.WebViewClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
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
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.vector.rememberVectorPainter
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.FileProvider
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.ByteArrayInputStream
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

private val hhmm = SimpleDateFormat("HH:mm", Locale("ru"))

/** Подгоняет произвольный HTML/SVG под размер инлайн-превью без обрезки и лишнего зума. */
private const val ARTIFACT_FIT_SCRIPT = """
(function() {
  if (window.__codexArtifactFit) return;
  window.__codexArtifactFit = true;

  var root = document.documentElement;
  if (!root) return;

  if (root.tagName && root.tagName.toLowerCase() === 'svg') {
    root.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    root.style.width = '100vw';
    root.style.height = '100vh';
    root.style.maxWidth = '100vw';
    root.style.maxHeight = '100vh';
    root.style.display = 'block';
    return;
  }

  var head = document.head || root;
  var viewport = document.querySelector('meta[name="viewport"]');
  if (!viewport) {
    viewport = document.createElement('meta');
    viewport.setAttribute('name', 'viewport');
    head.appendChild(viewport);
  }
  viewport.setAttribute('content', 'width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no');

  var style = document.createElement('style');
  style.textContent = 'html,body{max-width:100%!important;overflow:hidden!important}' +
    'img,video,canvas{max-width:100%!important;height:auto!important}';
  head.appendChild(style);

  function fitWidth() {
    var body = document.body;
    if (!body) return;

    body.style.transform = '';
    body.style.width = '';
    body.style.transformOrigin = 'top left';

    var viewportWidth = Math.max(1, window.innerWidth || root.clientWidth || 1);
    var width = Math.max(root.scrollWidth || 0, body.scrollWidth || 0, viewportWidth);
    if (width <= viewportWidth + 1) return;

    var scale = viewportWidth / width;
    body.style.transform = 'scale(' + scale + ')';
    body.style.width = (100 / scale) + '%';
  }

  fitWidth();
  setTimeout(fitWidth, 80);
  setTimeout(fitWidth, 400);
  window.addEventListener('resize', fitWidth);
})();
"""

/** Берёт пропорции SVG из viewBox, чтобы превью не оставляло полос по краям. */
private fun artifactAspectRatio(file: Docs.FileRef): Float {
    if (!file.name.endsWith(".svg", true)) return 4f / 3f
    val head = runCatching {
        java.io.File(file.path).bufferedReader().use { reader ->
            val buffer = CharArray(16 * 1024)
            val read = reader.read(buffer)
            if (read > 0) String(buffer, 0, read) else ""
        }
    }.getOrDefault("")
    val viewBox = Regex(
        """viewBox\s*=\s*["']\s*[-\d.]+[,\s]+[-\d.]+[,\s]+([\d.]+)[,\s]+([\d.]+)""",
        RegexOption.IGNORE_CASE,
    ).find(head) ?: return 4f / 3f
    val width = viewBox.groupValues[1].toFloatOrNull() ?: return 4f / 3f
    val height = viewBox.groupValues[2].toFloatOrNull() ?: return 4f / 3f
    if (width <= 0f || height <= 0f) return 4f / 3f
    return (width / height).coerceIn(0.6f, 3.2f)
}

@Composable
fun CodexScreen(onSettings: () -> Unit) {
    val ctx = LocalContext.current
    val session = Sessions.current
    val activity = rememberCodexActivity(session)
    val list = rememberLazyListState()
    var composerFocused by remember { mutableStateOf(false) }
    var composerH by remember { mutableIntStateOf(190) }
    var askDelete by remember { mutableStateOf(false) }
    var hint by remember { mutableStateOf<String?>(null) }
    val attachPick = rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uris ->
        attachFiles(ctx, session, uris)
    }

    fun send() {
        val text = session.draft.trim()
        val files = session.attachments.toList()
        if (text.isBlank() && files.isEmpty()) return
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
        session.attachments.clear()
        hint = null
        Sessions.save()
        ctx.startForegroundService(Intent(ctx, TaskService::class.java)
            .putExtra("session", session.id).putExtra("text", text)
            .putExtra("files", Docs.toJson(files).toString()))
        Prefs.overlayTask = session.taskId
        Prefs.overlaySession = session.id
        if (Prefs.floatingOverlay) CodexOverlayService.start(ctx, session.taskId, session.id)
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
        CodexTopBar(session, onSettings = onSettings, onDelete = { askDelete = true })

        Column(Modifier.align(Alignment.BottomCenter).fillMaxWidth().navigationBarsPadding().imePadding()
            .background(Bg).padding(horizontal = 10.dp).padding(top = 4.dp, bottom = 10.dp)
            .onSizeChanged { composerH = it.height }) {
            if (session.busy && (session.pending.isNotBlank() || session.pendingFiles.isNotEmpty())) {
                Text(if (Prefs.followUp == "interrupt") "Новое сообщение остановит текущую задачу" else "Новое сообщение пойдёт после текущей задачи",
                    style = body(11, color = Muted), modifier = Modifier.padding(start = 8.dp, bottom = 4.dp))
            }
            CodexRunBubble(activity)
            hint?.let { Text(it, style = body(12, color = Danger), modifier = Modifier.padding(start = 8.dp, bottom = 4.dp)) }
            if (composerFocused) CodexKeyboardBar(session)
            if (session.attachments.isNotEmpty()) {
                Column(Modifier.fillMaxWidth().padding(horizontal = 4.dp, vertical = 3.dp),
                    verticalArrangement = Arrangement.spacedBy(5.dp)) {
                    Text("Вложения · ${session.attachments.size}", style = body(11, FontWeight.SemiBold, Muted))
                    Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        session.attachments.toList().forEach { file ->
                            PendingAttachment(file) {
                                session.attachments.remove(file)
                                Sessions.save()
                            }
                        }
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
                    Icon(rememberVectorPainter(icClip), "Прикрепить файл", tint = Muted,
                        modifier = Modifier.size(36.dp).clickable { attachPick.launch(arrayOf("*/*")) }.padding(6.dp))
                }
                val canSend = session.draft.isNotBlank() || session.attachments.isNotEmpty()
                val showStop = session.busy && !canSend
                Box(Modifier.align(Alignment.BottomEnd)) {
                    androidx.compose.runtime.key(session.id) {
                        CodexVoiceInput(
                            showStop = showStop,
                            onClick = { if (showStop) AppNav.stop(session) else if (canSend) send() },
                            onText = { transcript ->
                                session.draft = if (session.draft.isBlank()) transcript
                                    else session.draft.trimEnd() + " " + transcript
                            },
                        )
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

/** Копирует выбранные файлы в рабочую папку Codex и оставляет в композере визуальные вложения. */
private fun attachFiles(ctx: android.content.Context, session: CodexSession, uris: List<Uri>) {
    if (uris.isEmpty()) return
    val workspace = EmbeddedRuntime.taskWorkspace(ctx, session.taskId)
    workspace.mkdirs()
    val added = mutableListOf<Docs.FileRef>()
    for (uri in uris) {
        val name = runCatching {
            ctx.contentResolver.query(uri, null, null, null, null)?.use { cursor ->
                val idx = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                if (idx >= 0 && cursor.moveToFirst()) cursor.getString(idx) else null
            }
        }.getOrNull().orEmpty().let { java.io.File(it).name }.ifBlank { "file_${System.currentTimeMillis()}" }
        // Two picked files often have the same basename (for example, two
        // screenshots). Keep both instead of silently overwriting the first.
        val base = name.substringBeforeLast('.', name)
        val extension = name.substringAfterLast('.', "").takeIf { it.isNotBlank() }?.let { ".$it" }.orEmpty()
        var dest = java.io.File(workspace, name)
        var duplicate = 2
        while (dest.exists()) {
            dest = java.io.File(workspace, "$base ($duplicate)$extension")
            duplicate++
        }
        val mime = runCatching { ctx.contentResolver.getType(uri) }.getOrNull().orEmpty().ifBlank {
            MimeTypeMap.getSingleton().getMimeTypeFromExtension(dest.extension.lowercase())
                ?: "application/octet-stream"
        }
        runCatching {
            ctx.contentResolver.openInputStream(uri)?.use { input ->
                dest.outputStream().use { input.copyTo(it) }
            }
        }.onSuccess {
            val openUri = runCatching {
                FileProvider.getUriForFile(ctx, ctx.packageName + ".files", dest)
            }.getOrDefault(uri)
            added += Docs.FileRef(dest.name, openUri, mime, dest.absolutePath)
        }
    }
    if (added.isNotEmpty()) {
        added.forEach { file ->
            if (session.attachments.none { it.path == file.path }) session.attachments += file
        }
        Sessions.save()
    }
}

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

private fun formatWorkDuration(ms: Long): String {
    val seconds = (ms / 1000).coerceAtLeast(1)
    val hours = seconds / 3600
    val minutes = seconds % 3600 / 60
    return when {
        hours > 0 -> "${hours} ч ${minutes} мин"
        minutes > 0 -> "${minutes} мин ${seconds % 60} сек"
        else -> "${seconds} сек"
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
    var showUsage by remember { mutableStateOf(false) }
    if (showUsage) {
        val usage = message.usage
        fun count(value: Long?) = value?.let { java.text.NumberFormat.getIntegerInstance().format(it) } ?: "Нет данных"
        AlertDialog(onDismissRequest = { showUsage = false }, title = { Text("Использовано токенов") },
            text = { Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Вход: ${count(usage?.input)}")
                Text("Выход: ${count(usage?.output)}")
                Text("Из кэша: ${count(usage?.cached)}")
                Text("Токены из кэша входят в число входных.", style = body(12, color = Muted))
            } }, confirmButton = { TextButton(onClick = { showUsage = false }) { Text("Закрыть") } })
    }
    val shape = if (message.mine) shp(20.dp, 20.dp, 6.dp, 20.dp) else shp(20.dp, 20.dp, 20.dp, 6.dp)
    val bubble = if (message.mine) Th.c.outBubble else Th.c.inBubble
    val ink = if (message.mine) Th.c.outInk else Th.c.ink
    val meta = if (message.mine) Th.c.outMeta else Th.c.meta
    Column(Modifier.fillMaxWidth(), horizontalAlignment = if (message.mine) Alignment.End else Alignment.Start) {
        Column(Modifier.widthIn(max = if (message.mine) 320.dp else 600.dp).clip(shape).background(bubble)
            .padding(16.dp, 12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            if (message.text.isNotBlank()) {
                androidx.compose.foundation.text.selection.SelectionContainer {
                    MarkdownText(message.text, ink)
                }
            }
            val visibleFiles = message.files.filterNot { it.isGeneratedArtifact() }
            if (visibleFiles.isNotEmpty()) {
                Text("Вложения · ${visibleFiles.size}", style = body(11, FontWeight.SemiBold, meta))
                LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(visibleFiles, key = { it.path.ifBlank { it.name } }) { file ->
                        if (message.mine) SentAttachment(file) else CompactAttachment(file, 148.dp, 104.dp, null)
                    }
                }
            }
            val timeLabel = message.durationMs?.let { "Работал ${formatWorkDuration(it)} · " }.orEmpty() + hhmm.format(Date(message.ts))
            Row(Modifier.align(Alignment.End), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                if (!message.mine) Text("Использовано", style = body(11, FontWeight.SemiBold, Teal),
                    modifier = Modifier.clip(shp(8.dp)).clickable { showUsage = true }.padding(4.dp))
                Text(timeLabel, style = body(11, color = meta))
            }
        }
    }
}

@Composable
private fun FileCard(file: Docs.FileRef) {
    when {
        file.isWebArtifact() ->
            if (file.path.isNotBlank()) WebArtifact(file) else DocFileCard(file)
        file.isImageArtifact() ->
            if (file.path.isNotBlank()) ImageArtifact(file) else DocFileCard(file)
        else -> DocFileCard(file)
    }
}

private fun Docs.FileRef.isWebArtifact(): Boolean =
    name.endsWith(".svg", true) || name.endsWith(".html", true) || name.endsWith(".htm", true)

private fun Docs.FileRef.isImageArtifact(): Boolean =
    (mime.startsWith("image/", true) && !name.endsWith(".svg", true)) ||
        name.endsWith(".png", true) || name.endsWith(".jpg", true) || name.endsWith(".jpeg", true) ||
        name.endsWith(".webp", true) || name.endsWith(".gif", true) || name.endsWith(".bmp", true)

private fun fileBadge(name: String): String = when {
    name.endsWith(".pdf", true) -> "PDF"
    name.endsWith(".xlsx", true) || name.endsWith(".xls", true) || name.endsWith(".csv", true) -> "XLS"
    name.endsWith(".docx", true) || name.endsWith(".doc", true) -> "DOC"
    name.endsWith(".html", true) || name.endsWith(".htm", true) -> "HTML"
    name.endsWith(".svg", true) -> "SVG"
    name.endsWith(".zip", true) -> "ZIP"
    name.endsWith(".apk", true) -> "APK"
    else -> name.substringAfterLast('.', "").takeIf { it.isNotBlank() }?.uppercase(Locale.ROOT)?.take(4) ?: "FILE"
}

private fun decodeImage(path: String, maxDimension: Int = 2048): android.graphics.Bitmap? {
    val bounds = android.graphics.BitmapFactory.Options().apply { inJustDecodeBounds = true }
    android.graphics.BitmapFactory.decodeFile(path, bounds)
    if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null
    var sample = 1
    while (bounds.outWidth / sample > maxDimension || bounds.outHeight / sample > maxDimension) sample *= 2
    return android.graphics.BitmapFactory.decodeFile(path,
        android.graphics.BitmapFactory.Options().apply { inSampleSize = sample })
}

private fun openFile(ctx: android.content.Context, file: Docs.FileRef) {
    runCatching {
        ctx.startActivity(Intent.createChooser(Intent(Intent.ACTION_VIEW).setDataAndType(file.uri, file.mime)
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION), "Открыть").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
}

/** Инлайн-превью HTML и SVG без карточки, заголовка и лишней рамки. */
@Composable
private fun WebArtifact(file: Docs.FileRef) {
    val aspectRatio = remember(file.path) { artifactAspectRatio(file) }
    var fullscreen by remember(file.path) { mutableStateOf(false) }
    BoxWithConstraints(Modifier.fillMaxWidth()) {
        val previewHeight = (maxWidth / aspectRatio).coerceIn(180.dp, 520.dp)
        androidx.compose.runtime.key(file.path) {
            Box(Modifier.fillMaxWidth().height(previewHeight).clip(shp(12.dp))) {
                ArtifactWebView(file, Modifier.fillMaxSize())
                Box(Modifier.align(Alignment.TopEnd).padding(8.dp).size(40.dp).clip(CircleShape)
                    .background(Color.Black.copy(alpha = 0.62f))
                    .clickable(onClickLabel = "Открыть на весь экран") { fullscreen = true },
                    contentAlignment = Alignment.Center) {
                    Icon(rememberVectorPainter(icExpand), "На весь экран", tint = Color.White,
                        modifier = Modifier.size(20.dp))
                }
            }
        }
    }
    if (fullscreen) {
        Dialog(
            onDismissRequest = { fullscreen = false },
            properties = DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false),
        ) {
            Surface(Modifier.fillMaxSize(), color = Color.Black) {
                Box(Modifier.fillMaxSize()) {
                    ArtifactWebView(file, Modifier.fillMaxSize().padding(top = 52.dp))
                    Box(Modifier.align(Alignment.TopEnd).padding(10.dp).size(40.dp).clip(CircleShape)
                        .background(Color.Black.copy(alpha = 0.72f))
                        .clickable(onClickLabel = "Закрыть полноэкранный просмотр") { fullscreen = false },
                        contentAlignment = Alignment.Center) {
                        Text("×", style = body(28, FontWeight.Light, Color.White))
                    }
                }
            }
        }
    }
}

@Composable
private fun ImageArtifact(file: Docs.FileRef) {
    val ctx = LocalContext.current
    val bitmap by produceState<ImageBitmap?>(null, file.path) {
        value = withContext(Dispatchers.IO) {
            runCatching { decodeImage(file.path)?.asImageBitmap() }.getOrNull()
        }
    }
    BoxWithConstraints(Modifier.fillMaxWidth()) {
        val bmp = bitmap
        if (bmp != null) {
            val ratio = bmp.width.toFloat() / bmp.height.coerceAtLeast(1)
            val width = minOf(maxWidth, 480.dp * ratio)
            val height = width / ratio
            Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                Image(bmp, file.name, Modifier.width(width).height(height).clip(shp(12.dp))
                    .clickable { openFile(ctx, file) }, contentScale = ContentScale.Fit)
            }
        } else {
            DocFileCard(file)
        }
    }
}

@Composable
private fun ArtifactWebView(file: Docs.FileRef, modifier: Modifier) {
    AndroidView(
        factory = { WebView(it).apply {
            val root = artifactWorkspaceRoot(File(file.path))
            val startUrl = artifactUrl(File(file.path), root)
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            if (android.os.Build.VERSION.SDK_INT >= 33) runCatching { settings.setAlgorithmicDarkeningAllowed(false) }
            settings.allowFileAccess = false
            settings.allowContentAccess = false
            settings.useWideViewPort = true
            settings.loadWithOverviewMode = true
            settings.setSupportZoom(false)
            settings.builtInZoomControls = false
            settings.displayZoomControls = false
            isHorizontalScrollBarEnabled = false
            isVerticalScrollBarEnabled = false
            overScrollMode = android.view.View.OVER_SCROLL_NEVER
            webViewClient = object : WebViewClient() {
                override fun onPageFinished(view: WebView, url: String?) {
                    super.onPageFinished(view, url)
                    view.evaluateJavascript(ARTIFACT_FIT_SCRIPT, null)
                }

                override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
                    val url = request.url
                    return if (url.host.equals(ARTIFACT_HOST, true)) artifactResponse(root, url) else null
                }

                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                    val url = request.url
                    if (url.host.equals(ARTIFACT_HOST, true)) return false
                    val local = loopbackArtifactUrl(url, root)
                    if (local != null) {
                        view.loadUrl(local)
                        return true
                    }
                    runCatching {
                        view.context.startActivity(Intent(Intent.ACTION_VIEW, url)
                            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                    }
                    return true
                }

                override fun onReceivedError(view: WebView, request: WebResourceRequest, error: android.webkit.WebResourceError) {
                    super.onReceivedError(view, request, error)
                    if (request.isForMainFrame) {
                        view.loadDataWithBaseURL(null, artifactErrorHtml(file.name, error.description.toString()),
                            "text/html", "UTF-8", null)
                    }
                }
            }
            setBackgroundColor(android.graphics.Color.WHITE)
            loadUrl(startUrl)
        } },
        update = { },
        modifier = modifier,
    )
}

private const val ARTIFACT_HOST = "newai.local"
private const val ARTIFACT_ORIGIN = "https://newai.local"

private fun artifactWorkspaceRoot(file: File): File {
    val marker = if (file.path.contains("/files/Codex/")) "/files/Codex/" else "/workspace/"
    val markerStart = file.path.indexOf(marker)
    if (markerStart >= 0) {
        val taskEnd = file.path.indexOf('/', markerStart + marker.length)
        if (taskEnd > markerStart + marker.length) return File(file.path.substring(0, taskEnd))
    }
    return file.parentFile ?: File("/")
}

private fun artifactUrl(file: File, root: File): String {
    val relative = runCatching { root.toURI().relativize(file.toURI()).path }
        .getOrNull().orEmpty().ifBlank { file.name }
    val encoded = relative.trimStart('/').split('/').joinToString("/") { Uri.encode(it) }
    return "$ARTIFACT_ORIGIN/$encoded"
}

private fun loopbackArtifactUrl(url: Uri, root: File): String? {
    val host = url.host?.lowercase(Locale.ROOT) ?: return null
    if (host != "127.0.0.1" && host != "localhost") return null
    val relative = Uri.decode(url.path.orEmpty()).trimStart('/')
    if (relative.isBlank() || !File(root, relative).isFile) return null
    val encoded = relative.split('/').joinToString("/") { Uri.encode(it) }
    return "$ARTIFACT_ORIGIN/$encoded"
}

private fun artifactResponse(root: File, url: Uri): WebResourceResponse {
    val relative = Uri.decode(url.path.orEmpty()).trimStart('/')
    val requested = runCatching { File(root, relative).canonicalFile }.getOrNull()
    val rootPath = runCatching { root.canonicalPath }.getOrDefault(root.absolutePath)
    if (relative.isBlank() || requested == null || !requested.isFile ||
        !requested.path.startsWith(rootPath + File.separator)) {
        return WebResourceResponse("text/html", "UTF-8", 404, "Not Found", emptyMap(),
            ByteArrayInputStream(artifactErrorHtml(relative.ifBlank { "Файл" }, "net::ERR_FILE_NOT_FOUND").toByteArray()))
    }
    val mime = artifactMime(requested.extension.lowercase())
    val textual = mime.startsWith("text/", true) || mime in setOf(
        "application/javascript", "application/json", "application/xml", "image/svg+xml",
    )
    return WebResourceResponse(mime, if (textual) "UTF-8" else null, requested.inputStream())
}

private fun artifactMime(extension: String): String = when (extension) {
    "html", "htm" -> "text/html"
    "css" -> "text/css"
    "js", "mjs" -> "application/javascript"
    "json" -> "application/json"
    "xml" -> "application/xml"
    "svg" -> "image/svg+xml"
    "png" -> "image/png"
    "jpg", "jpeg" -> "image/jpeg"
    "gif" -> "image/gif"
    "webp" -> "image/webp"
    "bmp" -> "image/bmp"
    "avif" -> "image/avif"
    "ico" -> "image/x-icon"
    "woff" -> "font/woff"
    "woff2" -> "font/woff2"
    "ttf" -> "font/ttf"
    "otf" -> "font/otf"
    else -> MimeTypeMap.getSingleton().getMimeTypeFromExtension(extension)
        ?: "application/octet-stream"
}

private fun artifactErrorHtml(name: String, reason: String): String {
    fun escape(value: String) = value.replace("&", "&amp;").replace("<", "&lt;")
        .replace(">", "&gt;").replace("\"", "&quot;")
    return """<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body{margin:0;height:100%;background:#f6f7fb;color:#26313f;font:15px system-ui,sans-serif}
body{display:grid;place-items:center;padding:24px;box-sizing:border-box}main{max-width:420px}
b{display:block;margin-bottom:8px;font-size:17px}code{color:#5b6878;word-break:break-all}</style></head>
<body><main><b>Не удалось показать ${escape(name)}</b><code>${escape(reason)}</code></main></body></html>"""
}

/** Компактная карточка выбранного файла: у изображений сразу видна миниатюра. */
@Composable
private fun PendingAttachment(file: Docs.FileRef, onRemove: () -> Unit) {
    CompactAttachment(file, width = 104.dp, thumbHeight = 76.dp, onRemove = onRemove)
}

@Composable
private fun SentAttachment(file: Docs.FileRef) {
    CompactAttachment(file, width = 148.dp, thumbHeight = 104.dp, onRemove = null)
}

@Composable
private fun CompactAttachment(
    file: Docs.FileRef,
    width: androidx.compose.ui.unit.Dp,
    thumbHeight: androidx.compose.ui.unit.Dp,
    onRemove: (() -> Unit)?,
) {
    val ctx = LocalContext.current
    Box(Modifier.width(width)) {
        Column(Modifier.fillMaxWidth().clip(shp(12.dp)).background(Card.copy(alpha = 0.92f))
            .border(1.dp, Line, shp(12.dp)).clickable { openFile(ctx, file) }) {
            Box(Modifier.fillMaxWidth().height(thumbHeight).background(AccentSoft), contentAlignment = Alignment.Center) {
                if (file.isImageArtifact() && file.path.isNotBlank()) {
                    val bitmap by produceState<ImageBitmap?>(null, file.path) {
                        value = withContext(Dispatchers.IO) {
                            runCatching { decodeImage(file.path, 640)?.asImageBitmap() }.getOrNull()
                        }
                    }
                    val bmp = bitmap
                    if (bmp != null) {
                        Image(bmp, file.name, Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
                    } else {
                        AttachmentBadge(file)
                    }
                } else {
                    AttachmentBadge(file)
                }
            }
            Text(file.name, style = body(11, FontWeight.SemiBold, Ink), maxLines = 1,
                overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(horizontal = 8.dp, vertical = 5.dp))
        }
        if (onRemove != null) {
            Box(Modifier.align(Alignment.TopEnd).padding(4.dp).size(21.dp).clip(CircleShape)
                .background(Color.Black.copy(alpha = 0.62f)).clickable(onClickLabel = "Удалить вложение", onClick = onRemove),
                contentAlignment = Alignment.Center) {
                Text("×", style = body(15, FontWeight.Bold, Color.White))
            }
        }
    }
}

@Composable
private fun AttachmentBadge(file: Docs.FileRef) {
    Box(Modifier.size(40.dp).clip(shp(10.dp)).background(Teal), contentAlignment = Alignment.Center) {
        Text(fileBadge(file.name), style = body(11, FontWeight.Bold, OnAccent))
    }
}

@Composable
private fun DocFileCard(file: Docs.FileRef) {
    val ctx = LocalContext.current
    Row(Modifier.fillMaxWidth().clip(shp(12.dp)).background(Card.copy(alpha = 0.7f))
        .clickable { openFile(ctx, file) }.padding(8.dp), verticalAlignment = Alignment.CenterVertically) {
        AttachmentBadge(file)
        Spacer(Modifier.width(10.dp))
        Text(file.name, style = body(13, FontWeight.SemiBold, Ink), maxLines = 2, overflow = TextOverflow.Ellipsis)
    }
}
