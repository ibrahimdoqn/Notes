package com.camnotlar.app

import android.content.Intent
import android.os.Bundle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import com.camnotlar.app.data.Html
import com.camnotlar.app.data.prefs.LocalSettings
import com.camnotlar.app.ui.CamApp
import com.camnotlar.app.ui.Launch
import com.camnotlar.app.ui.MainViewModel

class MainActivity : FragmentActivity() {
    private val vm: MainViewModel by viewModels()
    private var launch by mutableStateOf<Launch?>(null)
    private var unlocked = false
    private var lastHidden = 0L

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        launch = parse(intent)
        setContent {
            CamApp(vm, launch) { launch = null }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        parse(intent)?.let { launch = it }
    }

    override fun onStart() {
        super.onStart()
        // Biyometrik kilit: uygulama 30 sn'den uzun arka planda kaldıysa yeniden sorulur.
        if (LocalSettings.biometric(this) && (!unlocked || System.currentTimeMillis() - lastHidden > 30_000)) lock()
    }

    override fun onStop() {
        super.onStop()
        lastHidden = System.currentTimeMillis()
    }

    private fun lock() {
        val auth = BiometricManager.Authenticators.BIOMETRIC_WEAK or BiometricManager.Authenticators.DEVICE_CREDENTIAL
        if (BiometricManager.from(this).canAuthenticate(auth) != BiometricManager.BIOMETRIC_SUCCESS) {
            unlocked = true
            return
        }
        window.decorView.alpha = 0f
        val prompt = BiometricPrompt(this, ContextCompat.getMainExecutor(this), object : BiometricPrompt.AuthenticationCallback() {
            override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                unlocked = true
                window.decorView.alpha = 1f
            }

            override fun onAuthenticationError(code: Int, msg: CharSequence) {
                if (!unlocked) finish()
            }
        })
        prompt.authenticate(
            BiometricPrompt.PromptInfo.Builder().setTitle("Cam Notlar kilitli").setSubtitle("Notlarını görmek için doğrula")
                .setAllowedAuthenticators(auth).build(),
        )
    }

    private fun parse(i: Intent?): Launch? = when {
        i == null -> null
        (i.action == Intent.ACTION_SEND || i.action == Intent.ACTION_SEND_MULTIPLE) && streams(i).isNotEmpty() -> {
            val text = listOfNotNull(i.getStringExtra(Intent.EXTRA_SUBJECT), i.getStringExtra(Intent.EXTRA_TEXT)).joinToString("\n")
            Launch.NewNote(if (text.isBlank()) null else Html.fromPlainText(text), streams(i))
        }
        i.action == Intent.ACTION_SEND && i.type?.startsWith("text/") == true -> {
            val subject = i.getStringExtra(Intent.EXTRA_SUBJECT)
            val text = i.getStringExtra(Intent.EXTRA_TEXT).orEmpty()
            Launch.NewNote(Html.fromPlainText(listOfNotNull(subject, text).joinToString("\n")))
        }
        i.action == ACTION_NEW_NOTE -> Launch.NewNote()
        i.action == ACTION_NEW_CHECKLIST -> Launch.NewNote("<div>Yapılacaklar</div><ul class=\"check\"><li><br></li></ul>")
        i.getStringExtra(EXTRA_NOTE_ID) != null -> Launch.OpenNote(i.getStringExtra(EXTRA_NOTE_ID)!!)
        else -> null
    }

    @Suppress("DEPRECATION")
    private fun streams(i: Intent): List<android.net.Uri> = when (i.action) {
        Intent.ACTION_SEND -> listOfNotNull(i.getParcelableExtra(Intent.EXTRA_STREAM) as? android.net.Uri)
        Intent.ACTION_SEND_MULTIPLE -> i.getParcelableArrayListExtra<android.net.Uri>(Intent.EXTRA_STREAM).orEmpty()
        else -> emptyList()
    }

    companion object {
        const val ACTION_NEW_NOTE = "com.camnotlar.app.NEW_NOTE"
        const val ACTION_NEW_CHECKLIST = "com.camnotlar.app.NEW_CHECKLIST"
        const val EXTRA_NOTE_ID = "noteId"
    }
}
