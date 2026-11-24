[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$SdkRoot,

    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$JavaHome,

    [ValidateNotNullOrEmpty()]
    [string]$BuildToolsVersion = '35.0.0',

    [ValidateNotNullOrEmpty()]
    [string]$Platform = 'android-34',

    [ValidateNotNullOrEmpty()]
    [string]$OutputDirectory = 'dist/projector',

    [ValidateNotNullOrEmpty()]
    [string]$SigningDirectory = '.maestro/fbs-analysis/projector-signing',

    [string]$DefaultUrl = '',

    # versionCode do APK. 0 = automatico (minutos desde 2026-01-01 UTC), sempre maior que o build anterior,
    # para o Android aceitar "Atualizar" por cima da versao instalada sem desinstalar (mesma chave).
    [ValidateRange(0, 2100000000)]
    [int]$VersionCode = 0
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Reproducibilidade pressupoe as mesmas fontes, ferramentas e chave persistente.
# Nenhuma pasta de builds anteriores e removida.
$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$utf8 = [System.Text.UTF8Encoding]::new($false)
$zipDate = '1980-01-01T00:00:02Z'
$keyAlias = 'fbs-projector'
$previousJavaHome = [Environment]::GetEnvironmentVariable('JAVA_HOME', 'Process')

function Resolve-RepositoryPath {
    param([Parameter(Mandatory = $true)][string]$Path)

    if ([System.IO.Path]::IsPathRooted($Path)) {
        return [System.IO.Path]::GetFullPath($Path)
    }
    return [System.IO.Path]::GetFullPath((Join-Path $repoRoot $Path))
}

function ConvertTo-RepositoryRelativePath {
    param([Parameter(Mandatory = $true)][string]$Path)

    # Apenas caminhos absolutos Windows; caminhos relativos permanecem intactos.
    if ($Path -notmatch '^(?:[A-Za-z]:[\\/]|[\\/]{2})') {
        return $Path
    }

    $absolutePath = [System.IO.Path]::GetFullPath($Path)
    $root = $repoRoot.TrimEnd([char[]]'\/')
    if ($absolutePath.TrimEnd([char[]]'\/').Equals(
            $root, [System.StringComparison]::OrdinalIgnoreCase)) {
        return '.'
    }
    if (Test-WithinDirectory $absolutePath $repoRoot) {
        return $absolutePath.Substring($root.Length + 1)
    }
    return $Path
}

function Assert-Directory {
    param([Parameter(Mandatory = $true)][string]$Path)

    if (-not (Test-Path -LiteralPath $Path -PathType Container)) {
        throw "Pasta obrigatoria ausente: $Path"
    }
}

function Assert-File {
    param([Parameter(Mandatory = $true)][string]$Path)

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        throw "Arquivo obrigatorio ausente: $Path"
    }
}

function Resolve-WindowsTool {
    param(
        [Parameter(Mandatory = $true)][string]$Directory,
        [Parameter(Mandatory = $true)][string]$Name
    )

    foreach ($extension in @('.exe', '.bat')) {
        $candidate = Join-Path $Directory ($Name + $extension)
        if (Test-Path -LiteralPath $candidate -PathType Leaf) {
            return $candidate
        }
    }
    throw "Executavel Windows ausente: $Name (.exe ou .bat) em $Directory"
}

function Invoke-Native {
    param(
        [Parameter(Mandatory = $true)][string]$Executable,
        [Parameter(Mandatory = $true)][string[]]$Arguments,
        [int[]]$PathArgumentIndices = @()
    )

    # Os chamadores identificam somente argumentos que representam caminhos.
    # Opcoes, datas, URLs e referencias a senhas nao passam pela conversao.
    [string[]]$nativeArguments = $Arguments.Clone()
    foreach ($index in $PathArgumentIndices) {
        if ($index -lt 0 -or $index -ge $nativeArguments.Length) {
            throw "Indice de argumento de caminho invalido: $index"
        }
        $pathArgument = $nativeArguments[$index]
        $prefix = ''
        if ($pathArgument.StartsWith('@', [System.StringComparison]::Ordinal)) {
            $prefix = '@'
            $pathArgument = $pathArgument.Substring(1)
        }
        $nativeArguments[$index] = $prefix + (ConvertTo-RepositoryRelativePath $pathArgument)
    }

    Push-Location -LiteralPath $repoRoot
    try {
        & $Executable @nativeArguments
        $exitCode = $LASTEXITCODE
        if ($exitCode -ne 0) {
            $toolName = [System.IO.Path]::GetFileName($Executable)
            throw "$toolName terminou com codigo $exitCode. Build interrompido."
        }
    }
    finally {
        Pop-Location
    }
}

