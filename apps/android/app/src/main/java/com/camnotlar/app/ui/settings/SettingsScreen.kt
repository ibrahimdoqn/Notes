package com.camnotlar.app.ui.settings

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Computer
import androidx.compose.material.icons.outlined.PhoneAndroid
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.camnotlar.app.data.net.DeviceDto
import com.camnotlar.app.data.prefs.LocalSettings
import com.camnotlar.app.data.sync.SyncWorker
import com.camnotlar.app.ui.MainViewModel
import com.camnotlar.app.ui.common.Caption
import com.camnotlar.app.ui.common.ConfirmDialog
import com.camnotlar.app.ui.common.Divider
import com.camnotlar.app.ui.common.Format
import com.camnotlar.app.ui.common.GroupCard
import com.camnotlar.app.ui.common.Hint
import com.camnotlar.app.ui.common.LinkRow
import com.camnotlar.app.ui.common.Segmented
import com.camnotlar.app.ui.common.SwitchRow
import com.camnotlar.app.ui.common.TextPromptDialog
import com.camnotlar.app.ui.theme.Cam
import kotlinx.coroutines.launch

private val THEMES = listOf(
    Triple("amber", "Kehribar", Color(0xFFE8A900) to Color(0xFFFFD36B)),
    Triple("ocean", "Okyanus", Color(0xFF0A84FF) to Color(0xFF8FE3FF)),
    Triple("forest", "Orman", Color(0xFF30B15B) to Color(0xFFD8F0A0)),
    Triple("rose", "Gül", Color(0xFFFF4F7B) to Color(0xFFFFC9A8)),
    Triple("lav", "Lavanta", Color(0xFF8E6CF0) to Color(0xFFFFC2E0)),
    Triple("graphite", "Grafit", Color(0xFF8E8E93) to Color(0xFFE5E5EA)),
)

