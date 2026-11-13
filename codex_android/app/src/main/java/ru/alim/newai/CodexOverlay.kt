package ru.alim.newai

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.IBinder
import android.provider.Settings
import android.util.TypedValue
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.compose.ui.graphics.toArgb
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject

/** Небольшое окно поверх других приложений: reasoning и последний ответ. */
class CodexOverlayService : Service() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private var pollJob: Job? = null
    private var window: WindowManager? = null
    private var root: View? = null
    private var host: FrameLayout? = null
    private var openOverlay: View? = null
    private var reasonView: TextView? = null
    private var reasonScroll: ScrollView? = null
    private var taskId = ""
    private var sessionId = ""

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        instance = this
        Prefs.init(this)
        Th.load()
        if (!Settings.canDrawOverlays(this)) {
            stopSelf()
            return
        }
        taskId = Prefs.overlayTask
        sessionId = Prefs.overlaySession
        startForegroundNow()
        if (!AppNav.foreground) showWindow()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        intent?.getStringExtra("task_id")?.takeIf { it.isNotBlank() }?.let {
            taskId = it
            Prefs.overlayTask = it
        }
        intent?.getStringExtra("session")?.takeIf { it.isNotBlank() }?.let {
            sessionId = it
            Prefs.overlaySession = it
        }
        if (taskId.isBlank()) taskId = Prefs.overlayTask
        if (sessionId.isBlank()) sessionId = Prefs.overlaySession
        setWindowVisible(!AppNav.foreground)
        pollJob?.cancel()
        pollJob = scope.launch { poll() }
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        pollJob?.cancel()
        hideWindow()
        instance = null
        scope.cancel()
        super.onDestroy()
    }

    private fun startForegroundNow() {
        val manager = getSystemService(NotificationManager::class.java)
        if (manager.getNotificationChannel(CHANNEL) == null) {
            manager.createNotificationChannel(NotificationChannel(CHANNEL, "Вайбкодер · активность", NotificationManager.IMPORTANCE_LOW))
        }
        val open = PendingIntent.getActivity(this, 11, openIntent(),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val notification = NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle("Вайбкодер работает")
            .setContentText("Окно появится при сворачивании приложения")
            .setOngoing(true).setSilent(true).setPriority(NotificationCompat.PRIORITY_LOW)
            .setContentIntent(open).build()
        startForeground(4243, notification)
    }

    private fun showWindow() {
        if (root != null || AppNav.foreground || !Settings.canDrawOverlays(this)) return
        val wm = getSystemService(WindowManager::class.java) ?: return
        window = wm
        val card = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(11), dp(9), dp(11), dp(9))
            background = GradientDrawable().apply {
                cornerRadius = dp(16).toFloat()
                setColor(Th.c.card.toArgb())
                setStroke(dp(1), Th.c.accent.copy(alpha = 0.6f).toArgb())
            }
            elevation = dp(6).toFloat()
        }
        reasonView = textView(10f, Th.c.ink.toArgb(), false).apply {
            text = "…"
            setLineSpacing(dp(2).toFloat(), 1f)
        }
        val scroller = ScrollView(this).apply {
            isVerticalScrollBarEnabled = false
            overScrollMode = View.OVER_SCROLL_NEVER
            addView(reasonView, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.WRAP_CONTENT))
        }
        reasonScroll = scroller
        card.addView(scroller, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(96)))

        val layout = WindowManager.LayoutParams(
            dp(232), WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS or
                WindowManager.LayoutParams.FLAG_WATCH_OUTSIDE_TOUCH,
            PixelFormat.TRANSLUCENT,
        ).apply {
            gravity = Gravity.TOP or Gravity.START
            x = dp(14)
            y = dp(96)
        }
        installDrag(card, wm, layout) { showOpenAction() }
        val frame = FrameLayout(this).apply {
            addView(card, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.WRAP_CONTENT))
        }
        val windowRoot = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            addView(frame, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))
        }
        if (runCatching { wm.addView(windowRoot, layout) }.isSuccess) {
            root = windowRoot
            host = frame
        }
    }

    private fun hideWindow() {
        hideOpenAction()
        root?.let { runCatching { window?.removeView(it) } }
        root = null
        host = null
        reasonView = null
        reasonScroll = null
    }

    private fun setWindowVisible(visible: Boolean) {
        if (visible) showWindow() else hideWindow()
    }

    private fun installDrag(view: View, wm: WindowManager, layout: WindowManager.LayoutParams, onTap: () -> Unit) {
        var downX = 0f
        var downY = 0f
        var startX = 0
        var startY = 0
        var moved = false
        view.setOnTouchListener { _, event ->
            when (event.actionMasked) {
                MotionEvent.ACTION_DOWN -> {
                    downX = event.rawX
                    downY = event.rawY
                    startX = layout.x
                    startY = layout.y
                    moved = false
                    true
                }
                MotionEvent.ACTION_MOVE -> {
                    val dx = (event.rawX - downX).toInt()
                    val dy = (event.rawY - downY).toInt()
                    if (kotlin.math.abs(dx) > dp(3) || kotlin.math.abs(dy) > dp(3)) moved = true
                    if (moved) {
                        layout.x = startX + dx
                        layout.y = startY + dy
                        runCatching { wm.updateViewLayout(root ?: view, layout) }
                    }
                    true
                }
                MotionEvent.ACTION_UP -> {
                    if (!moved) onTap()
                    true
                }
                MotionEvent.ACTION_CANCEL -> true
                else -> false
            }
        }
    }

    private fun showOpenAction() {
        if (openOverlay != null) return
        val frame = host ?: return
        val overlay = FrameLayout(this).apply {
            setBackgroundColor(Color.argb(150, 0, 0, 0))
            isClickable = true
            setOnClickListener { openCodex() }
        }
        val go = TextView(this).apply {
            text = "Перейти"
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f)
            setTextColor(Th.c.onAccent.toArgb())
            gravity = Gravity.CENTER
            background = GradientDrawable().apply {
                cornerRadius = dp(23).toFloat()
                setColor(Th.c.accent.toArgb())
            }
            elevation = dp(6).toFloat()
            setOnClickListener { openCodex() }
        }
        overlay.addView(go, FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            dp(46),
            Gravity.CENTER,
        ).apply { leftMargin = dp(14); rightMargin = dp(58) })
        val close = TextView(this).apply {
            text = "×"
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 20f)
            setTextColor(Th.c.ink.toArgb())
            gravity = Gravity.CENTER
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(Color.argb(70, 255, 255, 255))
            }
            setOnClickListener { hideOpenAction() }
        }
        overlay.addView(close, FrameLayout.LayoutParams(dp(44), dp(44), Gravity.TOP or Gravity.END).apply {
            topMargin = dp(4)
            rightMargin = dp(6)
        })
        frame.addView(overlay, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
        openOverlay = overlay
    }

    private fun hideOpenAction() {
        openOverlay?.let { overlay -> host?.removeView(overlay) }
        openOverlay = null
    }

    private fun openIntent(): Intent {
        return Intent(this, MainActivity::class.java)
            .putExtra("session", sessionId)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    }

    private fun openCodex() {
        hideOpenAction()
        runCatching { startActivity(openIntent()) }
    }

    private suspend fun poll() {
        while (scope.isActive) {
            val snapshot = withContext(Dispatchers.IO) {
                if (taskId.isBlank()) JSONObject().put("status", "waiting")
                else runCatching { CodexGateway.status(this@CodexOverlayService, taskId) }
                    .getOrElse { JSONObject().put("status", "waiting") }
            }
            render(snapshot)
            delay(if (snapshot.optString("status") in setOf("queued", "running")) 800 else 1800)
        }
    }

    private fun render(snapshot: JSONObject) {
        val reasoning = snapshot.optString("reasoning").trim()
        val error = snapshot.optString("error").trim()
        reasonView?.text = when {
            error.isNotBlank() -> error.takeLast(2400)
            reasoning.isNotBlank() -> reasoning.takeLast(6000)
            else -> "…"
        }
        reasonScroll?.post { reasonScroll?.fullScroll(View.FOCUS_DOWN) }
    }

    private fun textView(size: Float, color: Int, bold: Boolean): TextView = TextView(this).apply {
        setTextSize(TypedValue.COMPLEX_UNIT_SP, size)
        setTextColor(color)
        typeface = Typeface.create(if (bold) "sans-serif-medium" else "sans-serif", Typeface.NORMAL)
    }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

    companion object {
        private const val CHANNEL = "vibecoder_overlay"
        @Volatile private var instance: CodexOverlayService? = null

        fun appVisible(visible: Boolean) {
            instance?.setWindowVisible(!visible)
        }

        fun start(ctx: Context, taskId: String = Prefs.overlayTask, sessionId: String = Prefs.overlaySession): Boolean {
            if (!Settings.canDrawOverlays(ctx)) return false
            Prefs.init(ctx)
            if (taskId.isNotBlank()) Prefs.overlayTask = taskId
            if (sessionId.isNotBlank()) Prefs.overlaySession = sessionId
            val intent = Intent(ctx, CodexOverlayService::class.java)
                .putExtra("task_id", taskId).putExtra("session", sessionId)
            return runCatching {
                ContextCompat.startForegroundService(ctx, intent)
                true
            }.getOrDefault(false)
        }

        fun stop(ctx: Context) {
            runCatching { ctx.stopService(Intent(ctx, CodexOverlayService::class.java)) }
        }
    }
}
