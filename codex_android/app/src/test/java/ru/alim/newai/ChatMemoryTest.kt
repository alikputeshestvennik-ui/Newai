package ru.alim.newai

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ChatMemoryTest {
    @Test fun appendsNotesAndIgnoresDuplicates() {
        val notes = appendMemoryNote("", "  Предпочитаю Kotlin  ")!!
        assertEquals("Предпочитаю Kotlin", notes)
        assertEquals(notes, appendMemoryNote(notes, "Предпочитаю Kotlin"))
        assertEquals("Предпочитаю Kotlin\nОтвечай коротко", appendMemoryNote(notes, "Отвечай коротко"))
    }

    @Test fun rejectsEmptyMultilineAndExcessNotesWithoutEvictingMemory() {
        assertNull(appendMemoryNote("saved", "   "))
        assertNull(appendMemoryNote("saved", "first\nsecond"))
        val full = "x".repeat(ChatMemory.LIMIT)
        assertEquals(full, appendMemoryNote("", full))
        assertNull(appendMemoryNote(full, "extra"))
    }

    @Test fun sharesOnlySavedNotesWithNewTasks() {
        val notes = "Use Kotlin"
        val firstChat = goalWithContext("First task", "Old conversation", notes, "Instructions")
        val newChat = goalWithContext("New task", "", notes, "Instructions")
        assertTrue(firstChat.contains(notes))
        assertTrue(newChat.contains(notes))
        assertFalse(newChat.contains("Old conversation"))
        assertFalse(goalWithContext("New task", "", "", "Instructions").contains("Память пользователя"))
    }

    @Test fun preservesTheTaskAndNewestHistoryWithinTheRuntimeLimit() {
        val task = "t".repeat(4500)
        val notes = "n".repeat(ChatMemory.LIMIT)
        val goal = goalWithContext(task, "old" + "h".repeat(10000) + "recent", notes, "Instructions")
        assertEquals(16000, goal.length)
        assertTrue(goal.contains(task))
        assertTrue(goal.contains(notes))
        assertFalse(goal.contains("old"))
        assertTrue(goal.endsWith("recent\n\nInstructions"))
    }
}
