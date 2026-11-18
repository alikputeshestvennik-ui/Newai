package ru.alim.newai

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
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
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.rememberVectorPainter
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.PopupProperties
import kotlinx.coroutines.launch

data class CodexActivity(
    val running: Boolean = false,
    val progress: String = "",
    val answer: String = "",
    val clarification: CodexClarification? = null,
)

@Composable
private fun CodexBarButton(icon: ImageVector, label: String, size: Int = 40, onClick: () -> Unit) {
    Box(Modifier.size(size.dp).clip(circ).clickable(onClickLabel = label, onClick = onClick), contentAlignment = Alignment.Center) {
        Icon(rememberVectorPainter(icon), label, tint = Muted, modifier = Modifier.size(18.dp))
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun CodexTopBar(session: CodexSession, onSettings: () -> Unit, onDelete: () -> Unit) {
    val chats = Sessions.list
    val strip = rememberLazyListState()
    var renameTarget by remember { mutableStateOf<CodexSession?>(null) }
    LaunchedEffect(session.id, chats.size) {
        val index = chats.indexOfFirst { it.id == session.id }
        if (index >= 0) runCatching { strip.animateScrollToItem(index) }
    }
    Row(
        Modifier.fillMaxWidth().statusBarsPadding().padding(horizontal = 10.dp, vertical = 6.dp)
            .height(48.dp).clip(shp(24.dp)).background(Card.copy(alpha = 0.95f))
            .border(1.dp, Line, shp(24.dp)).padding(horizontal = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        LazyRow(
            Modifier.weight(1f).height(36.dp),
            state = strip,
            contentPadding = PaddingValues(horizontal = 2.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            items(chats, key = { it.id }) { chat ->
                val selected = chat.id == session.id
                Box(
                    Modifier.height(32.dp).clip(shp(16.dp))
                        .background(if (selected) AccentSoft else Color.Transparent)
                        .border(1.dp, if (selected) Teal.copy(alpha = 0.55f) else Color.Transparent, shp(16.dp))
                        .combinedClickable(
                            onClickLabel = "Открыть ${chat.name}",
                            onClick = { Sessions.open(chat.id) },
                            onLongClickLabel = "Переименовать ${chat.name}",
                            onLongClick = { renameTarget = chat },
                        )
                        .padding(horizontal = 10.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(chat.name, style = body(12, FontWeight.SemiBold, if (selected) Teal else Muted), maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
            item(key = "new-chat") {
                CodexBarButton(icPlus, "Новый диалог", 32) { Sessions.new() }
            }
        }
        CodexBarButton(icGear, "Настройки Вайбкодера", onClick = onSettings)
        CodexBarButton(icTrash, "Удалить диалог", onClick = onDelete)
    }

    renameTarget?.let { chat ->
        var draft by remember(chat.id) { mutableStateOf(chat.name) }
        AlertDialog(
            onDismissRequest = { renameTarget = null },
            title = { Text("Переименовать диалог") },
            text = {
                OutlinedTextField(draft, { draft = it.take(40) }, Modifier.fillMaxWidth(), singleLine = true,
                    label = { Text("Название") })
            },
            confirmButton = {
                TextButton({
                    val name = draft.trim()
                    if (name.isNotEmpty()) { chat.name = name; Sessions.save() }
                    renameTarget = null
                }) { Text("Сохранить", color = Teal) }
            },
            dismissButton = { TextButton({ renameTarget = null }) { Text("Отмена", color = Muted) } },
        )
    }
}

@Composable
fun CodexKeyboardBar(session: CodexSession) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    val providers = Providers.list
    val providerId = session.providerId.takeIf { Providers.find(it) != null }
        ?: Providers.defaultProvider(ctx).also { session.providerId = it }
    val provider = Providers.find(providerId)
    val models = Providers.choices(providerId)
    val autoModel = models.firstOrNull().orEmpty()
    val shownModel = session.model.takeIf { it.isNotBlank() } ?: autoModel
    var providerOpen by remember(session.id) { mutableStateOf(false) }
    var modelOpen by remember(session.id) { mutableStateOf(false) }
    var effortOpen by remember(session.id) { mutableStateOf(false) }

    LaunchedEffect(providerId, provider?.models?.size) {
        if (provider != null && provider.models.isEmpty() && !Providers.refreshing[providerId].orFalse()) {
            val key = runCatching { Providers.key(ctx, providerId) }.getOrDefault("")
            if (provider.kind == Providers.CHATGPT || key.isNotBlank()) Providers.refresh(ctx, providerId)
        }
    }

    fun loadModels(id: String = providerId) {
        scope.launch { Providers.refresh(ctx, id) }
    }

    val effort = session.reasoningEffort.ifBlank { "medium" }
    val effortLabel = when (effort) {
        "low" -> "Низкая"
        "high" -> "Высокая"
        else -> "Средняя"
    }

    Column(Modifier.fillMaxWidth().padding(bottom = 6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Box(Modifier.weight(0.75f)) {
                PickerButton(icProvider, provider?.name ?: "Провайдер", "Выбрать провайдера", Modifier.fillMaxWidth()) { providerOpen = true }
                DropdownMenu(providerOpen, { providerOpen = false }, modifier = Modifier.heightIn(max = 340.dp), shape = shp(16.dp),
                    containerColor = Card, properties = PopupProperties(focusable = false)) {
                    providers.forEach { item ->
                        val selected = item.id == providerId
                        DropdownMenuItem(
                            text = { Text(item.name, style = body(13, if (selected) FontWeight.SemiBold else FontWeight.Normal, if (selected) Teal else Ink)) },
                            trailingIcon = if (selected) ({ Text("✓", style = body(13, FontWeight.Bold, Teal)) }) else null,
                            onClick = {
                                session.providerId = item.id
                                session.model = Providers.firstRuntimeModel(item.id)
                                Sessions.save()
                                providerOpen = false
                                modelOpen = false
                                loadModels(item.id)
                            },
                        )
                    }
                    DropdownMenuItem(
                        text = { Text("+", style = body(15, FontWeight.Bold, Teal)) },
                        onClick = { providerOpen = false; AppNav.settingsOpen = true },
                    )
                }
            }
            Box(Modifier.weight(1.2f)) {
                PickerButton(icBrain, when {
                    shownModel.isBlank() -> "Нет моделей"
                    session.model.isBlank() -> "Авто · ${Providers.label(providerId, shownModel)}"
                    else -> Providers.label(providerId, shownModel)
                }, "Выбрать модель", Modifier.fillMaxWidth()) { modelOpen = true }
                DropdownMenu(modelOpen, { modelOpen = false }, modifier = Modifier.heightIn(max = 300.dp), shape = shp(16.dp),
                    containerColor = Card, properties = PopupProperties(focusable = false)) {
                    DropdownMenuItem(
                        text = { Text(if (autoModel.isBlank()) "Нет моделей" else "Авто · ${Providers.label(providerId, autoModel)}",
                            style = body(13, if (session.model.isBlank()) FontWeight.SemiBold else FontWeight.Normal,
                                if (session.model.isBlank()) Teal else Ink)) },
                        onClick = { session.model = ""; Sessions.save(); modelOpen = false },
                    )
                    models.forEach { id ->
                        val selected = id == session.model
                        DropdownMenuItem(
                            text = { Text(Providers.label(providerId, id), style = body(13, if (selected) FontWeight.SemiBold else FontWeight.Normal, if (selected) Teal else Ink)) },
                            trailingIcon = if (selected) ({ Text("✓", style = body(13, FontWeight.Bold, Teal)) }) else null,
                            onClick = { session.model = id; Sessions.save(); modelOpen = false },
                        )
                    }
                    DropdownMenuItem(text = { Text(if (Providers.refreshing[providerId].orFalse()) "Загружаю модели…" else "Обновить список моделей", style = body(13, color = Teal)) },
                        onClick = { loadModels(); modelOpen = false })
                }
            }
            Box(Modifier.weight(0.85f)) {
                PickerButton(icSpark, effortLabel, "Степень рассуждения", Modifier.fillMaxWidth()) { effortOpen = true }
                DropdownMenu(effortOpen, { effortOpen = false }, shape = shp(16.dp), containerColor = Card,
                    properties = PopupProperties(focusable = false)) {
                    listOf("low" to "Низкая", "medium" to "Средняя", "high" to "Высокая").forEach { (id, label) ->
                        val selected = id == effort
                        DropdownMenuItem(
                            text = { Text(label, style = body(13, if (selected) FontWeight.SemiBold else FontWeight.Normal, if (selected) Teal else Ink)) },
                            trailingIcon = if (selected) ({ Text("✓", style = body(13, FontWeight.Bold, Teal)) }) else null,
                            onClick = { session.reasoningEffort = id; Sessions.save(); effortOpen = false },
                        )
                    }
                }
            }
        }
        provider?.note?.takeIf { it.isNotBlank() }?.let { Text(it, style = body(11, color = Danger), maxLines = 2, overflow = TextOverflow.Ellipsis) }
    }
}

private fun Boolean?.orFalse() = this == true

/** Публичный статус и поток ответа без скрытых рассуждений. */
@Composable
fun CodexRunBubble(activity: CodexActivity) {
    AnimatedVisibility(
        visible = activity.running,
        enter = fadeIn(tween(180)) + expandVertically(tween(180)),
        exit = fadeOut(tween(140)) + shrinkVertically(tween(140)),
    ) {
        val answerScroll = rememberScrollState()
        LaunchedEffect(activity.answer) {
            if (activity.answer.isNotBlank()) answerScroll.animateScrollTo(answerScroll.maxValue)
        }
        Column(
            Modifier.fillMaxWidth().padding(bottom = 6.dp).clip(shp(12.dp))
                .background(Card).border(1.dp, Line, shp(12.dp)).padding(horizontal = 12.dp, vertical = 6.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                ThinkDots()
                Text(activity.progress.ifBlank { "Вайбкодер работает…" }, style = body(11, FontWeight.SemiBold, Teal), maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            if (activity.answer.isNotBlank()) {
                Column(
                    Modifier.fillMaxWidth().heightIn(max = 65.dp).verticalScroll(answerScroll),
                ) {
                    Text(activity.answer, style = body(13, color = Ink), lineHeight = 18.sp)
                }
            } else {
                Text("Модель выполняет задачу…", style = body(13, color = Muted), lineHeight = 18.sp)
            }
        }
    }
}