function Test-WithinDirectory {
    param([string]$Path, [string]$Directory)

    $parent = $Directory.TrimEnd([char[]]'\/')
    return ($Path.Equals($parent, [System.StringComparison]::OrdinalIgnoreCase) -or
        $Path.StartsWith($parent + [System.IO.Path]::DirectorySeparatorChar,
            [System.StringComparison]::OrdinalIgnoreCase))
}

function New-SigningPassword {
    $bytes = New-Object byte[] 32
    $generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $generator.GetBytes($bytes)
        return [Convert]::ToBase64String($bytes)
    }
    finally {
        $generator.Dispose()
        [Array]::Clear($bytes, 0, $bytes.Length)
    }
}

try {
    $connectionJson = $null
    if (-not [string]::IsNullOrEmpty($DefaultUrl)) {
        $defaultUri = $null
        # Confira tambem a forma original: Uri normaliza segmentos de caminho.
        $defaultUrlMatch = [regex]::Match($DefaultUrl,
            '\A(?i:https?)://[^/?#@\\\s]+(?<path>/tv|/display|/)?\z')
        if (-not $defaultUrlMatch.Success -or
            -not [Uri]::TryCreate($DefaultUrl, [UriKind]::Absolute, [ref]$defaultUri) -or
            ($defaultUri.Scheme -cne 'http' -and $defaultUri.Scheme -cne 'https') -or
            [string]::IsNullOrEmpty($defaultUri.Host) -or
            -not [string]::IsNullOrEmpty($defaultUri.UserInfo) -or
            -not [string]::IsNullOrEmpty($defaultUri.Query) -or
            -not [string]::IsNullOrEmpty($defaultUri.Fragment) -or
            $defaultUri.Port -eq 0 -or
            $defaultUri.AbsolutePath -cnotin @('/', '/tv', '/display')) {
            throw 'DefaultUrl deve ser uma URI absoluta http/https, sem credenciais, query ou fragmento, com caminho vazio, /, /tv ou /display.'
        }
        $defaultUrlBuilder = [UriBuilder]::new($defaultUri)
        if ($defaultUri.AbsolutePath -ceq '/') {
            $defaultUrlBuilder.Path = '/tv'
        }
        $connectionJson = @{ url = $defaultUrlBuilder.Uri.AbsoluteUri } |
            ConvertTo-Json -Compress
        if ($utf8.GetByteCount($connectionJson) -ge 4096) {
            throw 'DefaultUrl gera um fbs-connection.json que excede o limite de 4095 bytes.'
        }
    }

    $sdkPath = Resolve-RepositoryPath $SdkRoot
    $jdkPath = Resolve-RepositoryPath $JavaHome
    $outputPath = Resolve-RepositoryPath $OutputDirectory
    $signingPath = Resolve-RepositoryPath $SigningDirectory
    $mainPath = Join-Path $repoRoot 'projector/app/src/main'
    $manifestPath = Join-Path $mainPath 'AndroidManifest.xml'
    $javaPath = Join-Path $mainPath 'java'
    $resourcePath = Join-Path $mainPath 'res'
    $buildToolsPath = Join-Path (Join-Path $sdkPath 'build-tools') $BuildToolsVersion
    $platformPath = Join-Path (Join-Path $sdkPath 'platforms') $Platform
    $androidJar = Join-Path $platformPath 'android.jar'
    $jdkBin = Join-Path $jdkPath 'bin'
    $jdkRelease = Join-Path $jdkPath 'release'

    foreach ($directory in @($sdkPath, $jdkPath, $jdkBin, $mainPath, $javaPath,
            $resourcePath, $buildToolsPath, $platformPath)) {
        Assert-Directory $directory
    }
    foreach ($file in @($manifestPath, $androidJar, $jdkRelease)) {
        Assert-File $file
    }

    $releaseText = [System.IO.File]::ReadAllText($jdkRelease)
    if ($releaseText -notmatch '(?m)^JAVA_VERSION="21(?:[.\-+][^"]*)?"\s*$') {
        throw 'JavaHome deve apontar para um JDK 21 completo.'
    }

    $aapt2 = Resolve-WindowsTool $buildToolsPath 'aapt2'
    $d8 = Resolve-WindowsTool $buildToolsPath 'd8'
    $zipalign = Resolve-WindowsTool $buildToolsPath 'zipalign'
    $apksigner = Resolve-WindowsTool $buildToolsPath 'apksigner'
    $javac = Resolve-WindowsTool $jdkBin 'javac'
    $jar = Resolve-WindowsTool $jdkBin 'jar'
    $keytool = Resolve-WindowsTool $jdkBin 'keytool'

    # Git apenas verifica exclusoes existentes; o script nao altera ignores.
    $gitCommand = Get-Command 'git.exe' -CommandType Application -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if ($null -eq $gitCommand) {
        throw 'git.exe e necessario para comprovar que os arquivos de assinatura estao ignorados.'
    }
    $git = $gitCommand.Path
    Assert-File $git

    foreach ($forbidden in @((Join-Path $repoRoot 'dist'),
            (Join-Path $repoRoot 'pendrive'), $outputPath)) {
        if (Test-WithinDirectory $signingPath $forbidden) {
            throw 'SigningDirectory deve ficar fora de dist, pendrive e da pasta de saida.'
        }
    }
    if (Test-WithinDirectory $outputPath $signingPath) {
        throw 'OutputDirectory nao pode ficar dentro de SigningDirectory.'
    }

    $keystorePath = Join-Path $signingPath 'persistent.jks'
    $metadataPath = Join-Path $signingPath 'signing.json'
    $lockPath = Join-Path $signingPath 'signing.lock'
    foreach ($ignoredPath in @($keystorePath, $metadataPath, $lockPath)) {
        $gitIgnoredPath = ConvertTo-RepositoryRelativePath $ignoredPath
        & $git -c "safe.directory=$repoRoot" -C $repoRoot check-ignore --quiet -- $gitIgnoredPath
        $ignoreExitCode = $LASTEXITCODE
        if ($ignoreExitCode -ne 0) {
            throw "Assinatura bloqueada: '$ignoredPath' deve estar ignorado e fora do indice Git. git check-ignore terminou com codigo $ignoreExitCode. Configure uma exclusao local antes de executar novamente."
        }
    }

    $xmlSettings = [System.Xml.XmlReaderSettings]::new()
    $xmlSettings.DtdProcessing = [System.Xml.DtdProcessing]::Prohibit
    $xmlSettings.XmlResolver = $null
    $xmlReader = [System.Xml.XmlReader]::Create($manifestPath, $xmlSettings)
    try {
        $manifest = [System.Xml.XmlDocument]::new()
        $manifest.XmlResolver = $null
        $manifest.Load($xmlReader)
    }
    finally {
        $xmlReader.Dispose()
    }
    if ($manifest.DocumentElement.Name -ne 'manifest') {
        throw 'AndroidManifest.xml nao possui um elemento raiz manifest.'
    }
    $androidNamespace = 'http://schemas.android.com/apk/res/android'
    $versionName = $manifest.DocumentElement.GetAttribute('versionName', $androidNamespace)
    if ($versionName -notmatch '^[A-Za-z0-9][A-Za-z0-9._+\-]*$') {
        throw 'versionName deve ser um valor literal seguro para o nome do APK.'
    }
    $sdkElement = $manifest.SelectSingleNode('/manifest/uses-sdk')
    if ($null -eq $sdkElement -or
        $sdkElement.GetAttribute('minSdkVersion', $androidNamespace) -ne '24' -or
        $sdkElement.GetAttribute('targetSdkVersion', $androidNamespace) -ne '34') {
        throw 'O Manifest deve declarar minSdkVersion=24 e targetSdkVersion=34.'
    }
    $sourceFiles = @(Get-ChildItem -LiteralPath $javaPath -Filter '*.java' -File -Recurse)
    if ($sourceFiles.Count -eq 0) {
        throw "Nenhum arquivo Java encontrado em $javaPath"
    }

    # Os launchers .bat do Android SDK devem usar o JDK informado.
    $env:JAVA_HOME = $jdkPath
    [System.IO.Directory]::CreateDirectory($signingPath) | Out-Null
    try {
        $signingLock = [System.IO.File]::Open($lockPath,
            [System.IO.FileMode]::OpenOrCreate, [System.IO.FileAccess]::ReadWrite,
            [System.IO.FileShare]::None)
    }
    catch {
        throw 'Nao foi possivel obter o lock de assinatura. Verifique outro build ativo e as permissoes de SigningDirectory.'
    }

    try {
        $hasKeystore = Test-Path -LiteralPath $keystorePath
        $hasMetadata = Test-Path -LiteralPath $metadataPath
        if ($hasKeystore -ne $hasMetadata) {
            throw 'Assinatura incompleta: persistent.jks e signing.json devem existir juntos. Restaure o par original; nenhuma chave sera sobrescrita.'
        }

        if ($hasKeystore) {
            Assert-File $keystorePath
            Assert-File $metadataPath
            try {
                $metadata = [System.IO.File]::ReadAllText($metadataPath, $utf8) |
                    ConvertFrom-Json
            }
            catch {
                throw 'signing.json invalido. Restaure o JSON original correspondente ao keystore.'
            }
            if ($null -eq $metadata -or
                $null -eq $metadata.PSObject.Properties['alias'] -or
                $null -eq $metadata.PSObject.Properties['password']) {
                throw 'signing.json deve conter alias e password.'
            }
            if ($metadata.alias -cne $keyAlias -or
                $metadata.password -isnot [string] -or
                [string]::IsNullOrWhiteSpace($metadata.password)) {
                throw 'signing.json possui alias ou senha invalidos.'
            }
            $env:FBS_PROJECTOR_KEYPASS = $metadata.password
            $metadata = $null
        }
        else {
            $env:FBS_PROJECTOR_KEYPASS = New-SigningPassword
            Invoke-Native -Executable $keytool -PathArgumentIndices @(3) -Arguments @(
                '-genkeypair', '-noprompt', '-keystore', $keystorePath,
                '-storetype', 'JKS', '-alias', $keyAlias,
                '-keyalg', 'RSA', '-keysize', '3072', '-validity', '10000',
                '-dname', 'CN=FBS Tela',
                '-storepass:env', 'FBS_PROJECTOR_KEYPASS',
                '-keypass:env', 'FBS_PROJECTOR_KEYPASS'
            )
            Assert-File $keystorePath
            $metadata = [ordered]@{
                schemaVersion = 1
                alias = $keyAlias
                password = $env:FBS_PROJECTOR_KEYPASS
            }
            # CreateNew impede a substituicao de credenciais existentes.
            $metadataStream = [System.IO.File]::Open($metadataPath,
                [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::Write,
                [System.IO.FileShare]::None)
            try {
                $metadataWriter = [System.IO.StreamWriter]::new($metadataStream, $utf8)
                try {
                    $metadataWriter.Write(($metadata | ConvertTo-Json) + "`n")
                }
                finally {
                    $metadataWriter.Dispose()
                }
            }
            finally {
                $metadataStream.Dispose()
                $metadata = $null
            }
        }

        Invoke-Native -Executable $keytool -PathArgumentIndices @(2) -Arguments @(
            '-list', '-keystore', $keystorePath, '-storetype', 'JKS',
            '-alias', $keyAlias, '-storepass:env', 'FBS_PROJECTOR_KEYPASS'
        )
    }
    finally {
        $signingLock.Dispose()
    }

    [System.IO.Directory]::CreateDirectory($outputPath) | Out-Null
    $workPath = Join-Path $outputPath ('build-' + [Guid]::NewGuid().ToString('N'))
    if (Test-Path -LiteralPath $workPath) {
        throw "A pasta exclusiva de build ja existe: $workPath"
    }
    New-Item -ItemType Directory -Path $workPath | Out-Null
    $generatedPath = Join-Path $workPath 'gen'
    $classesPath = Join-Path $workPath 'classes'
    $dexPath = Join-Path $workPath 'dex'
    foreach ($directory in @($generatedPath, $classesPath, $dexPath)) {
        [System.IO.Directory]::CreateDirectory($directory) | Out-Null
    }

    $compiledZip = Join-Path $workPath 'compiled.zip'
    $resourcesApk = Join-Path $workPath 'resources.apk'
    $classesJar = Join-Path $workPath 'classes.jar'
    $unsignedApk = Join-Path $workPath 'unsigned.apk'
    $alignedApk = Join-Path $workPath 'aligned.apk'
    $apkName = "fbs-tela-$versionName.apk"
    $signedApk = Join-Path $workPath $apkName
    $finalApk = Join-Path $outputPath $apkName

    $linkArguments = @(
        'link', '-I', $androidJar, '--manifest', $manifestPath,
        '--java', $generatedPath, '-o', $resourcesApk, $compiledZip
    )
    $linkPathArgumentIndices = @(2, 4, 6, 8, 9)
    if ($null -ne $connectionJson) {
        $assetsPath = Join-Path $workPath 'assets'
        [System.IO.Directory]::CreateDirectory($assetsPath) | Out-Null
        [System.IO.File]::WriteAllText(
            (Join-Path $assetsPath 'fbs-connection.json'), $connectionJson, $utf8)
        $linkArguments += @('-A', $assetsPath)
        $linkPathArgumentIndices += 11
    }
    if ($VersionCode -eq 0) {
        $VersionCode = [int][Math]::Floor(([DateTime]::UtcNow - [DateTime]::new(2026, 1, 1, 0, 0, 0, [DateTimeKind]::Utc)).TotalMinutes) + 1000
    }
    $linkArguments += @('--version-code', [string]$VersionCode, '--replace-version')
    Write-Host "versionName $versionName, versionCode $VersionCode"

    Invoke-Native -Executable $aapt2 -PathArgumentIndices @(2, 4) -Arguments @(
        'compile', '--dir', $resourcePath, '-o', $compiledZip
    )
    Invoke-Native -Executable $aapt2 -Arguments $linkArguments -PathArgumentIndices $linkPathArgumentIndices

    [string[]]$javaSources = @(Get-ChildItem -LiteralPath @($javaPath, $generatedPath) -Filter '*.java' -File -Recurse |
        ForEach-Object { $_.FullName })
    [Array]::Sort($javaSources, [System.StringComparer]::Ordinal)
    # Argfile evita o limite de linha de comando do Windows. Seus caminhos
    # usam barras normais para nao introduzir escapes no parser do javac.
    $sourceListPath = Join-Path $workPath 'java-sources.args'
    $sourceLines = @($javaSources | ForEach-Object {
        '"' + $_.Replace('\', '/') + '"'
    })
    [System.IO.File]::WriteAllText($sourceListPath,
        (($sourceLines -join "`n") + "`n"), $utf8)
    Invoke-Native -Executable $javac -PathArgumentIndices @(7, 9, 10) -Arguments @(
        '-encoding', 'UTF-8', '-source', '8', '-target', '8',
        '-bootclasspath', $androidJar, '-d', $classesPath,
        ('@' + $sourceListPath)
    )
    # JDK 21 permite fixar timestamps das entradas ZIP criadas pelo jar.
    Invoke-Native -Executable $jar -PathArgumentIndices @(2, 5) -Arguments @(
        '--create', '--file', $classesJar, "--date=$zipDate",
        '-C', $classesPath, '.'
    )
    Invoke-Native -Executable $d8 -PathArgumentIndices @(1, 5, 6) -Arguments @(
        '--lib', $androidJar, '--min-api', '24',
        '--output', $dexPath, $classesJar
    )
    Assert-File (Join-Path $dexPath 'classes.dex')
    $dexFiles = @(Get-ChildItem -LiteralPath $dexPath -Filter '*.dex' -File)
    if ($dexFiles.Count -ne 1) {
        throw 'O build exige um unico classes.dex; foram gerados multiplos arquivos DEX.'
    }
    Assert-File $resourcesApk
    Copy-Item -LiteralPath $resourcesApk -Destination $unsignedApk
    Invoke-Native -Executable $jar -PathArgumentIndices @(2, 5) -Arguments @(
        '--update', '--file', $unsignedApk, "--date=$zipDate",
        '-C', $dexPath, 'classes.dex'
    )
    Invoke-Native -Executable $zipalign -PathArgumentIndices @(2, 3) -Arguments @(
        '-f', '4', $unsignedApk, $alignedApk
    )
    Invoke-Native -Executable $apksigner -PathArgumentIndices @(2, 10, 11) -Arguments @(
        'sign', '--ks', $keystorePath, '--ks-key-alias', $keyAlias,
        '--ks-pass', 'env:FBS_PROJECTOR_KEYPASS',
        '--key-pass', 'env:FBS_PROJECTOR_KEYPASS',
        '--out', $signedApk, $alignedApk
    )
    Invoke-Native -Executable $apksigner -PathArgumentIndices @(3) -Arguments @(
        'verify', '--verbose', '--print-certs', $signedApk
    )
    Invoke-Native -Executable $aapt2 -PathArgumentIndices @(2) -Arguments @(
        'dump', 'badging', $signedApk
    )

    Assert-File $signedApk
    Copy-Item -LiteralPath $signedApk -Destination $finalApk -Force
    $sha256 = (Get-FileHash -LiteralPath $finalApk -Algorithm SHA256).Hash.ToLowerInvariant()
    $checksumPath = $finalApk + '.sha256'
    [System.IO.File]::WriteAllText($checksumPath, "$sha256  $apkName`n", $utf8)
    Write-Host "APK: $finalApk"
    Write-Host "SHA256: $checksumPath"
    Write-Host "Arquivos intermediarios preservados em: $workPath"
}
finally {
    [Environment]::SetEnvironmentVariable('FBS_PROJECTOR_KEYPASS', $null, 'Process')
    [Environment]::SetEnvironmentVariable('JAVA_HOME', $previousJavaHome, 'Process')
}
