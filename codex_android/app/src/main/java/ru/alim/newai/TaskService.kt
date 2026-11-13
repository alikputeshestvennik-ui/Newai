package ru.alim.newai

import android.app.*
import android.content.Intent
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import kotlinx.coroutines.*

class TaskService : Service() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private var wakeLock: PowerManager.WakeLock? = null
    override fun onBind(intent: Intent?): IBinder? = null
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (Conversation.busy) return START_NOT_STICKY
        val text = intent?.getStringExtra("text") ?: run { stopSelf(); return START_NOT_STICKY }
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(NotificationChannel("tasks", "Задачи Codex", NotificationManager.IMPORTANCE_LOW))
        val open = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        startForeground(1, NotificationCompat.Builder(this, "tasks").setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle("NewAI · Codex работает").setContentText("Нажми, чтобы открыть задачу").setContentIntent(open).setOngoing(true).build())
        wakeLock = getSystemService(PowerManager::class.java).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "NewAI:task").also { it.acquire(40 * 60_000L) }
        Conversation.busy = true
        val goal = Conversation.prompt(text)
        Conversation.messages += Message("Вы", text)
        Conversation.draft = ""
        Conversation.save()
        val taskId = Conversation.taskId
        val model = Prefs.model
        scope.launch {
            val poll = launch {
                while (isActive) {
                    delay(1500)
                    val snapshot = withContext(Dispatchers.IO) { runCatching { CodexGateway.status(applicationContext, taskId) }.getOrNull() }
                    if (snapshot != null) Conversation.progress = snapshot.optString("reasoning").ifBlank { snapshot.optString("status") }
                }
            }
            try {
                val answer = withContext(Dispatchers.IO) { CodexGateway.run(applicationContext, goal, model, taskId) }
                Conversation.messages += Message("Codex", answer.text, answer.files)
            } catch (e: Exception) {
                Conversation.messages += Message("Система", e.message ?: "Не удалось выполнить задачу")
            } finally {
                poll.cancel(); Conversation.busy = false; Conversation.progress = ""; Conversation.save()
                wakeLock?.let { if (it.isHeld) it.release() }; wakeLock = null
                stopForeground(STOP_FOREGROUND_REMOVE); stopSelf()
            }
        }
        return START_NOT_STICKY
    }
    override fun onDestroy() {
        scope.cancel()
        wakeLock?.let { if (it.isHeld) it.release() }
        super.onDestroy()
    }
}
