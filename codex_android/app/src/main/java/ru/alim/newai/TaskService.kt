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
    private var work: Job? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val sessionId = intent?.getStringExtra("session").orEmpty()
        val text = intent?.getStringExtra("text").orEmpty().trim()
        val session = Sessions.find(sessionId)
        if (session == null || text.isBlank()) { stopSelf(); return START_NOT_STICKY }

        if (session.busy) {
            session.pending = text
            Sessions.save()
            if (Prefs.followUp == "interrupt") {
                scope.launch(Dispatchers.IO) { runCatching { CodexGateway.cancel(applicationContext, session.taskId) } }
            }
            return START_NOT_STICKY
        }
        startForegroundNow(session)
        wakeLock = getSystemService(PowerManager::class.java).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Vibecoder:task")
            .also { it.acquire(40 * 60_000L) }
        session.busy = true
        work = scope.launch { runSession(session, text) }
        return START_NOT_STICKY
    }

    private fun startForegroundNow(session: CodexSession) {
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(NotificationChannel("tasks", "Задачи Вайбкодера", NotificationManager.IMPORTANCE_LOW))
        val open = PendingIntent.getActivity(this, 0,
            Intent(this, MainActivity::class.java).putExtra("session", session.id),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        startForeground(1, NotificationCompat.Builder(this, "tasks")
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle("Вайбкодер · Codex работает")
            .setContentText("Нажми, чтобы открыть задачу")
            .setContentIntent(open).setOngoing(true).build())
    }

    private suspend fun runSession(session: CodexSession, first: String) {
        var next: String? = first
        try {
            while (!next.isNullOrBlank() && scope.isActive) {
                val text = next
                next = null
                session.pending = ""
                val providerId = session.providerId.ifBlank { Providers.defaultProvider(this) }
                val provider = Providers.find(providerId)
                val model = session.model.ifBlank { Providers.firstRuntimeModel(providerId) }
                if (provider == null || model.isBlank()) {
                    session.messages += Message(role = "system", text = "Сначала добавь провайдера и загрузи модели в настройках Вайбкодера.")
                    break
                }
                session.providerId = providerId
                session.model = model
                session.messages += Message(role = "me", text = text)
                session.draft = ""
                Sessions.save()
                val goal = Sessions.prompt(session, text)
                val key = runCatching { Providers.key(applicationContext, providerId) }.getOrDefault("")
                val poll = scope.launch {
                    while (scope.isActive) {
                        delay(1500)
                        val snapshot = withContext(Dispatchers.IO) { runCatching { CodexGateway.status(applicationContext, session.taskId) }.getOrNull() }
                        if (snapshot != null) session.progress = snapshot.optString("reasoning").ifBlank { snapshot.optString("status") }
                    }
                }
                try {
                    val answer = withContext(Dispatchers.IO) {
                        CodexGateway.run(applicationContext, goal, model, session.taskId,
                            CodexGateway.RunProvider(provider.kind, provider.baseUrl, key))
                    }
                    session.messages += Message(role = "codex", text = answer.text, files = answer.files)
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    val message = e.message ?: "Не удалось выполнить задачу"
                    if (session.pending.isBlank()) session.messages += Message(role = "system", text = message)
                } finally {
                    poll.cancel()
                    session.progress = ""
                    Sessions.save()
                }
                next = session.pending.ifBlank { null }
            }
        } finally {
            session.busy = false
            session.progress = ""
            Sessions.save()
            wakeLock?.let { if (it.isHeld) it.release() }
            wakeLock = null
            stopForeground(STOP_FOREGROUND_REMOVE)
            stopSelf()
        }
    }

    override fun onDestroy() {
        work?.cancel()
        scope.cancel()
        wakeLock?.let { if (it.isHeld) it.release() }
        super.onDestroy()
    }
}
