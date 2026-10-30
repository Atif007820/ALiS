param(
    [string]$EclipseHome = "$env:USERPROFILE/eclipse/jee-2026-09/eclipse",
    [string]$JdkHome = 'C:/Program Files/Java/jdk-26'
)
$ErrorActionPreference = 'Stop'
$eclipseRoot = (Resolve-Path -LiteralPath $EclipseHome).Path
$sourceRoot = $PSScriptRoot
$buildRoot = Join-Path $sourceRoot '.build'
New-Item -ItemType Directory -Path $buildRoot -Force | Out-Null
$bundles = Get-Content (Join-Path $eclipseRoot 'configuration/org.eclipse.equinox.simpleconfigurator/bundles.info') |
    Where-Object { $_ -and -not $_.StartsWith('#') } |
    ConvertFrom-Csv -Header Name, Version, Location, StartLevel, AutoStart
$required = @('org.eclipse.core.runtime', 'org.eclipse.equinox.common', 'org.eclipse.core.jobs', 'org.eclipse.debug.core',
    'org.eclipse.core.resources', 'org.eclipse.osgi', 'com.google.gson')
$classpathEntries = @($bundles | Where-Object Name -In $required | ForEach-Object {
    $bundlePath = [IO.Path]::GetFullPath((Join-Path $eclipseRoot $_.Location))
    if (-not (Test-Path -LiteralPath $bundlePath)) {
        throw "Required Eclipse bundle is missing: $($_.Name) ($bundlePath)"
    }
    $bundlePath
})
if ($classpathEntries.Count -ne $required.Count) {
    throw "Could not resolve every required Eclipse bundle. Expected $($required.Count), found $($classpathEntries.Count)."
}
$classpath = $classpathEntries -join [IO.Path]::PathSeparator
$sources = @(Get-ChildItem (Join-Path $sourceRoot 'src') -Recurse -Filter '*.java' | Select-Object -ExpandProperty FullName)
& (Join-Path $JdkHome 'bin/javac.exe') --release 21 -cp $classpath -d $buildRoot @sources
if ($LASTEXITCODE -ne 0) { throw 'Eclipse integration compilation failed.' }
$testRoot = Join-Path $buildRoot 'tests'
New-Item -ItemType Directory -Path $testRoot -Force | Out-Null
& (Join-Path $JdkHome 'bin/javac.exe') --release 21 -cp $buildRoot -d $testRoot (Join-Path $sourceRoot 'tests/LaunchEnvironmentTest.java')
if ($LASTEXITCODE -ne 0) { throw 'Launch environment regression compilation failed.' }
& (Join-Path $JdkHome 'bin/java.exe') -cp ($testRoot + [IO.Path]::PathSeparator + $buildRoot) com.alis.eclipse.LaunchEnvironmentTest
if ($LASTEXITCODE -ne 0) { throw 'Launch environment regression checks failed.' }
$dropins = Join-Path $eclipseRoot 'dropins'
New-Item -ItemType Directory -Path $dropins -Force | Out-Null
$jar = Join-Path $dropins 'com.alis.eclipse.framework_1.0.0.jar'
& (Join-Path $JdkHome 'bin/jar.exe') --create --file $jar --manifest (Join-Path $sourceRoot 'META-INF/MANIFEST.MF') `
    -C $buildRoot com -C $sourceRoot plugin.xml
if ($LASTEXITCODE -ne 0) { throw 'Eclipse integration packaging failed.' }
Write-Output "Installed $jar. Restart Eclipse to load it."
