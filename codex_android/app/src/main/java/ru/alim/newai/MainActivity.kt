package ru.alim.newai

import android.content.Intent
import android.app.AlertDialog
import android.content.res.Configuration
import android.os.Build
import android.os.Bundle
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.displayCutoutPadding
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Modifier

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val drawAroundCutout = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P &&
            resources.configuration.orientation == Configuration.ORIENTATION_LANDSCAPE
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P && drawAroundCutout) {
            window.attributes = window.attributes.apply {
                layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
            }
        }
        CrashDiagnostics.install(this)
        Prefs.init(this)
        ChatMemory.init(this)
        Sessions.init(this)
        Providers.init(this)
        AppNav.init(this)
        Th.load()
        Fonts.load(assets)
        openFromIntent(intent)
        val previousCrash = CrashDiagnostics.read(this)
        if (previousCrash == null) EmbeddedRuntime.startAsync(applicationContext)
        setContent {
            VibeTheme {
                if (drawAroundCutout) {
                    Surface(Modifier.fillMaxSize(), color = Bg, contentColor = Ink) {
                        Box(Modifier.fillMaxSize().displayCutoutPadding()) { App() }
                    }
                } else {
                    Surface(Modifier.fillMaxSize()) { App() }
                }
            }
        }
        if (previousCrash != null) {
            AlertDialog.Builder(this)
                .setTitle("Отчёт о сбое Вайбкодера")
                .setMessage("Предыдущий запуск завершился ошибкой. Отправь отчёт разработчику или скопируй его. Пока окно открыто, Codex не запускается.")
                .setPositiveButton("Поделиться") { _, _ ->
                    val share = Intent(Intent.ACTION_SEND).apply {
                        type = "text/plain"
                        putExtra(Intent.EXTRA_SUBJECT, "Vibecoder crash report")
                        putExtra(Intent.EXTRA_TEXT, previousCrash)
                    }
                    startActivity(Intent.createChooser(share, "Отправить отчёт"))
                }
                .setNeutralButton("Копировать") { _, _ ->
                    val clipboard = getSystemService(android.content.Context.CLIPBOARD_SERVICE) as android.content.ClipboardManager
                    clipboard.setPrimaryClip(android.content.ClipData.newPlainText("Vibecoder crash", previousCrash))
                }
                .setNegativeButton("Продолжить запуск") { _, _ ->
                    CrashDiagnostics.clear(this)
                    EmbeddedRuntime.startAsync(applicationContext)
                }
                .setCancelable(false)
                .show()
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        openFromIntent(intent)
    }

    private fun openFromIntent(intent: Intent?) {
        intent?.getStringExtra("session")?.takeIf { it.isNotBlank() }?.let { Sessions.open(it) }
    }

    override fun onPause() {
        AppNav.foreground = false
        CodexOverlayService.appVisible(false)
        Sessions.save()
        super.onPause()
    }

    override fun onResume() {
        super.onResume()
        AppNav.foreground = true
        CodexOverlayService.appVisible(true)
    }
}

@Composable
private fun App() {
    val ctx = androidx.compose.ui.platform.LocalContext.current.applicationContext
    LaunchedEffect(EmbeddedRuntime.state) {
        if (EmbeddedRuntime.state == EmbeddedRuntime.State.READY && CodexAccount.account == null) {
            runCatching { CodexAccount.refresh(ctx) }
            if (CodexAccount.account != null) Providers.refresh(ctx, "codex")
        }
    }
    BackHandler(enabled = AppNav.settingsOpen) { AppNav.settingsOpen = false }
    if (AppNav.settingsOpen) {
        CodexSettingsScreen(back = { AppNav.settingsOpen = false })
    } else {
        CodexScreen(onSettings = { AppNav.settingsOpen = true })
    }
}
