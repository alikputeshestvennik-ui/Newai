package ru.alim.newai

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.Settings
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.rememberVectorPainter
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.platform.LocalClipboardManager
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.Job
import androidx.compose.ui.text.AnnotatedString
import java.text.DateFormat
import java.util.Date

@Composable
fun CodexSettingsScreen(back: () -> Unit) {
    val ctx = LocalCtx()
    val scope = rememberCoroutineScope()
    var adding by remember { mutableStateOf(false) }
    var status by remember { mutableStateOf("") }
    BackHandler { back() }

    Column(Modifier.fillMaxSize().background(Bg)) {
        Row(Modifier.fillMaxWidth().statusBarsPadding().padding(horizontal = 10.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(44.dp).clip(circ).clickable(onClickLabel = "Назад", onClick = back), contentAlignment = Alignment.Center) {
                Icon(rememberVectorPainter(icBack), "Назад", tint = Ink, modifier = Modifier.size(22.dp))
            }
            Text("Настройки Вайбкодера", style = body(18, FontWeight.Bold), modifier = Modifier.weight(1f))
        }
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = 14.dp).padding(bottom = 28.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)) {
            RuntimeCard()

            ToolsCard()

            SkillImportCard()

            ChatMemoryCard()

            FileManagerCard()

            OverlayCard()

            PermissionsCard()

            CardBox {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Провайдеры", style = body(16, FontWeight.SemiBold), modifier = Modifier.weight(1f))
                    TextButton({ adding = true }) { Text("Добавить", color = Teal) }
                }
                Text("Модели загружаются автоматически из API каждого провайдера.",
                    style = body(12, color = Muted), lineHeight = 16.sp)
                Providers.list.forEach { provider ->
                    ProviderSettings(provider)
                }
                if (status.isNotBlank()) Text(status, style = body(12, color = Muted))
            }

            ChatGptCard()

            CardBox {
                Text("Новые сообщения во время задачи", style = body(16, FontWeight.SemiBold))
                Text("Что делать, если написать, пока Codex ещё работает.", style = body(12, color = Muted))
                var follow by remember { mutableStateOf(Prefs.followUp) }
                Seg(listOf("queue" to "В очередь", "interrupt" to "Перебить"), follow) { value ->
                    follow = value
                    Prefs.followUp = value
                }
                Text(if (follow == "interrupt") "Текущая задача остановится, и Codex сразу возьмётся за новое сообщение."
                    else "Текущая задача продолжится, а новое сообщение Codex возьмёт сразу после неё.",
                    style = body(12, color = Muted), lineHeight = 16.sp)
            }

            CardBox {
                Text("GitHub", style = body(16, FontWeight.SemiBold))
                Text(if (CodexGateway.githubTokenConfigured(ctx)) "Токен уже подключён из сборки или настроек. Новый ключ заменит его."
                    else "Токен нужен для работы с репозиториями, PR и issues. Хранится зашифрованным на телефоне.",
                    style = body(12, color = Muted), lineHeight = 16.sp)
                var github by remember { mutableStateOf("") }
                var ghStatus by remember { mutableStateOf("") }
                SecretField(github, { github = it }, "GitHub token")
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    BigButton("Сохранить", {
                        ghStatus = runCatching {
                            CodexGateway.saveGithubToken(ctx, github)
                            github = ""
                            "Сохранено"
                        }.getOrElse { it.message ?: "Ошибка" }
                    }, modifier = Modifier.weight(1f))
                    BigButton("Удалить", {
                        CodexGateway.saveGithubToken(ctx, "")
                        github = ""
                        ghStatus = "Удалено"
                    }, bg = Card, fg = Ink, border = Line, modifier = Modifier.weight(1f))
                }
                if (ghStatus.isNotBlank()) Text(ghStatus, style = body(12, color = Muted))
            }

            Text("Вайбкодер работает на телефоне: Python, Git, GitHub CLI, ripgrep, архивы и файлы доступны без Termux.",
                style = body(12, color = Muted), lineHeight = 17.sp)
        }
    }

    if (adding) AddProviderDialog(onClose = { adding = false }, onStatus = { status = it })
}

