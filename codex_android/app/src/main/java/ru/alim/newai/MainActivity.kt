package ru.alim.newai

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Prefs.init(this)
        Sessions.init(this)
        Providers.init(this)
        ChatGptAccount.init(applicationContext)
        AppNav.init(this)
        Th.load()
        Fonts.load(assets)
        openFromIntent(intent)
        EmbeddedRuntime.startAsync(applicationContext)
        setContent {
            VibeTheme {
                Surface(Modifier.fillMaxSize()) { App() }
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
    BackHandler(enabled = AppNav.settingsOpen) { AppNav.settingsOpen = false }
    if (AppNav.settingsOpen) {
        CodexSettingsScreen(back = { AppNav.settingsOpen = false })
    } else {
        CodexScreen(onSettings = { AppNav.settingsOpen = true })
    }
}
