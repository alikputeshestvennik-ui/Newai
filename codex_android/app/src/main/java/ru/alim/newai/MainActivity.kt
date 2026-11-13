package ru.alim.newai

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.*

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Prefs.init(this); Conversation.init(this); ChatGptAccount.init(applicationContext)
        EmbeddedRuntime.startAsync(applicationContext)
        setContent { MaterialTheme { Surface(Modifier.fillMaxSize()) { NewAi() } } }
    }
    override fun onPause() { Conversation.save(); super.onPause() }
}

@Composable
private fun NewAi() {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    var settings by rememberSaveable { mutableStateOf(false) }
    var error by remember { mutableStateOf("") }
    Column(Modifier.fillMaxSize().systemBarsPadding().imePadding().padding(12.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("NewAI", style = MaterialTheme.typography.headlineMedium)
            TextButton(onClick = { settings = !settings }) { Text(if (settings) "Чат" else "Настройки") }
        }
        Text(EmbeddedRuntime.detail, style = MaterialTheme.typography.bodySmall)
        if (EmbeddedRuntime.state == EmbeddedRuntime.State.ERROR) TextButton(onClick = { EmbeddedRuntime.restart(ctx.applicationContext) }) { Text("Повторить запуск") }
        if (settings) { Settings(Modifier.weight(1f)); return@Column }
        TextButton(onClick = { Conversation.newChat() }, enabled = !Conversation.busy) { Text("Новый диалог") }
        LazyColumn(Modifier.weight(1f).fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(10.dp), reverseLayout = true) {
            items(Conversation.messages.toList().asReversed()) { message ->
                Card(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(12.dp)) {
                        Text(message.role, style = MaterialTheme.typography.labelMedium)
                        SelectionContainer { Text(message.text) }
                        message.files.forEach { file ->
                            TextButton(onClick = {
                                runCatching { ctx.startActivity(Intent(Intent.ACTION_SEND).setType(file.mime).putExtra(Intent.EXTRA_STREAM, file.uri)
                                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION).let { Intent.createChooser(it, file.name) }) }
                                    .onFailure { error = "Не удалось открыть файл: ${it.message}" }
                            }) { Text(file.name) }
                        }
                    }
                }
            }
        }
        if (Conversation.busy) {
            LinearProgressIndicator(Modifier.fillMaxWidth())
            Text(Conversation.progress.takeLast(400), maxLines = 4, style = MaterialTheme.typography.bodySmall)
            TextButton(onClick = { scope.launch {
                runCatching { withContext(Dispatchers.IO) { CodexGateway.cancel(ctx, Conversation.taskId) } }.onFailure { error = it.message.orEmpty() }
            } }) { Text("Остановить") }
        }
        if (error.isNotBlank()) Text(error, color = MaterialTheme.colorScheme.error)
        OutlinedTextField(Conversation.draft, { Conversation.draft = it.take(4000) }, Modifier.fillMaxWidth(), label = { Text("Задача для Codex") }, maxLines = 5)
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            CodexVoiceInput { Conversation.draft = (Conversation.draft + " " + it).trim().take(4000) }
            Button(enabled = !Conversation.busy && Conversation.draft.isNotBlank(), onClick = {
                runCatching {
                    ModelRouting.codexModel(Prefs.model)
                    ctx.startForegroundService(Intent(ctx, TaskService::class.java).putExtra("text", Conversation.draft))
                    error = ""
                }.onFailure { error = it.message.orEmpty() }
            }) { Text("Отправить") }
        }
    }
}

@Composable
private fun Settings(modifier: Modifier = Modifier) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    var model by remember { mutableStateOf(Prefs.model) }
    var address by remember { mutableStateOf(CodexGateway.customUrl(ctx)) }
    var customModel by remember { mutableStateOf(Prefs.compatibleModel) }
    var provider by remember { mutableStateOf("deepseek") }
    var key by remember { mutableStateOf("") }
    var github by remember { mutableStateOf("") }
    var customKey by remember { mutableStateOf("") }
    var status by remember { mutableStateOf("") }
    var signingIn by remember { mutableStateOf(false) }
    fun action(block: () -> Unit) { runCatching(block).onSuccess { status = "Сохранено" }.onFailure { status = it.message.orEmpty() } }
    Column(modifier.fillMaxWidth().verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("Модель", style = MaterialTheme.typography.titleLarge)
        Text("Укажи идентификатор с префиксом: chatgpt:, deepseek:, any: или compatible:.")
        OutlinedTextField(model, { model = it }, label = { Text("Провайдер:модель") }, modifier = Modifier.fillMaxWidth())
        Button(onClick = { action { Prefs.model = ModelRouting.codexModel(model) } }) { Text("Выбрать модель") }
        Text("ChatGPT", style = MaterialTheme.typography.titleLarge)
        Text(ChatGptAccount.email.ifBlank { "Аккаунт не подключён" })
        Row {
            TextButton(enabled = !signingIn, onClick = { signingIn = true; scope.launch {
                try { ChatGptAccount.signIn(ctx); status = ChatGptAccount.status }
                catch (e: Exception) { status = e.message.orEmpty() }
                finally { signingIn = false }
            } }) { Text("Войти") }
            TextButton(onClick = { if (signingIn) ChatGptAccount.cancel() else scope.launch { status = withContext(Dispatchers.IO) { ChatGptAccount.signOut() } } }) { Text(if (signingIn) "Отменить вход" else "Выйти") }
        }
        ChatGptAccount.models.forEach { id -> TextButton(onClick = { model = id; Prefs.model = id }) { Text(id) } }
        Text("Ключи провайдеров", style = MaterialTheme.typography.titleLarge)
        Text("DeepSeek также используется для диктовки. Ключи сохраняются на устройстве в зашифрованном хранилище.")
        Row {
            FilterChip(selected = provider == "deepseek", onClick = { provider = "deepseek"; key = "" }, label = { Text("DeepSeek") })
            Spacer(Modifier.width(8.dp))
            FilterChip(selected = provider == "any", onClick = { provider = "any"; key = "" }, label = { Text("AnyModel") })
        }
        SecretField(key, { key = it }, "API-ключ")
        Button(onClick = { action { CodexGateway.saveProviderToken(ctx, provider, key); key = "" } }) { Text("Сохранить ключ") }
        Text("Совместимый провайдер", style = MaterialTheme.typography.titleLarge)
        Text("HTTPS API с поддержкой Responses API.")
        OutlinedTextField(address, { address = it }, label = { Text("https://…/v1") }, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(customModel, { customModel = it }, label = { Text("Идентификатор модели") }, modifier = Modifier.fillMaxWidth())
        SecretField(customKey, { customKey = it }, "Ключ (пусто — оставить прежний)")
        Button(onClick = { action { CodexGateway.saveCustom(ctx, address, customKey, customModel); customKey = ""; model = "compatible:$customModel"; Prefs.model = model } }) { Text("Подключить") }
        Text("GitHub", style = MaterialTheme.typography.titleLarge)
        SecretField(github, { github = it }, "GitHub token")
        Button(onClick = { action { CodexGateway.saveGithubToken(ctx, github); github = "" } }) { Text("Сохранить / удалить пустым") }
        Text(status)
    }
}

@Composable
private fun SecretField(value: String, onChange: (String) -> Unit, title: String) {
    OutlinedTextField(value, onChange, Modifier.fillMaxWidth(), label = { Text(title) }, singleLine = true, visualTransformation = PasswordVisualTransformation())
}
