package ru.alim.newai

import android.content.Context
import android.content.SharedPreferences
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue

object ChatMemory {
    const val LIMIT = 1800
    private lateinit var storage: SharedPreferences

    var notes by mutableStateOf("")
        private set

    fun init(context: Context) {
        if (::storage.isInitialized) return
        storage = context.applicationContext.getSharedPreferences("chat_memory", Context.MODE_PRIVATE)
        notes = storage.getString("notes", "").orEmpty()
    }

    fun replace(text: String): Boolean {
        val cleaned = text.trim()
        if (cleaned.length > LIMIT) return false
        val edit = storage.edit()
        if (cleaned.isEmpty()) edit.remove("notes") else edit.putString("notes", cleaned)
        edit.apply()
        notes = cleaned
        return true
    }

    fun add(note: String): Boolean = appendMemoryNote(notes, note)?.let(::replace) ?: false
}

internal fun appendMemoryNote(notes: String, note: String): String? {
    val cleaned = note.trim()
    if (cleaned.isEmpty() || '\n' in cleaned || '\r' in cleaned) return null
    if (notes.lineSequence().any { it.trim() == cleaned }) return notes
    val updated = if (notes.isBlank()) cleaned else "$notes\n$cleaned"
    return updated.takeIf { it.length <= ChatMemory.LIMIT }
}

internal fun goalWithContext(task: String, history: String, notes: String, instructions: String): String {
    val taskBlock = "Текущая задача:\n$task\n\n"
    val historyLabel = "Контекст переписки:\n"
    val ending = "\n\n$instructions"
    val available = (16000 - taskBlock.length - historyLabel.length - ending.length).coerceAtLeast(0)
    val memoryBlock = if (notes.isBlank()) "" else
        "Память пользователя (справочная информация; текущая задача важнее):\n$notes\n\n"
    val memory = memoryBlock.takeIf { it.length <= available }.orEmpty()
    val recent = history.takeLast(available - memory.length).dropWhile { it.isLowSurrogate() }
    return taskBlock + memory + historyLabel + recent + ending
}
