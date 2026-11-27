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
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.camnotlar.app.ui.MainViewModel
import com.camnotlar.app.ui.common.Segmented
import com.camnotlar.app.ui.theme.Cam
import com.camnotlar.app.ui.theme.glass
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** Giriş / kayıt ekranı: sunucu adresi, e-posta, parola; ya da sunucusuz kullanım. */
@Composable
fun AuthScreen(vm: MainViewModel, fromLocal: Boolean, message: String?, onLocal: () -> Unit, onDone: () -> Unit) {
    val c = Cam.colors
    val scope = rememberCoroutineScope()
    var mode by rememberSaveable { mutableStateOf("login") }
    var server by rememberSaveable { mutableStateOf(vm.lastServer().removePrefix("https://")) }
    var email by rememberSaveable { mutableStateOf(vm.session.value?.email ?: "") }
    var password by remember { mutableStateOf("") }
    var invite by rememberSaveable { mutableStateOf("") }
    var error by remember { mutableStateOf(message) }
    var busy by remember { mutableStateOf(false) }
    var signupOpen by remember { mutableStateOf(true) }

    // Sunucu adresi değişince kaydın açık olup olmadığını öğren (davet kodu alanı için).
    LaunchedEffect(server) {
        if (server.length < 4) return@LaunchedEffect
        delay(500)
        vm.serverInfo(server).onSuccess { signupOpen = it.allowSignup }
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
            Segmented(listOf("login" to "Giriş yap", "register" to "Hesap oluştur"), mode) { mode = it; error = null }
            OutlinedTextField(server, { server = it.trim() }, label = { Text("Sunucu") }, placeholder = { Text("notlar.ornek.com") },
                singleLine = true, modifier = Modifier.fillMaxWidth(), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri))
            OutlinedTextField(email, { email = it }, label = { Text("E-posta") }, singleLine = true, modifier = Modifier.fillMaxWidth(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email))
            OutlinedTextField(password, { password = it }, label = { Text("Parola") }, singleLine = true, modifier = Modifier.fillMaxWidth(),
                visualTransformation = PasswordVisualTransformation(), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password))
            if (mode == "register" && !signupOpen) {
                OutlinedTextField(invite, { invite = it.trim() }, label = { Text("Davet kodu") }, singleLine = true, modifier = Modifier.fillMaxWidth())
            }
            if (error != null) Text(error ?: "", color = c.red, fontSize = 13.sp, modifier = Modifier.fillMaxWidth())
            Button(
                onClick = {
                    if (server.isBlank() || email.isBlank() || password.isBlank()) {
                        error = "Sunucu, e-posta ve parola gerekli."
                        return@Button
                    }
                    if (mode == "register" && password.length < 10) {
                        error = "Parola en az 10 karakter olmalı."
                        return@Button
                    }
                    busy = true
                    error = null
                    scope.launch {
                        val err = vm.authenticate(mode, server, email, password, invite)
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
                else Text(if (mode == "login") "Giriş yap" else "Hesap oluştur", fontWeight = FontWeight.SemiBold, fontSize = 16.sp)
            }
            if (!fromLocal) {
                TextButton(onClick = onLocal, modifier = Modifier.fillMaxWidth()) {
                    Text("Sunucusuz, yalnızca bu cihazda kullan", color = c.accInk, fontWeight = FontWeight.Medium)
                }
            }
        }
    }
}
