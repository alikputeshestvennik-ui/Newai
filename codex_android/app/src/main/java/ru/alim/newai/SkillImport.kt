package ru.alim.newai

import java.io.File
import java.io.InputStream
import java.util.zip.ZipInputStream

/** Installs one skill without replacing existing skills or extracting outside staging. */
object SkillImport {
    private const val MAX_BYTES = 20 * 1024 * 1024
    private const val MAX_FILES = 500

    fun install(input: InputStream, isZip: Boolean, skillsDir: File): String {
        check(skillsDir.isDirectory || skillsDir.mkdirs()) { "Не удалось создать каталог скиллов" }
        val staging = kotlin.io.path.createTempDirectory(skillsDir.toPath(), ".import-").toFile()
        try {
            if (isZip) extract(input, staging) else {
                staging.resolve("SKILL.md").outputStream().use { copyLimited(input, it, MAX_BYTES.toLong()) }
            }
            val manifests = staging.walkTopDown().filter { it.isFile && it.name == "SKILL.md" }.toList()
            require(manifests.size == 1) { "Нужен один SKILL.md в файле или ZIP-архиве" }
            val manifest = manifests.single()
            require(manifest.length() <= 256 * 1024) { "SKILL.md слишком большой" }
            val text = manifest.readText(Charsets.UTF_8)
            val front = Regex("(?s)^\\uFEFF?---\\s*\\r?\\n(.*?)\\r?\\n---(?:\\s|$)").find(text)?.groupValues?.get(1)
                ?: error("В SKILL.md нет заголовка с name и description")
            fun field(key: String) = Regex("(?m)^$key:\\s*(.+)$").find(front)?.groupValues?.get(1)?.trim()?.trim('"', '\'')
            val name = field("name").orEmpty()
            require(Regex("[a-z0-9]+(?:-[a-z0-9]+)*").matches(name) && name.length <= 64) { "Некорректное имя скилла в SKILL.md" }
            require(!field("description").isNullOrBlank()) { "В SKILL.md отсутствует description" }
            val target = skillsDir.resolve(name)
            require(!target.exists()) { "Скилл «$name» уже существует" }
            check(manifest.parentFile.renameTo(target)) { "Не удалось сохранить скилл" }
            return name
        } finally {
            staging.deleteRecursively()
        }
    }

    private fun extract(input: InputStream, root: File) {
        var total = 0L
        var count = 0
        val rootPath = root.canonicalPath + File.separator
        ZipInputStream(input).use { zip ->
            while (true) {
                val entry = zip.nextEntry ?: break
                require(++count <= MAX_FILES) { "Слишком много файлов в архиве" }
                val target = root.resolve(entry.name)
                require(target.canonicalPath.startsWith(rootPath)) { "Недопустимый путь в архиве" }
                if (entry.isDirectory) {
                    check(target.isDirectory || target.mkdirs()) { "Не удалось распаковать архив" }
                } else {
                    check(!target.exists()) { "Повторяющийся файл в архиве" }
                    check(target.parentFile.isDirectory || target.parentFile.mkdirs()) { "Не удалось распаковать архив" }
                    target.outputStream().use { total += copyLimited(zip, it, MAX_BYTES - total) }
                }
                zip.closeEntry()
            }
        }
    }

    private fun copyLimited(input: InputStream, output: java.io.OutputStream, limit: Long): Long {
        val buffer = ByteArray(8192)
        var total = 0L
        while (true) {
            val n = input.read(buffer)
            if (n == -1) return total
            total += n
            require(total <= limit) { "Скилл слишком большой (максимум 20 МБ)" }
            output.write(buffer, 0, n)
        }
    }
}
