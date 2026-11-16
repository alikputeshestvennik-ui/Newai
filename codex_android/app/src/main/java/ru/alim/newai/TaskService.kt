package ru.alim.newai

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class TaskService : Service() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private var wakeLock: PowerManager.WakeLock? = null
    private val work = linkedMapOf<String, Job>()
    private var latestStartId = 0

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        latestStartId = startId
        val sessionId = intent?.getStringExtra("session").orEmpty()
        val text = intent?.getStringExtra("text").orEmpty().trim()
        val files = Docs.fromJson(runCatching {
            org.json.JSONArray(intent?.getStringExtra("files").orEmpty())
        }.getOrNull())
        val session = Sessions.find(sessionId)
        if (session == null || (text.isBlank() && files.isEmpty())) {
            if (work.isEmpty()) stopSelfResult(startId)
            return START_NOT_STICKY
        }

        if (session.busy) {
            session.pending = text
            session.pendingFiles = files
            Sessions.save()
            if (Prefs.followUp == "interrupt") {
                scope.launch(Dispatchers.IO) { runCatching { CodexGateway.cancel(applicationContext, session.taskId) } }
            }
            startForegroundNow(session, work.size.coerceAtLeast(1))
            return START_NOT_STICKY
        }
        startForegroundNow(session, work.size + 1)
        acquireWakeLock()
        session.busy = true
        work[session.id] = scope.launch { runSession(session, text, files) }
        return START_NOT_STICKY
    }

    private fun startForegroundNow(session: CodexSession, activeTasks: Int) {
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(NotificationChannel("tasks", "Задачи Вайбкодера", NotificationManager.IMPORTANCE_LOW))
        val open = PendingIntent.getActivity(this, 0,
            Intent(this, MainActivity::class.java).putExtra("session", session.id),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        startForeground(1, NotificationCompat.Builder(this, "tasks")
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(if (activeTasks > 1) "Вайбкодер · задач: $activeTasks" else "Вайбкодер · Codex работает")
            .setContentText(session.name)
            .setContentIntent(open).setOngoing(true).build())
    }

    private fun acquireWakeLock() {
        if (wakeLock?.isHeld == true) return
        wakeLock = getSystemService(PowerManager::class.java)
            .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Vibecoder:task")
            .also { it.acquire(40 * 60_000L) }
    }

    private suspend fun runSession(session: CodexSession, first: String, firstFiles: List<Docs.FileRef>) {
        var next: String? = first
        var nextFiles = firstFiles
        try {
            while ((!next.isNullOrBlank() || nextFiles.isNotEmpty()) && scope.isActive) {
                val text = next.orEmpty()
                val files = nextFiles
                next = null
                nextFiles = emptyList()
                session.pending = ""
                session.pendingFiles = emptyList()
                val providerId = session.providerId.ifBlank { Providers.defaultProvider(this) }
                val provider = Providers.find(providerId)
                val model = session.model.ifBlank { Providers.firstRuntimeModel(providerId) }
                if (provider == null || model.isBlank()) {
                    session.messages += Message(role = "system", text = "Сначала добавь провайдера и загрузи модели в настройках Вайбкодера.")
                    break
                }
                session.providerId = providerId
                session.model = model
                session.messages += Message(role = "me", text = text, files = files)
                session.draft = ""
                Sessions.save()
                val goal = Sessions.prompt(session, text, files)
                val key = runCatching { Providers.key(applicationContext, providerId) }.getOrDefault("")
                val poll = scope.launch {
                    while (scope.isActive) {
                        delay(1500)
                        val snapshot = withContext(Dispatchers.IO) { runCatching { CodexGateway.status(applicationContext, session.taskId) }.getOrNull() }
                        if (snapshot != null) session.progress = snapshot.optString("progress").ifBlank { snapshot.optString("status") }
                    }
                }
                val startedAt = android.os.SystemClock.elapsedRealtime()
                try {
                    val answer = withContext(Dispatchers.IO) {
                        CodexGateway.run(applicationContext, goal, model, session.taskId,
                            CodexGateway.RunProvider(provider.kind, provider.baseUrl, key),
                            session.reasoningEffort.ifBlank { "medium" })
                    }
                    session.messages += Message(role = "codex", text = answer.text, files = answer.files,
                        durationMs = android.os.SystemClock.elapsedRealtime() - startedAt, usage = answer.usage)
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    val message = e.message ?: "Не удалось выполнить задачу"
                    if (session.pending.isBlank() && session.pendingFiles.isEmpty()) {
                        session.messages += Message(role = "system", text = message)
                    }
                } finally {
                    poll.cancel()
                    session.progress = ""
                    Sessions.save()
                }
                next = session.pending.ifBlank { null }
                nextFiles = session.pendingFiles
            }
        } finally {
            session.busy = false
            session.progress = ""
            Sessions.save()
            work.remove(session.id)
            if (work.isEmpty()) {
                wakeLock?.let { if (it.isHeld) it.release() }
                wakeLock = null
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelfResult(latestStartId)
            } else {
                work.keys.lastOrNull()?.let(Sessions::find)?.let { startForegroundNow(it, work.size) }
            }
        }
    }

    override fun onDestroy() {
        work.values.forEach { it.cancel() }
        work.clear()
        scope.cancel()
        wakeLock?.let { if (it.isHeld) it.release() }
        wakeLock = null
        super.onDestroy()
    }
}