@Composable
fun SettingsScreen(vm: MainViewModel, onConnect: () -> Unit, onClose: () -> Unit) {
    val c = Cam.colors
    val ctx = LocalContext.current
    val prefs by vm.prefs.collectAsState()
    val session by vm.session.collectAsState()
    val scope = rememberCoroutineScope()
    val server = session?.mode == "server"
    var devices by remember { mutableStateOf<List<DeviceDto>?>(null) }
    var devErr by remember { mutableStateOf<String?>(null) }
    var kick by remember { mutableStateOf<DeviceDto?>(null) }
    var logout by remember { mutableStateOf(false) }
    var timeEdit by remember { mutableStateOf<String?>(null) }
    var bio by remember { mutableStateOf(LocalSettings.biometric(ctx)) }
    var syncMin by remember { mutableIntStateOf(LocalSettings.syncMinutes(ctx)) }
    val pending by vm.pending.collectAsState()

    suspend fun loadDevices() {
        vm.devices().onSuccess { devices = it; devErr = null }.onFailure { devErr = it.message ?: "Cihazlar yüklenemedi." }
    }
    LaunchedEffect(server) { if (server) loadDevices() }

    Column(Modifier.fillMaxSize().statusBarsPadding()) {
        Row(Modifier.fillMaxWidth().padding(start = 22.dp, end = 8.dp, top = 8.dp, bottom = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            Text("Ayarlar", fontSize = 28.sp, fontWeight = FontWeight.Bold, color = c.ink, modifier = Modifier.weight(1f))
            TextButton(onClose) { Text("Bitti", color = c.accInk, fontWeight = FontWeight.SemiBold, fontSize = 16.sp) }
        }
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).navigationBarsPadding().padding(bottom = 24.dp)) {
            Caption("Hesap")
            GroupCard {
                if (server) {
                    Column(Modifier.padding(14.dp)) {
                        Text(session?.username ?: "", color = c.ink, fontSize = 16.sp)
                        Text(session?.server?.removePrefix("https://") ?: "", color = c.sub, fontSize = 13.sp)
                    }
                    Divider()
                    LinkRow("Çıkış yap", red = true) { logout = true }
                } else {
                    Column(Modifier.padding(14.dp)) {
                        Text("Bu cihazda, sunucusuz", color = c.ink, fontSize = 16.sp)
                        Text("Notların yalnızca bu telefonda. Bir sunucuya bağlanınca hepsi hesabına taşınır.", color = c.sub, fontSize = 13.sp)
                    }
                    Divider()
                    LinkRow("Sunucuya bağlan", onClick = onConnect)
                }
            }
            if (server) {
                Caption("Oturum açık cihazlar")
                GroupCard {
                    when {
                        devErr != null -> Hint(devErr ?: "")
                        devices == null -> Hint("Yükleniyor…")
                        else -> devices!!.forEachIndexed { i, d ->
                            if (i > 0) Divider()
                            Row(Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                                Icon(if (d.platform == "android") Icons.Outlined.PhoneAndroid else Icons.Outlined.Computer, null, tint = c.accInk)
                                Spacer(Modifier.width(12.dp))
                                Column(Modifier.weight(1f)) {
                                    Text(d.name, color = c.ink, fontSize = 16.sp)
                                    Text(if (d.current) "Bu cihaz" else "Son görülme: ${Format.rel(d.lastSeenAt)}", color = if (d.current) c.accInk else c.sub, fontSize = 13.sp)
                                }
                                if (!d.current) TextButton({ kick = d }) { Text("Çıkış yaptır", color = c.red) }
                            }
                        }
                    }
                }
            }

            Caption("Görünüm")
            GroupCard {
                Segmented(listOf("auto" to "Otomatik", "light" to "Açık", "dark" to "Gece", "sched" to "Zamanlı"), prefs.mode) { vm.updatePrefs(prefs.copy(mode = it)) }
                if (prefs.mode == "sched") {
                    Row(Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text("Gece modu saatleri", color = c.ink, fontSize = 16.sp)
                            Text("Bu aralıkta koyu tema açılır", color = c.sub, fontSize = 13.sp)
                        }
                        TextButton({ timeEdit = "from" }) { Text(prefs.from, color = c.accInk) }
                        Text("–", color = c.sub)
                        TextButton({ timeEdit = "to" }) { Text(prefs.to, color = c.accInk) }
                    }
                }
                Divider()
                SwitchRow("Saf siyah gece", "OLED ekranlarda daha derin siyah, daha az pil", prefs.oled) { vm.updatePrefs(prefs.copy(oled = it)) }
            }
            Caption("Tema")
            GroupCard {
                Row(Modifier.fillMaxWidth().padding(6.dp), horizontalArrangement = Arrangement.SpaceEvenly) {
                    THEMES.forEach { (id, name, colors) ->
                        val on = prefs.theme == id
                        Column(
                            Modifier.clip(RoundedCornerShape(12.dp)).background(if (on) c.sel else Color.Transparent).clickable { vm.updatePrefs(prefs.copy(theme = id)) }.padding(vertical = 10.dp, horizontal = 4.dp),
                            horizontalAlignment = Alignment.CenterHorizontally,
                        ) {
                            Box(
                                Modifier.size(38.dp).let { if (on) it.border(2.dp, colors.first, CircleShape).padding(4.dp) else it }
                                    .clip(CircleShape).background(Brush.linearGradient(listOf(colors.second, colors.first))),
                            )
                            Spacer(Modifier.height(6.dp))
                            Text(name, fontSize = 12.sp, color = c.ink, fontWeight = FontWeight.Medium)
                        }
                    }
                }
            }
            Caption("Cam efekti")
            GroupCard {
                Segmented(listOf("mat" to "Mat", "bal" to "Dengeli", "clear" to "Şeffaf"), prefs.glass) { vm.updatePrefs(prefs.copy(glass = it)) }
                Divider()
                SwitchRow("Arka plan hareketi", "Işıklar yavaşça süzülür", prefs.motion) { vm.updatePrefs(prefs.copy(motion = it)) }
            }
            Caption("Yazı")
            GroupCard {
                Segmented(listOf("sys" to "Sistem", "serif" to "Serif", "mono" to "Mono"), prefs.font) { vm.updatePrefs(prefs.copy(font = it)) }
                Segmented(listOf("s" to "Küçük", "m" to "Orta", "l" to "Büyük"), prefs.size) { vm.updatePrefs(prefs.copy(size = it)) }
                Column(Modifier.padding(14.dp)) {
                    Text("Pazar kahvaltısı", fontFamily = c.editorFont, fontSize = c.editorSize * 1.3f, fontWeight = FontWeight.Bold, color = c.ink)
                    Text("Simit, beyaz peynir, domates ve demli bir çay.", fontFamily = c.editorFont, fontSize = c.editorSize, color = c.ink)
                }
            }
            Caption("Liste")
            GroupCard {
                Segmented(listOf("up" to "Düzenlenme", "cr" to "Oluşturulma", "ttl" to "Başlık"), prefs.sort) { vm.updatePrefs(prefs.copy(sort = it)) }
                Divider()
                SwitchRow("Tarihe göre grupla", "Bugün, Dün, Önceki 7 gün…", prefs.group) { vm.updatePrefs(prefs.copy(group = it)) }
                Divider()
                SwitchRow("Önizleme metni", "Başlığın altında notun devamını göster", prefs.preview) { vm.updatePrefs(prefs.copy(preview = it)) }
            }
            Caption("Güvenlik ve eşitleme")
            GroupCard {
                SwitchRow("Biyometrik kilit", "Uygulama açılırken parmak izi ya da yüz doğrulaması iste", bio) {
                    bio = it
                    LocalSettings.setBiometric(ctx, it)
                }
                if (server) {
                    Divider()
                    Text("Arka planda eşitleme sıklığı", color = c.ink, fontSize = 16.sp, modifier = Modifier.padding(start = 14.dp, top = 12.dp))
                    Segmented(listOf("15" to "15 dk", "30" to "30 dk", "60" to "1 saat"), syncMin.toString()) {
                        syncMin = it.toInt()
                        LocalSettings.setSyncMinutes(ctx, syncMin)
                        SyncWorker.schedulePeriodic(ctx, syncMin.toLong())
                    }
                }
            }
            Caption("Veriler")
            GroupCard { LinkRow("Örnek notları ekle") { vm.addSamples() } }
            Hint(if (server) "Notların bu cihazda da saklanır; çevrimdışıyken yazdıkların bağlantı gelince eşitlenir." else "Notlar ve ayarlar yalnızca bu cihazda saklanır.")
        }
    }

    timeEdit?.let { which ->
        TextPromptDialog("Saat (SS:DD)", if (which == "from") prefs.from else prefs.to, "Kaydet") { v ->
            timeEdit = null
            if (v != null && Regex("^([01]\\d|2[0-3]):[0-5]\\d$").matches(v)) {
                vm.updatePrefs(if (which == "from") prefs.copy(from = v) else prefs.copy(to = v))
            } else if (v != null) vm.toast("Saat SS:DD biçiminde olmalı")
        }
    }
    kick?.let { d ->
        ConfirmDialog("Bu cihazdan çıkış yapılsın mı?", "“${d.name}” bir sonraki eşitlemede oturumunu kaybeder.", "Çıkış yaptır") { ok ->
            kick = null
            if (ok) scope.launch {
                vm.revokeDevice(d.id).onSuccess { vm.toast("Cihazın oturumu kapatıldı") }.onFailure { vm.toast(it.message ?: "Olmadı") }
                loadDevices()
            }
        }
    }
    if (logout) ConfirmDialog(
        "Çıkış yapılsın mı?",
        if (pending > 0) "$pending değişiklik henüz sunucuya ulaşmadı ve kaybolacak. Bu cihazdaki notlar silinir." else "Bu cihazdaki notların kopyası silinir; sunucudaki notların yerinde kalır.",
        "Çıkış Yap",
    ) { ok ->
        logout = false
        if (ok) vm.logout()
    }
}
