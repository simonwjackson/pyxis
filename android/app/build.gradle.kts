plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.simonwjackson.pyxis.kiosk"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.simonwjackson.pyxis.kiosk"
        minSdk = 31
        targetSdk = 34
        versionCode = 1
        versionName = "0.1.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        val pyxisServerUrl = System.getenv("PYXIS_SERVER_URL") ?: "http://192.168.1.243:8765/"
        buildConfigField("String", "PYXIS_SERVER_URL", "\"$pyxisServerUrl\"")
        buildConfigField("String", "PYXIS_ANDROID_BRIDGE_TOKEN", "\"${System.getenv("PYXIS_ANDROID_BRIDGE_TOKEN") ?: ""}\"")
    }

    buildFeatures {
        buildConfig = true
    }

    buildTypes {
        debug {
            isDebuggable = true
        }
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation("androidx.media3:media3-session:1.3.1")
    testImplementation("org.jetbrains.kotlin:kotlin-test:1.9.21")
    testImplementation("org.json:json:20240303")
}
