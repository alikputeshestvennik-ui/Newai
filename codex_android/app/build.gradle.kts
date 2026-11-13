plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

/** Секреты GitHub Actions попадают в BuildConfig, в исходниках их нет. */
fun secret(name: String): String =
    "\"" + (System.getenv(name) ?: "").trim().replace("\\", "\\\\").replace("\"", "\\\"") + "\""

android {
    namespace = "ru.alim.newai"
    compileSdk = 34
    defaultConfig {
        applicationId = "ru.alim.newai"
        minSdk = 26
        // Required to execute the private embedded runtime on Android 10+.
        targetSdk = 28
        versionCode = 1 + (System.getenv("GITHUB_RUN_NUMBER")?.toIntOrNull() ?: 0)
        versionName = "1.0"
        buildConfigField("String", "GH_TOKEN", secret("GH_TOKEN"))
        buildConfigField("String", "DEEPSEEK_API", secret("DEEPSEEK_API"))
        buildConfigField("String", "ANYMODEL_KEY", secret("ANYMODEL_KEY"))
        ndk { abiFilters += "arm64-v8a" }
    }
    val keystore = System.getenv("ANDROID_KEYSTORE_PATH")
    signingConfigs {
        if (keystore != null) create("release") {
            storeFile = file(keystore)
            storePassword = System.getenv("ANDROID_STORE_PASSWORD")
            keyAlias = System.getenv("ANDROID_KEY_ALIAS")
            keyPassword = System.getenv("ANDROID_KEY_PASSWORD")
        }
    }
    buildTypes { release { if (keystore != null) signingConfig = signingConfigs.getByName("release") } }
    // Direct-install app: target 28 is required to execute the embedded runtime.
    lint { disable += "ExpiredTargetSdkVersion" }
    buildFeatures { compose = true; buildConfig = true }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}
dependencies {
    implementation(platform("androidx.compose:compose-bom:2024.09.00"))
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.activity:activity-compose:1.9.2")
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1")
    implementation("androidx.security:security-crypto:1.1.0-alpha06")
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.json:json:20240303")
}