@Composable
private fun ChatMemoryCard() {
    val saved = ChatMemory.notes
    var draft by remember(saved) { mutableStateOf(saved) }
    val edited = draft.trim()
    CardBox {
        Text("Память между чатами", style = body(16, FontWeight.SemiBold))
        Text("Добавляй заметки здесь или командой /запомни в чате. Память хранится на этом устройстве и отправляется выбранной модели с каждой задачей. Не добавляй пароли и ключи.",
            style = body(12, color = Muted), lineHeight = 16.sp)
        OutlinedTextField(
            value = draft,
            onValueChange = { draft = it },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Что нужно помнить") },
            supportingText = { Text("${edited.length} / ${ChatMemory.LIMIT}") },
            isError = edited.length > ChatMemory.LIMIT,
            minLines = 2,
            maxLines = 5,
        )
        TextButton(
            onClick = { ChatMemory.replace(edited) },
            enabled = edited != saved && edited.length <= ChatMemory.LIMIT,
        ) { Text(if (edited.isEmpty() && saved.isNotEmpty()) "Очистить память" else "Сохранить") }
    }
}

@Composable
private fun SkillImportCard() {
    val ctx = LocalCtx()
    val scope = rememberCoroutineScope()
    var status by remember { mutableStateOf("") }
    var importing by remember { mutableStateOf(false) }
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) {
            importing = true
            scope.launch {
                status = withContext(Dispatchers.IO) {
                    runCatching {
                        val resolver = ctx.contentResolver
                        val name = resolver.query(uri, arrayOf(android.provider.OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
                            if (cursor.moveToFirst()) cursor.getString(0) else null
                        }.orEmpty()
                        resolver.openInputStream(uri)?.buffered()?.use { input ->
                            input.mark(4)
                            val archiveHeader = input.read() == 0x50 && input.read() == 0x4b
                            input.reset()
                            val zip = archiveHeader || name.endsWith(".zip", ignoreCase = true) || resolver.getType(uri) == "application/zip"
                            SkillImport.install(input, zip, EmbeddedRuntime.skillsDirectory(ctx))
                        } ?: error("Не удалось открыть файл")
                    }.fold({ "Импортировано: ${it.joinToString(", ")}. Скиллы доступны в новых задачах Codex." }, { it.message ?: "Не удалось импортировать скиллы" })
                }
                importing = false
            }
        }
    }
    CardBox {
        Text("Скиллы", style = body(16, FontWeight.SemiBold))
        Text("Добавьте SKILL.md или ZIP с несколькими скиллами в любых вложенных папках. Импортируйте только архивы из доверенных источников: скиллы могут содержать инструкции и скрипты.", style = body(12, color = Muted), lineHeight = 16.sp)
        if (!importing) BigButton("Импортировать скиллы", { picker.launch(arrayOf("*/*")) })
        else Text("Импортирую…", style = body(12, color = Muted))
        if (status.isNotBlank()) Text(status, style = body(12, color = Muted))
    }
}

@Composable
private fun LocalCtx() = androidx.compose.ui.platform.LocalContext.current

