package ru.alim.newai

import android.content.Context
import android.os.Build
import java.io.File
import java.io.PrintWriter
import java.io.StringWriter
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** Saves uncaught Java/Kotlin exceptions locally for diagnosis after a restart. */
object CrashDiagnostics {
    private const val FILE_NAME = "startup-crash.txt"
    private var installed = false

    fun install(context: Context) {
        if (installed) return
        installed = true
        val app = context.applicationContext
        val previous = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { thread, error ->
            try {
                val trace = StringWriter().also { error.printStackTrace(PrintWriter(it)) }.toString()
                val timestamp = SimpleDateFormat("yyyy-MM-dd HH:mm:ss Z", Locale.US).format(Date())
                File(app.filesDir, FILE_NAME).writeText(
                    "Vibecoder startup crash\nTime: $timestamp\nAndroid: ${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT})\n" +
                    "Device: ${Build.MANUFACTURER} ${Build.MODEL}\nThread: ${thread.name}\n\n$trace"
                )
            } catch (_: Throwable) {
                // Never replace the original crash with a diagnostics failure.
            }
            if (previous != null) previous.uncaughtException(thread, error)
            else android.os.Process.killProcess(android.os.Process.myPid())
        }
    }

    fun read(context: Context): String? =
        runCatching { File(context.filesDir, FILE_NAME).takeIf { it.isFile }?.readText() }.getOrNull()

    fun clear(context: Context) {
        runCatching { File(context.filesDir, FILE_NAME).delete() }
    }
}
