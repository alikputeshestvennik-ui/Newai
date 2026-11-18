package ru.alim.newai

import android.content.Intent
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
        Prefs.init(this)
        Sessions.init(this)
        Providers.init(this)
        AppNav.init(this)
        Th.load()
        Fonts.load(assets)
        openFromIntent(intent)
        EmbeddedRuntime.startAsync(applicationContext)
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
