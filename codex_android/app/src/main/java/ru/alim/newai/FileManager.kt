package ru.alim.newai

import android.Manifest
import android.content.Intent
import android.os.Environment
import android.webkit.MimeTypeMap
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.FileProvider
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.nio.file.Files
import java.nio.file.LinkOption.NOFOLLOW_LINKS
import java.nio.file.Path
import java.nio.file.SimpleFileVisitor
import java.nio.file.FileVisitResult
import java.nio.file.attribute.BasicFileAttributes
import java.io.IOException

@Composable
internal fun FileManagerCard() {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    var root by remember { mutableStateOf<File?>(null) }
    var folder by remember { mutableStateOf<File?>(null) }
    var entries by remember { mutableStateOf<List<File>>(emptyList()) }
    var generation by remember { mutableStateOf(0) }
    var message by remember { mutableStateOf("") }
    var working by remember { mutableStateOf(false) }
    var selected by remember { mutableStateOf<File?>(null) }
    var deleting by remember { mutableStateOf<File?>(null) }
    var editing by remember { mutableStateOf<File?>(null) }
    var createFolder by remember { mutableStateOf(false) }
    var name by remember { mutableStateOf("") }
    var openCodexFiles by rememberSaveable { mutableStateOf(false) }

    fun display(directory: File) {
        selected = null
        entries = emptyList()
        message = ""
        root = directory
        folder = directory
        generation++
    }

    fun openShared(codexFiles: Boolean) {
        if (codexFiles) {
            scope.launch {
                withContext(Dispatchers.IO) { runCatching { EmbeddedRuntime.sharedWorkspace(ctx) } }
                    .onSuccess { display(it) }.onFailure { message = it.message.orEmpty() }
            }
            return
        }
        @Suppress("DEPRECATION")
        val storage = Environment.getExternalStorageDirectory()
        display(storage)
    }

    val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) openShared(openCodexFiles) else message = "Нет разрешения на общие файлы телефона"
    }

    fun requestShared(codexFiles: Boolean) {
        if (EmbeddedRuntime.hasSharedStorageAccess(ctx)) openShared(codexFiles)
        else {
            openCodexFiles = codexFiles
            permission.launch(Manifest.permission.WRITE_EXTERNAL_STORAGE)
        }
    }

    fun change(action: () -> Unit) {
        working = true
        scope.launch {
            val result = withContext(Dispatchers.IO) { runCatching(action) }
            message = result.fold({ "Готово" }, { it.message.orEmpty().ifBlank { "Операция не выполнена" } })
            working = false
            generation++
        }
    }

    LaunchedEffect(folder, generation) {
        val directory = folder ?: return@LaunchedEffect
        val boundary = root ?: return@LaunchedEffect
        val result = withContext(Dispatchers.IO) {
            runCatching {
                ManagedFiles.checkFolder(boundary, directory)
                val files = directory.listFiles() ?: error("Android не разрешил читать эту папку")
                files.sortedWith(compareBy<File> { !ManagedFiles.isDirectory(it) }.thenBy { it.name.lowercase() })
            }
        }
        entries = result.getOrElse { message = it.message.orEmpty(); emptyList() }
    }

    CardBox {
        Text("Файлы", style = body(16, FontWeight.SemiBold))
        Text("Новые проекты сохраняются в CodexFiles во внутренней памяти телефона.",
            style = body(12, color = Muted), lineHeight = 16.sp)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            TextButton({ requestShared(true) }, enabled = !working) { Text("CodexFiles") }
            TextButton({
                scope.launch {
                    withContext(Dispatchers.IO) { runCatching { EmbeddedRuntime.workspace(ctx) } }
                        .onSuccess { display(it) }.onFailure { message = it.message.orEmpty() }
                }
            }, enabled = !working) { Text("Старые проекты") }
        }
        TextButton({ requestShared(false) }, enabled = !working) { Text("Память телефона") }
        val directory = folder
        val boundary = root
        if (directory != null && boundary != null) {
            Text(directory.path, style = body(11, color = Muted))
            Row(verticalAlignment = Alignment.CenterVertically) {
                TextButton({ selected = null; entries = emptyList(); folder = directory.parentFile },
                    enabled = directory != boundary && !working) { Text("Вверх") }
                TextButton({ generation++ }, enabled = !working) { Text("Обновить") }
                TextButton({ name = ""; createFolder = true }, enabled = !working) { Text("Новая папка") }
            }
            LazyColumn(Modifier.fillMaxWidth().heightIn(max = 320.dp)) {
                items(entries, key = { it.path }) { entry ->
                    Row(Modifier.fillMaxWidth().clickable(enabled = !working) {
                        if (ManagedFiles.isDirectory(entry)) {
                            selected = null
                            entries = emptyList()
                            folder = entry
                        } else selected = entry
                    }, verticalAlignment = Alignment.CenterVertically) {
                        Text(if (ManagedFiles.isDirectory(entry)) "${entry.name}/" else entry.name,
                            style = body(13), modifier = Modifier.weight(1f))
                        TextButton({ selected = entry }, enabled = !working) { Text("Действия") }
                    }
                }
            }
        }
        if (working) Text("Выполняю…", style = body(11, color = Muted))
        else if (message.isNotBlank()) Text(message, style = body(11, color = Muted))
    }

    selected?.let { entry ->
        AlertDialog(onDismissRequest = { selected = null }, title = { Text(entry.name) },
            text = { Column {
                if (entry.isFile && !Files.isSymbolicLink(entry.toPath())) TextButton({
                    selected = null
                    runCatching {
                        val boundary = checkNotNull(root)
                        ManagedFiles.checkFolder(boundary, entry.parentFile!!)
                        val uri = FileProvider.getUriForFile(ctx, ctx.packageName + ".files", entry)
                        val mime = MimeTypeMap.getSingleton().getMimeTypeFromExtension(entry.extension.lowercase()) ?: "application/octet-stream"
                        ctx.startActivity(Intent(Intent.ACTION_VIEW).setDataAndType(uri, mime)
                            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION))
                    }.onFailure { message = "Не удалось открыть файл" }
                }) { Text("Открыть") }
                TextButton({ selected = null; editing = entry; name = entry.name }) { Text("Переименовать") }
                TextButton({ selected = null; deleting = entry }) { Text("Удалить", color = Danger) }
            } }, confirmButton = { TextButton({ selected = null }) { Text("Закрыть") } })
    }

    deleting?.let { entry ->
        AlertDialog(onDismissRequest = { deleting = null }, title = { Text("Удалить без корзины?") },
            text = { Text("${entry.path}\nЕсли это папка, её содержимое тоже будет удалено.") },
            confirmButton = { TextButton({
                deleting = null
                val boundary = checkNotNull(root)
                change { ManagedFiles.delete(boundary, entry) }
            }) { Text("Удалить", color = Danger) } },
            dismissButton = { TextButton({ deleting = null }) { Text("Отмена") } })
    }

    if (createFolder || editing != null) {
        fun close() { editing = null; createFolder = false }
        AlertDialog(onDismissRequest = { close() }, title = { Text(if (createFolder) "Новая папка" else "Переименовать") },
            text = { OutlinedTextField(value = name, onValueChange = { name = it }, singleLine = true) },
            confirmButton = { TextButton({
                val source = editing
                val directory = checkNotNull(folder)
                val boundary = checkNotNull(root)
                val newName = name.trim()
                close()
                change { ManagedFiles.saveName(boundary, directory, source, newName) }
            }, enabled = name.isNotBlank()) { Text("Сохранить") } },
            dismissButton = { TextButton({ close() }) { Text("Отмена") } })
    }
}

