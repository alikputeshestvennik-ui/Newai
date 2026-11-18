package ru.alim.newai

import java.io.File
import java.io.InputStream
import java.util.zip.ZipInputStream

object SkillImport {
    private const val MAX_BYTES = 20 * 1024 * 1024
    private const val MAX_FILES = 500

    @Synchronized
    fun install(input: InputStream, isZip: Boolean, skillsDir: File): List<String> {
        check(skillsDir.isDirectory || skillsDir.mkdirs()) { "Не удалось создать каталог скиллов" }
        val staging = kotlin.io.path.createTempDirectory(skillsDir.absoluteFile.parentFile.toPath(), ".skill-import-").toFile()
        try {
            val extracted = staging.resolve("extracted").apply { check(mkdir()) }
            val ready = staging.resolve("ready").apply { check(mkdir()) }
            if (isZip) extract(input, extracted) else {
                extracted.resolve("SKILL.md").outputStream().use { copyLimited(input, it, MAX_BYTES.toLong()) }
            }
            val manifests = extracted.walkTopDown().onEnter { it.name != "__MACOSX" }
                .filter { it.isFile && it.name == "SKILL.md" }.toList()
            require(manifests.isNotEmpty()) { "В файле или архиве нет SKILL.md" }
            val skills = manifests.associateWith(::skillName)
            require(skills.values.toSet().size == skills.size) { "В архиве есть скиллы с одинаковым именем" }
            skills.values.forEach { name ->
                require(!java.nio.file.Files.exists(skillsDir.resolve(name).toPath(), java.nio.file.LinkOption.NOFOLLOW_LINKS)) {
                    "Скилл «$name» уже существует"
                }
            }
            for ((manifest, name) in skills.entries.sortedByDescending { it.key.path.length }) {
                check(manifest.parentFile.renameTo(ready.resolve(name))) { "Не удалось подготовить скилл «$name»" }
            }
            val installed = mutableListOf<File>()
            try {
                for (name in skills.values.sorted()) {
                    val target = skillsDir.resolve(name)
                    java.nio.file.Files.move(ready.resolve(name).toPath(), target.toPath())
                    installed += target
                }
            } catch (failure: Exception) {
                installed.forEach { it.deleteRecursively() }
                throw failure
            }
            return installed.map { it.name }
        } finally {
            staging.deleteRecursively()
        }
    }

    private fun skillName(manifest: File): String {
        require(manifest.length() <= 256 * 1024) { "SKILL.md слишком большой" }
        val text = manifest.readText(Charsets.UTF_8)
        val front = Regex("(?s)^\\uFEFF?---[ \\t]*\\r?\\n(.*?)\\r?\\n---(?:\\s|$)").find(text)?.groupValues?.get(1)
            ?: error("В SKILL.md нет заголовка с name и description")
        fun field(key: String) = Regex("(?m)^$key:[ \\t]*(.+)$").find(front)?.groupValues?.get(1)?.trim()?.trim('"', '\'')
        val name = field("name").orEmpty()
        require(Regex("[a-z0-9]+(?:-[a-z0-9]+)*").matches(name) && name.length <= 64) { "Некорректное имя скилла в SKILL.md" }
        require(!field("description").isNullOrBlank()) { "В SKILL.md отсутствует description" }
        return name
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