@Composable
private fun PermissionsCard() {
    val ctx = LocalCtx()
    val mic = ContextCompat.checkSelfPermission(ctx, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
    val overlay = Settings.canDrawOverlays(ctx)
    val micRequest = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { }
    val overlayRequest = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { }
    CardBox {
        Text("Разрешения", style = body(16, FontWeight.SemiBold))
        Text("Микрофон нужен для диктовки, а окно поверх приложений — для компактного статуса Вайбкодера.",
            style = body(12, color = Muted), lineHeight = 16.sp)
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(if (mic) "Микрофон: разрешён" else "Микрофон: не разрешён",
                style = body(13, color = if (mic) Teal else Amber), modifier = Modifier.weight(1f))
            if (!mic) TextButton({ micRequest.launch(Manifest.permission.RECORD_AUDIO) }) { Text("Разрешить", color = Teal) }
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(if (overlay) "Поверх приложений: разрешено" else "Поверх приложений: не разрешено",
                style = body(13, color = if (overlay) Teal else Amber), modifier = Modifier.weight(1f))
            if (!overlay) TextButton({
                runCatching {
                    overlayRequest.launch(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                        Uri.parse("package:${ctx.packageName}")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                }
            }) { Text("Открыть", color = Teal) }
        }
    }
}

@Composable
private fun RuntimeCard() {
    val ctx = LocalCtx()
    val state = EmbeddedRuntime.state
    val accent = when (state) {
        EmbeddedRuntime.State.READY -> Teal
        EmbeddedRuntime.State.ERROR -> Danger
        EmbeddedRuntime.State.PREPARING, EmbeddedRuntime.State.DOWNLOADING, EmbeddedRuntime.State.STARTING -> Amber
        EmbeddedRuntime.State.OFF -> Muted
    }
    val title = when (state) {
        EmbeddedRuntime.State.READY -> "Готово"
        EmbeddedRuntime.State.ERROR -> "Ошибка"
        EmbeddedRuntime.State.PREPARING -> "Подготовка"
        EmbeddedRuntime.State.DOWNLOADING -> "Загрузка Codex"
        EmbeddedRuntime.State.STARTING -> "Запуск"
        EmbeddedRuntime.State.OFF -> "Не запущено"
    }
    CardBox {
        Text("Локальное окружение", style = body(16, FontWeight.SemiBold))
        Text("$title · ${EmbeddedRuntime.detail}", style = body(12, color = accent))
        if (state in setOf(EmbeddedRuntime.State.PREPARING, EmbeddedRuntime.State.DOWNLOADING, EmbeddedRuntime.State.STARTING)) {
            LinearProgressIndicator(progress = { EmbeddedRuntime.progress }, modifier = Modifier.fillMaxWidth().height(6.dp), color = Teal)
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            BigButton(if (state == EmbeddedRuntime.State.READY) "Перезапустить" else "Запустить окружение", {
                if (state == EmbeddedRuntime.State.READY) EmbeddedRuntime.restart(ctx) else EmbeddedRuntime.startAsync(ctx)
            }, modifier = Modifier.weight(1f))
            if (state == EmbeddedRuntime.State.READY || state == EmbeddedRuntime.State.ERROR) {
                BigButton("Остановить", { EmbeddedRuntime.stop() }, bg = Card, fg = Ink, border = Line, modifier = Modifier.weight(1f))
            }
        }
        Text("Первый запуск распаковывает Linux, ставит Python и Git и скачивает Codex. Дальше окружение поднимается само.",
            style = body(11, color = Muted), lineHeight = 15.sp)
    }
}

@Composable
private fun ToolsCard() {
    val ctx = LocalCtx()
    CardBox {
        Text("Программы и инструменты", style = body(16, FontWeight.SemiBold))
        Text("Установить или восстановить Python и pip, Node.js и npm, FFmpeg, Git, GitHub CLI, ripgrep, jq, zip, unzip, curl, wget, SSH и make. Инструменты будут доступны в задачах Codex.",
            style = body(12, color = Muted), lineHeight = 16.sp)
        if (EmbeddedRuntime.state == EmbeddedRuntime.State.READY) {
            BigButton("Установить инструменты", { EmbeddedRuntime.installToolsAsync(ctx) })
        } else {
            Text("Кнопка появится после запуска локального окружения.", style = body(11, color = Muted))
        }
    }
}

@Composable
private fun OverlayCard() {
    val ctx = LocalCtx()
    var enabled by remember { mutableStateOf(Prefs.floatingOverlay) }
    var status by remember { mutableStateOf("") }
    val request = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) {
        if (Prefs.floatingOverlay && Settings.canDrawOverlays(ctx)) {
            enabled = true
            status = "Разрешение получено"
            if (Sessions.current.busy) CodexOverlayService.start(ctx, Sessions.current.taskId, Sessions.current.id)
        } else if (Prefs.floatingOverlay) {
            Prefs.floatingOverlay = false
            enabled = false
            status = "Разреши «Поверх других приложений» в настройках Android"
        }
    }
    CardBox {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text("Плавающее окно", style = body(16, FontWeight.SemiBold))
                Text("Публичный статус и промежуточный ответ поверх других приложений.", style = body(11, color = Muted), lineHeight = 15.sp)
            }
            Toggle(enabled) { on ->
                enabled = on
                Prefs.floatingOverlay = on
                status = ""
                if (!on) {
                    CodexOverlayService.stop(ctx)
                } else if (!Settings.canDrawOverlays(ctx)) {
                    runCatching {
                        request.launch(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                            Uri.parse("package:${ctx.packageName}")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                    }.onFailure {
                        Prefs.floatingOverlay = false
                        enabled = false
                        status = it.message ?: "Не удалось открыть разрешение"
                    }
                } else if (Sessions.current.busy) {
                    CodexOverlayService.start(ctx, Sessions.current.taskId, Sessions.current.id)
                }
            }
        }
        Text(if (enabled) "Окно появится, когда приложение свёрнуто, и скроется при возврате." else "Выключено",
            style = body(11, color = if (enabled) Teal else Muted))
        if (status.isNotBlank()) Text(status, style = body(11, color = Muted))
    }
}