internal object ManagedFiles {
    fun isDirectory(file: File): Boolean = Files.isDirectory(file.toPath(), NOFOLLOW_LINKS)

    fun checkFolder(root: File, directory: File) {
        val boundary = root.canonicalFile.toPath()
        val relative = directory.absoluteFile.toPath().normalize()
        val base = root.absoluteFile.toPath().normalize()
        require(relative.startsWith(base)) { "Папка вне разрешённой области" }
        require(directory.canonicalFile.toPath() == boundary.resolve(base.relativize(relative))) { "Переход по ссылке не разрешён" }
        check(directory.isDirectory) { "Папка недоступна" }
    }

    fun saveName(root: File, folder: File, source: File?, name: String) {
        require(name.isNotBlank() && name !in setOf(".", "..") && '/' !in name && '\u0000' !in name) { "Некорректное имя" }
        checkFolder(root, folder)
        val target = folder.resolve(name).toPath()
        if (source == null) Files.createDirectory(target)
        else {
            require(source.parentFile == folder) { "Файл вне текущей папки" }
            if (source.toPath() != target) Files.move(source.toPath(), target)
        }
    }

    fun delete(root: File, entry: File) {
        require(entry != root && entry.name !in setOf(".", "..")) { "Нельзя удалить корневую папку" }
        checkFolder(root, requireNotNull(entry.parentFile))
        Files.walkFileTree(entry.toPath(), object : SimpleFileVisitor<Path>() {
            override fun visitFile(file: Path, attrs: BasicFileAttributes): FileVisitResult {
                Files.delete(file)
                return FileVisitResult.CONTINUE
            }

            override fun postVisitDirectory(dir: Path, exc: IOException?): FileVisitResult {
                if (exc != null) throw exc
                Files.delete(dir)
                return FileVisitResult.CONTINUE
            }
        })
    }
}
