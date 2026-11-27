# kotlinx.serialization
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.**
-keepclassmembers class kotlinx.serialization.json.** { *** Companion; }
-keepclasseswithmembers class kotlinx.serialization.json.** { kotlinx.serialization.KSerializer serializer(...); }
-keep,includedescriptorclasses class com.camnotlar.app.**$$serializer { *; }
-keepclassmembers class com.camnotlar.app.** { *** Companion; }
-keepclasseswithmembers class com.camnotlar.app.** { kotlinx.serialization.KSerializer serializer(...); }
# WebView JavaScript köprüsü
-keepclassmembers class com.camnotlar.app.ui.editor.EditorBridge { @android.webkit.JavascriptInterface <methods>; }