@Composable
private fun ProviderSettings(provider: Provider) {
    val ctx = LocalCtx()
    val scope = rememberCoroutineScope()
    var key by remember(provider.id) { mutableStateOf("") }
    var name by remember(provider.id, provider.name) { mutableStateOf(provider.name) }
    var base by remember(provider.id, provider.baseUrl) { mutableStateOf(provider.baseUrl) }
    var status by remember(provider.id) { mutableStateOf("") }
    val hasKey = runCatching { Providers.key(ctx, provider.id) }.getOrDefault("").isNotBlank()
    val refreshing = Providers.refreshing[provider.id] == true

    LaunchedEffect(provider.id, provider.models.size) {
        if (provider.models.isEmpty() && !refreshing && provider.kind != Providers.CHATGPT && hasKey) {
            Providers.refresh(ctx, provider.id)
        }
    }

    Column(Modifier.fillMaxWidth().padding(top = 10.dp), verticalArrangement = Arrangement.spacedBy(7.dp)) {
        Box(Modifier.fillMaxWidth().height(1.dp).background(Line))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(provider.name, style = body(14, FontWeight.SemiBold))
                Text(when {
                    refreshing -> "Загружаю модели…"
                    provider.kind == Providers.CHATGPT && CodexAccount.account == null -> "Требуется вход"
                    provider.models.isNotEmpty() -> "Моделей: ${provider.models.size}"
                    hasKey -> "Модели ещё не загружены"
                    else -> "Ключ не добавлен"
                }, style = body(11, color = if (provider.note.isNotBlank()) Danger else Muted))
            }
            Box(Modifier.size(36.dp).clip(circ).clickable { scope.launch { Providers.refresh(ctx, provider.id) } }, contentAlignment = Alignment.Center) {
                Icon(rememberVectorPainter(icRefresh), "Обновить модели", tint = if (refreshing) Muted else Teal, modifier = Modifier.size(18.dp))
            }
            if (!provider.builtIn) {
                Box(Modifier.size(36.dp).clip(circ).clickable { Providers.deleteCustom(provider.id); status = "Провайдер удалён" }, contentAlignment = Alignment.Center) {
                    Icon(rememberVectorPainter(icTrash), "Удалить провайдера", tint = Muted, modifier = Modifier.size(18.dp))
                }
            }
        }
        if (!provider.builtIn) {
            OutlinedTextField(name, { name = it; status = "" }, Modifier.fillMaxWidth(), label = { Text("Название") }, singleLine = true)
            OutlinedTextField(base, { base = it; status = "" }, Modifier.fillMaxWidth(), label = { Text("Базовый HTTPS-адрес, например https://api.example.com/v1") }, singleLine = true)
        } else if (provider.kind != Providers.CHATGPT) {
            Text("API: ${provider.baseUrl}", style = body(11, color = Muted), maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        if (provider.kind != Providers.CHATGPT) {
            SecretField(key, { key = it; status = "" }, if (hasKey) "Новый ключ (пусто — оставить прежний)" else "API-ключ")
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                BigButton(if (provider.builtIn) "Сохранить ключ и загрузить модели" else "Сохранить и загрузить модели", {
                    scope.launch {
                        status = "Сохраняю…"
                        runCatching {
                            if (provider.builtIn) Providers.saveKey(ctx, provider.id, key)
                            else Providers.updateCustom(ctx, provider.id, name, base, key)
                            Providers.refresh(ctx, provider.id).getOrThrow().size
                        }.onSuccess {
                            key = ""
                            status = "Сохранено · моделей: $it"
                        }.onFailure {
                            status = it.message ?: "Не удалось загрузить модели"
                        }
                    }
                }, bg = Card, fg = Ink, border = Line, modifier = Modifier.weight(1f))
            }
        } else {
            val account = CodexAccount.account
            Text(if (account != null) "Вход выполнен${if (account.email.isBlank()) "" else " · ${account.email}"}" else "Войди в ChatGPT ниже — модели подтянутся сами.",
                style = body(11, color = if (account != null) Muted else Amber))
        }
        if (provider.note.isNotBlank()) Text(provider.note, style = body(11, color = Danger), lineHeight = 15.sp)
        if (status.isNotBlank()) Text(status, style = body(11, color = Muted))
    }
}

