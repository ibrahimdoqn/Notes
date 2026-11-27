package com.camnotlar.app.ui.common

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBackIos
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.camnotlar.app.ui.theme.Cam

@Composable
fun TopBar(back: String? = null, onBack: () -> Unit = {}, actions: @Composable RowScope.() -> Unit = {}) {
    Row(Modifier.fillMaxWidth().heightIn(min = 52.dp).padding(horizontal = 6.dp), verticalAlignment = Alignment.CenterVertically) {
        if (back != null) {
            Row(
                Modifier.clip(RoundedCornerShape(10.dp)).clickable(onClick = onBack).padding(vertical = 10.dp, horizontal = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(Icons.AutoMirrored.Rounded.ArrowBackIos, null, tint = Cam.colors.accInk, modifier = Modifier.size(20.dp))
                Text(back, color = Cam.colors.accInk, fontSize = 17.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
        Spacer(Modifier.weight(1f))
        actions()
    }
}

@Composable
fun IconBtn(icon: ImageVector, label: String, on: Boolean = false, tint: Color = Cam.colors.accInk, onClick: () -> Unit) {
    Box(
        Modifier.size(44.dp).clip(RoundedCornerShape(10.dp)).background(if (on) Cam.colors.sel else Color.Transparent).clickable(onClickLabel = label, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) { Icon(icon, label, tint = tint, modifier = Modifier.size(24.dp)) }
}

@Composable
fun LargeTitle(text: String) = Text(
    text, color = Cam.colors.ink, fontSize = 34.sp, fontWeight = FontWeight.Bold, letterSpacing = (-0.8).sp,
    modifier = Modifier.padding(start = 18.dp, end = 18.dp, top = 4.dp, bottom = 10.dp), maxLines = 1, overflow = TextOverflow.Ellipsis,
)

@Composable
fun Caption(text: String) = Text(
    text, color = Cam.colors.sub, fontSize = 13.sp, fontWeight = FontWeight.SemiBold,
    modifier = Modifier.padding(start = 32.dp, end = 32.dp, top = 20.dp, bottom = 6.dp),
)

@Composable
fun Hint(text: String) = Text(text, color = Cam.colors.sub, fontSize = 13.sp, modifier = Modifier.padding(horizontal = 22.dp, vertical = 6.dp))

/** iOS tarzı gruplu cam kart; çocuklar arasına ince çizgi çizilir. */
@Composable
fun GroupCard(content: @Composable ColumnScope.() -> Unit) {
    Column(
        Modifier.padding(horizontal = 16.dp).fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(Cam.colors.glass2),
        content = content,
    )
}

@Composable
fun Divider() = HorizontalDivider(color = Cam.colors.line, thickness = 1.dp)

@Composable
fun SearchField(value: String, onChange: (String) -> Unit) {
    Row(
        Modifier.padding(horizontal = 16.dp).padding(bottom = 10.dp).fillMaxWidth().height(38.dp).clip(RoundedCornerShape(11.dp))
            .background(Color(0x3D767680)).padding(horizontal = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Icons.Rounded.Search, null, tint = Cam.colors.sub, modifier = Modifier.size(18.dp))
        Spacer(Modifier.width(6.dp))
        Box(Modifier.weight(1f)) {
            if (value.isEmpty()) Text("Ara", color = Cam.colors.sub, fontSize = 16.sp)
            BasicTextField(
                value, onChange, singleLine = true, textStyle = TextStyle(color = Cam.colors.ink, fontSize = 16.sp),
                cursorBrush = SolidColor(Cam.colors.acc), modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

@Composable
fun SwitchRow(title: String, sub: String?, checked: Boolean, onChange: (Boolean) -> Unit) {
    Row(Modifier.fillMaxWidth().clickable { onChange(!checked) }.padding(horizontal = 14.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(title, color = Cam.colors.ink, fontSize = 16.sp)
            if (sub != null) Text(sub, color = Cam.colors.sub, fontSize = 13.sp)
        }
        Switch(checked, onChange, colors = SwitchDefaults.colors(checkedTrackColor = Color(0xFF34C759), checkedThumbColor = Color.White))
    }
}

@Composable
fun Segmented(options: List<Pair<String, String>>, selected: String, onSelect: (String) -> Unit) {
    Row(
        Modifier.padding(8.dp).fillMaxWidth().clip(RoundedCornerShape(11.dp)).background(Color(0x3D767680)).padding(3.dp),
        horizontalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        options.forEach { (v, l) ->
            val on = v == selected
            Box(
                Modifier.weight(1f).height(36.dp).clip(RoundedCornerShape(9.dp))
                    .background(if (on) (if (Cam.colors.dark) Color(0xFF636366) else Color.White) else Color.Transparent)
                    .clickable { onSelect(v) },
                contentAlignment = Alignment.Center,
            ) { Text(l, color = Cam.colors.ink, fontSize = 14.sp, fontWeight = FontWeight.Medium, maxLines = 1) }
        }
    }
}

@Composable
fun LinkRow(text: String, red: Boolean = false, onClick: () -> Unit) = Text(
    text, color = if (red) Cam.colors.red else Cam.colors.accInk, fontSize = 16.sp, fontWeight = FontWeight.Medium,
    modifier = Modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = 14.dp, vertical = 14.dp),
)

@Composable
fun TextPromptDialog(title: String, initial: String, ok: String, message: String? = null, password: Boolean = false, onDone: (String?) -> Unit) {
    var v by remember { mutableStateOf(initial) }
    AlertDialog(
        onDismissRequest = { onDone(null) },
        title = { Text(title) },
        text = {
            Column {
                if (message != null) Text(message, color = Cam.colors.sub, fontSize = 14.sp, modifier = Modifier.padding(bottom = 8.dp))
                OutlinedTextField(v, { v = it.take(if (password) 1024 else 60) }, singleLine = true,
                    visualTransformation = if (password) PasswordVisualTransformation() else androidx.compose.ui.text.input.VisualTransformation.None)
            }
        },
        confirmButton = { TextButton({ onDone(v.trim()) }, enabled = v.isNotBlank()) { Text(ok) } },
        dismissButton = { TextButton({ onDone(null) }) { Text("Vazgeç") } },
        containerColor = Cam.colors.glass2.copy(alpha = 0.97f),
    )
}

@Composable
fun ConfirmDialog(title: String, message: String, ok: String, danger: Boolean = true, onDone: (Boolean) -> Unit) = AlertDialog(
    onDismissRequest = { onDone(false) },
    title = { Text(title) },
    text = { Text(message) },
    confirmButton = { TextButton({ onDone(true) }) { Text(ok, color = if (danger) Cam.colors.red else Cam.colors.accInk) } },
    dismissButton = { TextButton({ onDone(false) }) { Text("Vazgeç") } },
    containerColor = Cam.colors.glass2.copy(alpha = 0.97f),
)

@Composable
fun ChoiceDialog(title: String, choices: List<Pair<String, String>>, selected: String?, onDone: (String?) -> Unit) = AlertDialog(
    onDismissRequest = { onDone(null) },
    title = { Text(title) },
    text = {
        Column {
            choices.forEach { (id, label) ->
                Text(
                    label, fontSize = 16.sp, color = Cam.colors.ink,
                    modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(11.dp)).background(if (id == selected) Cam.colors.sel else Color.Transparent)
                        .clickable { onDone(id) }.padding(horizontal = 12.dp, vertical = 12.dp),
                )
            }
        }
    },
    confirmButton = {},
    dismissButton = { TextButton({ onDone(null) }) { Text("Vazgeç") } },
    containerColor = Cam.colors.glass2.copy(alpha = 0.97f),
)
