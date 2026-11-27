package com.camnotlar.app.ui.auth

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.Notes
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.camnotlar.app.ui.MainViewModel
import com.camnotlar.app.data.net.ApiClient
import com.camnotlar.app.ui.theme.Cam
import com.camnotlar.app.ui.theme.glass
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** Giriş ekranı: sunucu adresi, kullanıcı adı, parola; ya da sunucusuz kullanım. Hesaplar sunucunun /yonetim/ sayfasında açılır. */
@Composable
fun AuthScreen(vm: MainViewModel, fromLocal: Boolean, message: String?, onLocal: () -> Unit, onDone: () -> Unit) {
    val c = Cam.colors
    val scope = rememberCoroutineScope()
    var server by rememberSaveable { mutableStateOf(vm.lastServer()) }
    var username by rememberSaveable { mutableStateOf(vm.session.value?.username ?: "") }
    var password by remember { mutableStateOf("") }
    var error by remember { mutableStateOf(message) }
    var busy by remember { mutableStateOf(false) }
    var needsSetup by remember { mutableStateOf(false) }
    var resolved by remember { mutableStateOf("") }

    // Sunucu adresi değişince kurulmuş mu diye bak (kurulmamışsa yönetim sayfasına yönlendir).
    LaunchedEffect(server) {
        needsSetup = false
        if (server.length < 4) return@LaunchedEffect
        delay(500)
        vm.serverInfo(server).onSuccess { (url, info) ->
            needsSetup = info.needsSetup
            resolved = url
        }
    }

    Box(Modifier.fillMaxSize().systemBarsPadding().imePadding(), contentAlignment = Alignment.Center) {
        Column(
            Modifier.padding(16.dp).widthIn(max = 420.dp).fillMaxWidth().glass(c.glass2, c.line, RoundedCornerShape(24.dp))
                .verticalScroll(rememberScrollState()).padding(horizontal = 22.dp, vertical = 24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Box(
                Modifier.size(64.dp).clip(RoundedCornerShape(18.dp)).background(Brush.linearGradient(listOf(c.b1, c.acc))),
                contentAlignment = Alignment.Center,
            ) { Icon(Icons.AutoMirrored.Rounded.Notes, null, tint = c.accOn, modifier = Modifier.size(34.dp)) }
            Text("Cam Notlar", fontSize = 26.sp, fontWeight = FontWeight.Bold, color = c.ink)
            Text(
                if (fromLocal) "Bu cihazdaki notların hesabına taşınır ve tüm cihazlarında eşitlenir." else "Notların her cihazında, kendi sunucunda.",
                color = c.sub, fontSize = 14.sp, textAlign = TextAlign.Center,
            )
            Spacer(Modifier.height(4.dp))
            OutlinedTextField(server, { server = it.trim() }, label = { Text("Sunucu") }, placeholder = { Text("192.168.1.1:8080") },
                singleLine = true, modifier = Modifier.fillMaxWidth(), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri))
            OutlinedTextField(username, { username = it.trim() }, label = { Text("Kullanıcı adı") }, singleLine = true, modifier = Modifier.fillMaxWidth(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Ascii, capitalization = KeyboardCapitalization.None, autoCorrectEnabled = false))
            OutlinedTextField(password, { password = it }, label = { Text("Parola") }, singleLine = true, modifier = Modifier.fillMaxWidth(),
                visualTransformation = PasswordVisualTransformation(), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password))
            if (needsSetup) {
                Text(
                    "Bu sunucu henüz kurulmadı. Tarayıcıda ${resolved.ifEmpty { ApiClient.normalizeServer(server) }}/yonetim/ adresinden yönetici hesabını oluştur.",
                    color = c.accInk, fontSize = 13.sp, modifier = Modifier.fillMaxWidth(),
                )
            }
            if (error != null) Text(error ?: "", color = c.red, fontSize = 13.sp, modifier = Modifier.fillMaxWidth())
            Button(
                onClick = {
                    if (server.isBlank() || username.isBlank() || password.isBlank()) {
                        error = "Sunucu, kullanıcı adı ve parola gerekli."
                        return@Button
                    }
                    busy = true
                    error = null
                    scope.launch {
                        val err = vm.authenticate(server, username, password)
                        busy = false
                        if (err == null) {
                            password = ""
                            onDone()
                        } else error = err
                    }
                },
                enabled = !busy,
                modifier = Modifier.fillMaxWidth().height(48.dp),
                colors = ButtonDefaults.buttonColors(containerColor = c.acc, contentColor = c.accOn),
                shape = RoundedCornerShape(999.dp),
            ) {
                if (busy) CircularProgressIndicator(Modifier.size(20.dp), color = c.accOn, strokeWidth = 2.dp)
                else Text("Giriş yap", fontWeight = FontWeight.SemiBold, fontSize = 16.sp)
            }
            Text("Hesabın yok mu? Sunucu yöneticisi oluşturur.", color = c.sub, fontSize = 13.sp, textAlign = TextAlign.Center)
            if (!fromLocal) {
                TextButton(onClick = onLocal, modifier = Modifier.fillMaxWidth()) {
                    Text("Sunucusuz, yalnızca bu cihazda kullan", color = c.accInk, fontWeight = FontWeight.Medium)
                }
            }
        }
    }
}