@Composable
private fun ChatGptCard() {
    val ctx = LocalCtx()
    val scope = rememberCoroutineScope()
    val clipboard = LocalClipboardManager.current
    var busy by remember { mutableStateOf(false) }
    var loginJob by remember { mutableStateOf<Job?>(null) }
    var code by remember { mutableStateOf<CodexAccount.DeviceCode?>(null) }
    var status by remember { mutableStateOf("") }
    var limits by remember { mutableStateOf<ChatGptUsage.Limits?>(null) }
    var loadingLimits by remember { mutableStateOf(false) }
    var limitsError by remember { mutableStateOf("") }
    val account = CodexAccount.account
    var updatedAt by remember { mutableStateOf<Long?>(null) }
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    var active by remember { mutableStateOf(lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)) }
    DisposableEffect(lifecycle) {
        val observer = LifecycleEventObserver { _, _ ->
            active = lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)
        }
        lifecycle.addObserver(observer)
        onDispose { lifecycle.removeObserver(observer) }
    }
    LaunchedEffect(account, active) {
        if (account != null && active) {
            while (true) {
                loadingLimits = true
                try {
                    limits = CodexAccount.limits(ctx)
                    updatedAt = System.currentTimeMillis()
                    limitsError = ""
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    limitsError = e.message ?: "Не удалось получить лимиты ChatGPT"
                } finally {
                    loadingLimits = false
                }
                delay(60_000)
            }
        }
    }
    CardBox {
        Text("ChatGPT", style = body(16, FontWeight.SemiBold))
        Text(if (account != null) "Подключён${if (account.email.isBlank()) "" else " · ${account.email}"}"
            else "Вход через Codex по одноразовому коду, без API-ключа.", style = body(12, color = if (account != null) Muted else Amber))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            if (account == null || loginJob != null) BigButton(if (loginJob != null) "Отменить вход" else "Войти", {
                if (loginJob != null) { loginJob?.cancel(); status = "Вход отменён" }
                else loginJob = scope.launch {
                    busy = true
                    status = "Запрашиваю код входа…"
                    try {
                        CodexAccount.signIn(ctx) { device -> withContext(Dispatchers.Main) {
                            code = device
                            status = "Открой страницу OpenAI, введи код и вернись сюда."
                        } }
                        ctx.deleteSharedPreferences("chatgpt_account")
                        status = "Вход выполнен"
                        Providers.refresh(ctx, "codex")
                    } catch (e: CancellationException) {
                        throw e
                    } catch (e: Exception) {
                        status = e.message ?: "Не удалось войти"
                    } finally { busy = false; code = null; loginJob = null }
                }
            }, modifier = Modifier.weight(1f))
            if (account != null) TextButton({ scope.launch {
                busy = true
                try {
                    CodexAccount.signOut(ctx)
                    Providers.resetCodexModels()
                    limits = null
                    updatedAt = null
                    limitsError = ""
                    status = "Выход выполнен"
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    status = e.message ?: "Не удалось выйти"
                } finally { busy = false }
            } }, enabled = !busy) { Text("Выйти", color = Muted) }
        }
        code?.let { device ->
            Text(device.value, style = body(20, FontWeight.Bold))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                TextButton({ clipboard.setText(AnnotatedString(device.value)) }) { Text("Копировать код") }
                TextButton({
                    runCatching { ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(device.url))) }
                        .onFailure { status = "Не удалось открыть браузер: ${device.url}" }
                }) { Text("Открыть OpenAI") }
            }
            Text("Если OpenAI не принимает код, проверь, включён ли вход по коду устройства в настройках безопасности ChatGPT.", style = body(11, color = Muted))
        }
        if (account != null) {
            Column(Modifier.fillMaxWidth().clip(shp(14.dp)).background(Bg).padding(14.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                        Text("Лимиты подписки", style = body(14, FontWeight.SemiBold), modifier = Modifier.weight(1f))
                        Text(if (loadingLimits) "Обновляем…" else "Каждую минуту", style = body(10, color = Muted))
                    }
                    limits?.let {
                        UsageWindow("5 часов", it.fiveHours)
                        UsageWindow("Неделя", it.week)
                    } ?: if (limitsError.isBlank()) {
                        Text("Загружаем данные…", style = body(12, color = Muted))
                    } else Unit
                    updatedAt?.let {
                        Text("Обновлено: ${DateFormat.getTimeInstance(DateFormat.SHORT).format(Date(it))}",
                            style = body(10, color = Muted))
                    }
                }
            if (limitsError.isNotBlank()) Text("$limitsError · повторим автоматически", style = body(11, color = Danger))
        }
        if (status.isNotBlank()) Text(status, style = body(11, color = Muted), lineHeight = 15.sp)
    }
}

