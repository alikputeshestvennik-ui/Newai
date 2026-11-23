plugins {
    id("com.android.application") version "8.9.2"
}

android {
    namespace = "org.newai.framevault"
    compileSdk = 35

    defaultConfig {
        applicationId = "org.newai.framevault"
        minSdk = 26
        targetSdk = 35
        versionCode = System.getenv("GITHUB_RUN_NUMBER")?.toIntOrNull() ?: 1
        versionName = "1.0"
    }

    val keystore = System.getenv("FRAMEVAULT_KEYSTORE")
    if (keystore != null) {
        signingConfigs.create("release") {
            storeFile = file(keystore)
            storePassword = System.getenv("FRAMEVAULT_STORE_PASSWORD")
            keyAlias = System.getenv("FRAMEVAULT_KEY_ALIAS")
            keyPassword = System.getenv("FRAMEVAULT_KEY_PASSWORD")
        }
        buildTypes.getByName("release").signingConfig = signingConfigs.getByName("release")
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    implementation("com.google.zxing:core:3.5.3")
    testImplementation("junit:junit:4.13.2")
}
