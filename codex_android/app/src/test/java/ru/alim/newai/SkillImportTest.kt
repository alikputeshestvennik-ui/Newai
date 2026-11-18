package ru.alim.newai

import org.junit.Assert.*
import org.junit.Test
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.nio.file.Files
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

class SkillImportTest {
    private val manifest = "---\nname: example-skill\ndescription: An example\n---\nInstructions\n"

    @Test fun importsStandaloneAndRefusesReplacement() {
        val dir = Files.createTempDirectory("skills-test").toFile()
        try {
            assertEquals(listOf("example-skill"), SkillImport.install(manifest.byteInputStream(), false, dir))
            assertEquals(manifest, dir.resolve("example-skill/SKILL.md").readText())
            assertTrue(runCatching { SkillImport.install(manifest.byteInputStream(), false, dir) }.isFailure)
            assertEquals(manifest, dir.resolve("example-skill/SKILL.md").readText())
        } finally { dir.deleteRecursively() }
    }

    private fun archive(vararg entries: Pair<String, String>): ByteArray {
        val output = ByteArrayOutputStream()
        ZipOutputStream(output).use { zip -> entries.forEach { (name, content) ->
            zip.putNextEntry(ZipEntry(name)); zip.write(content.toByteArray()); zip.closeEntry()
        } }
        return output.toByteArray()
    }

    @Test fun importsArchiveAndRejectsTraversal() {
        val dir = Files.createTempDirectory("skills-test").toFile()
        try {
            val zip = archive("folder/SKILL.md" to manifest, "folder/references/info.txt" to "info")
            SkillImport.install(ByteArrayInputStream(zip), true, dir)
            assertEquals("info", dir.resolve("example-skill/references/info.txt").readText())
            val bad = archive("../escape.txt" to "bad", "SKILL.md" to manifest)
            assertTrue(runCatching { SkillImport.install(ByteArrayInputStream(bad), true, dir) }.isFailure)
            assertFalse(dir.parentFile.resolve("escape.txt").exists())
        } finally { dir.deleteRecursively() }
    }

    @Test fun importsAllSkillsFromNestedArchive() {
        val dir = Files.createTempDirectory("skills-test").toFile()
        try {
            val zip = archive(
                "bundle/SKILL.md" to manifest,
                "bundle/references/info.txt" to "parent",
                "bundle/deeper/nested/SKILL.md" to manifest.replace("example-skill", "second-skill"),
                "bundle/deeper/nested/scripts/tool.txt" to "child",
            )
            assertEquals(listOf("example-skill", "second-skill"), SkillImport.install(zip.inputStream(), true, dir))
            assertEquals("parent", dir.resolve("example-skill/references/info.txt").readText())
            assertEquals("child", dir.resolve("second-skill/scripts/tool.txt").readText())
            assertFalse(dir.resolve("example-skill/deeper/nested/SKILL.md").exists())
        } finally { dir.deleteRecursively() }
    }

    @Test fun doesNotInstallAnythingWhenOneSkillConflicts() {
        val dir = Files.createTempDirectory("skills-test").toFile()
        try {
            SkillImport.install(manifest.byteInputStream(), false, dir)
            val zip = archive("one/SKILL.md" to manifest, "two/SKILL.md" to manifest.replace("example-skill", "other-skill"))
            assertTrue(runCatching { SkillImport.install(zip.inputStream(), true, dir) }.isFailure)
            assertEquals(listOf("example-skill"), dir.list()?.toList())
        } finally { dir.deleteRecursively() }
    }
}