@Composable
private fun UsageWindow(title: String, window: ChatGptUsage.Window?) {
    val reset = window?.resetAt?.let {
        DateFormat.getDateTimeInstance(DateFormat.SHORT, DateFormat.SHORT).format(Date(it * 1000))
    }
    Column(verticalArrangement = Arrangement.spacedBy(5.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text(title, style = body(12, FontWeight.SemiBold), modifier = Modifier.weight(1f))
            Text(if (window == null) "Нет данных" else "Использовано ${window.usedPercent}%",
                style = body(12, color = Muted))
        }
        if (window != null) {
            LinearProgressIndicator(progress = { window.usedPercent / 100f },
                modifier = Modifier.fillMaxWidth().height(6.dp).clip(shp(3.dp)),
                color = if (window.usedPercent >= 90) Danger else Teal, trackColor = Line)
            if (reset != null) Text("Сброс: $reset", style = body(11, color = Muted))
        }
    }
}

@Composable
private fun AddProviderDialog(onClose: () -> Unit, onStatus: (String) -> Unit) {
    val ctx = LocalCtx()
    val scope = rememberCoroutineScope()
    var name by remember { mutableStateOf("") }
    var base by remember { mutableStateOf("") }
    var key by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = { if (!busy) onClose() },
        title = { Text("Новый провайдер") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(name, { name = it }, Modifier.fillMaxWidth(), label = { Text("Название, например OpenRouter") }, singleLine = true)
                OutlinedTextField(base, { base = it }, Modifier.fillMaxWidth(), label = { Text("https://api.example.com/v1") }, singleLine = true)
                OutlinedTextField(key, { key = it }, Modifier.fillMaxWidth(), label = { Text("API-ключ") }, singleLine = true,
                    visualTransformation = PasswordVisualTransformation())
                Text("Нужен OpenAI-совместимый GET /models. NVIDIA использует Chat Completions, остальные провайдеры — Responses API.",
                    style = body(11, color = Muted), lineHeight = 15.sp)
                if (error.isNotBlank()) Text(error, style = body(12, color = Danger))
            }
        },
        confirmButton = {
            TextButton(enabled = !busy, onClick = {
                scope.launch {
                    busy = true
                    error = ""
                    var added: Provider? = null
                    runCatching {
                        added = Providers.addCustom(ctx, name, base, key)
                        val models = Providers.refresh(ctx, added!!.id).getOrThrow()
                        val session = Sessions.current
                        session.providerId = added!!.id
                        session.model = Providers.firstRuntimeModel(added!!.id)
                        Sessions.save()
                        models.size
                    }.onSuccess { count ->
                        onStatus("Провайдер ${added?.name}: моделей $count")
                        busy = false
                        onClose()
                    }.onFailure { e ->
                        added?.let { Providers.deleteCustom(it.id) }
                        error = e.message ?: "Не удалось подключить провайдера"
                        busy = false
                    }
                }
            }) { Text(if (busy) "Подключаю…" else "Подключить", color = Teal) }
        },
        dismissButton = { TextButton(enabled = !busy, onClick = onClose) { Text("Отмена", color = Muted) } },
    )
}
