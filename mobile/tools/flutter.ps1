# Keep this a plain script: advanced PowerShell parameters consume Flutter's
# -d / -v as Debug / Verbose instead of forwarding them.
$FlutterArgs = @($args)
$ErrorActionPreference = 'Stop'
$sdkRoot = $env:ANIDECK_FLUTTER_SDK
if (-not $sdkRoot) { $sdkRoot = $env:FLUTTER_ROOT }
if (-not $sdkRoot) { $sdkRoot = Join-Path $env:USERPROFILE 'Documents\Codex\toolchains\flutter' }
$flutterCommand = Join-Path $sdkRoot 'bin\flutter.bat'
if (-not (Test-Path -LiteralPath $flutterCommand)) {
    $availableFlutter = Get-Command flutter -ErrorAction SilentlyContinue
    if (-not $availableFlutter) { throw 'Set ANIDECK_FLUTTER_SDK to an official Flutter SDK directory, or put flutter on PATH.' }
    $flutterCommand = $availableFlutter.Source
}
$previousCache = $env:PUB_CACHE
$previousAndroidHome = $env:ANDROID_HOME
$previousAndroidRoot = $env:ANDROID_SDK_ROOT
$previousJava = $env:JAVA_HOME
$previousGradle = $env:GRADLE_USER_HOME
try {
    $toolchains = Split-Path $sdkRoot -Parent
    $localAndroid = Join-Path $toolchains 'android-sdk'
    if (-not $env:ANDROID_HOME -and -not $env:ANDROID_SDK_ROOT -and (Test-Path -LiteralPath $localAndroid)) {
        $env:ANDROID_HOME = $localAndroid
        $env:ANDROID_SDK_ROOT = $localAndroid
    }
    if (-not $env:JAVA_HOME) {
        $jdkFolder = Join-Path $toolchains 'jdk21'
        if (Test-Path -LiteralPath $jdkFolder) {
            $jdk = Get-ChildItem -LiteralPath $jdkFolder -Directory | Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'bin\java.exe') } | Select-Object -First 1
            if ($jdk) { $env:JAVA_HOME = $jdk.FullName }
        }
    }
    if (-not $env:GRADLE_USER_HOME) { $env:GRADLE_USER_HOME = Join-Path $toolchains 'gradle-cache' }
    if (-not $env:PUB_CACHE) { $env:PUB_CACHE = Join-Path (Split-Path $sdkRoot -Parent) 'pub-cache' }
    Push-Location (Split-Path $PSScriptRoot -Parent)
    try { & $flutterCommand @FlutterArgs; $flutterResult = $LASTEXITCODE }
    finally { Pop-Location }
} finally {
    $env:PUB_CACHE = $previousCache
    $env:ANDROID_HOME = $previousAndroidHome
    $env:ANDROID_SDK_ROOT = $previousAndroidRoot
    $env:JAVA_HOME = $previousJava
    $env:GRADLE_USER_HOME = $previousGradle
}
exit $flutterResult
