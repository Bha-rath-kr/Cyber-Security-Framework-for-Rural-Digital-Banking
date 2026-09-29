<#
.SYNOPSIS
  Hyperledger Fabric test network setup for GramBank on Windows.

.DESCRIPTION
  Sets up a complete Fabric test network using Docker Desktop.
  Handles Windows path spaces via short 8.3 path conversion.

.PARAMETER Action
  clean | generate | start | create-channel | install-chaincode | stop | status | all
#>

param(
  [string]$Action = "start"
)

$ROOT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path
$CHANNEL_NAME = "grambankchannel"
$CHAINCODE_NAME = "auditcc"
$CHAINCODE_VERSION = "1.0"
$CHAINCODE_PATH = "/opt/gopath/src/github.com/chaincode"

# -------------------------------------------------------------------
# HELPER: Convert a path to Windows short (8.3) form.
# This eliminates spaces for cryptogen, configtxgen, and Docker mounts.
# -------------------------------------------------------------------
function Get-ShortPath {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) {
    New-Item -ItemType Directory -Path $Path -Force | Out-Null
  }
  $temp = cmd /c "for %A in (`"$Path`") do @echo %~sA" 2>&1
  if ($LASTEXITCODE -eq 0 -and $temp) { return $temp.Trim() }
  # Fallback: return raw path with spaces intact
  return $Path
}

$CRYPTO_DIR_SHORT = Get-ShortPath (Join-Path $ROOT_DIR "crypto-config")
$CONFIGTX_DIR_SHORT = Get-ShortPath (Join-Path $ROOT_DIR "configtx")
$CRYPTO_YAML_SHORT  = Get-ShortPath (Join-Path $ROOT_DIR "crypto-config.yaml")

# -------------------------------------------------------------------
# HELPER: Dynamically detect the running CLI container name.
# Docker Compose v2 assigns names like docker-cli.grambank.com-1
# which differs from the compose service name cli.grambank.com.
# -------------------------------------------------------------------
function Get-CliContainer {
  $name = docker ps --filter "name=cli" --format "{{.Names}}" | Select-Object -First 1
  if (-not $name) {
    throw "CLI container not found. Run 'start' action first."
  }
  Write-Host "[FABRIC] Using CLI container: $name" -ForegroundColor Gray
  return $name
}

# Orderer TLS CA cert path inside the CLI container
$ORDERER_CA = "/etc/hyperledger/fabric/ordererOrganizations/grambank.com/tlsca/tlsca.grambank.com-cert.pem"
$DOCKER_COMPOSE_FILE = Get-ShortPath (Join-Path $ROOT_DIR "docker/docker-compose.yaml")
$DOCKER_DIR_SHORT    = Get-ShortPath (Join-Path $ROOT_DIR "docker")

# -------------------------------------------------------------------
# DOCKER PRE-CHECK
# -------------------------------------------------------------------
function Assert-DockerReady {
  Write-Host "[FABRIC] Checking Docker..." -ForegroundColor Cyan
  try {
    $dockerVer = docker --version 2>&1
    if ($LASTEXITCODE -ne 0 -or -not $dockerVer) { throw "Docker not found" }
    Write-Host "  $dockerVer" -ForegroundColor Green

    $composeVer = docker compose version 2>&1
    if ($LASTEXITCODE -ne 0 -or -not $composeVer) { throw "docker compose not found" }
    Write-Host "  $composeVer" -ForegroundColor Green

    # Verify Docker Engine is running
    $info = docker info 2>&1
    if ($LASTEXITCODE -ne 0) { throw "Docker Engine is not running" }
  } catch {
    Write-Host @"

  ERROR: Docker Desktop is required and must be running.

  1. Download from: https://www.docker.com/products/docker-desktop/
  2. Install and launch Docker Desktop
  3. Ensure WSL2 backend is enabled (Settings → General → Use WSL 2 based engine)
  4. Wait for "Engine running" in bottom-left of Docker Desktop

"@ -ForegroundColor Red
    throw "Docker not ready"
  }
  Write-Host "[FABRIC] Docker is ready" -ForegroundColor Green
}

# -------------------------------------------------------------------
# CLEAN
# -------------------------------------------------------------------
function clean {
  Write-Host "[FABRIC] Cleaning up..." -ForegroundColor Yellow
  $cryptoDir = Join-Path $ROOT_DIR "crypto-config"
  $configtxDir = Join-Path $ROOT_DIR "configtx"
  if (Test-Path $cryptoDir) { Remove-Item -Recurse -Force $cryptoDir -ErrorAction SilentlyContinue }
  if (Test-Path $configtxDir) { Remove-Item -Recurse -Force $configtxDir -ErrorAction SilentlyContinue }
  $walletPath = Join-Path $ROOT_DIR "wallet"
  if (Test-Path $walletPath) { Get-ChildItem -Path $walletPath -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force }
  $cryptoYaml = Join-Path $ROOT_DIR "crypto-config.yaml"
  if (Test-Path $cryptoYaml) {
    $item = Get-Item -LiteralPath $cryptoYaml -ErrorAction SilentlyContinue
    if ($item -and $item.PSIsContainer) {
      Remove-Item -Recurse -Force -LiteralPath $cryptoYaml -ErrorAction SilentlyContinue
    } else {
      Remove-Item -Force -LiteralPath $cryptoYaml -ErrorAction SilentlyContinue
    }
  }

  Write-Host "[FABRIC] Stopping any running containers..." -ForegroundColor Cyan
  docker compose -f "$DOCKER_COMPOSE_FILE" down -v 2>$null

  Write-Host "[FABRIC] Cleanup complete" -ForegroundColor Green
}

# -------------------------------------------------------------------
# GENERATE
# -------------------------------------------------------------------
function generate {
  Write-Host "[FABRIC] Generating crypto material..." -ForegroundColor Yellow

  # --- Ensure bin tools exist ---
  $cryptogenPath = Get-Command "cryptogen" -ErrorAction SilentlyContinue
  if (-not $cryptogenPath) {
    Write-Host "[FABRIC] cryptogen not found. Downloading Fabric v2.5.0 binaries..." -ForegroundColor Yellow
    $FABRIC_VERSION = "2.5.0"
    $BINARY_URL = "https://github.com/hyperledger/fabric/releases/download/v${FABRIC_VERSION}/hyperledger-fabric-windows-amd64-${FABRIC_VERSION}.tar.gz"
    $TEMP_DIR = Join-Path $env:TEMP "fabric-binaries"
    New-Item -ItemType Directory -Path $TEMP_DIR -Force | Out-Null

    $archivePath = Join-Path $TEMP_DIR "fabric.tar.gz"
    Write-Host "[FABRIC] Downloading..." -ForegroundColor Cyan
    Invoke-WebRequest -Uri $BINARY_URL -OutFile $archivePath -UseBasicParsing

    Write-Host "[FABRIC] Extracting..." -ForegroundColor Cyan
    tar -xzf $archivePath -C $TEMP_DIR 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Failed to extract Fabric binaries from $archivePath" }

    $env:PATH = "$TEMP_DIR\bin;$env:PATH"
    Write-Host "[FABRIC] Binaries at $TEMP_DIR\bin" -ForegroundColor Green

    $cryptogenPath = Get-Command "cryptogen" -ErrorAction SilentlyContinue
    if (-not $cryptogenPath) { throw "cryptogen still not found after extraction" }
  }

  # --- Clean and recreate output dirs ---
  $cryptoDir = Join-Path $ROOT_DIR "crypto-config"
  if (Test-Path $cryptoDir) { Remove-Item -Recurse -Force $cryptoDir -ErrorAction SilentlyContinue }
  New-Item -ItemType Directory -Path (Join-Path $ROOT_DIR "configtx") -Force | Out-Null
  New-Item -ItemType Directory -Path $cryptoDir -Force | Out-Null
  New-Item -ItemType Directory -Path (Join-Path $ROOT_DIR "wallet") -Force | Out-Null

  # --- Write crypto-config.yaml (ensure path is clear first) ---
  $cryptoYamlPath = Join-Path $ROOT_DIR "crypto-config.yaml"
  if (Test-Path -LiteralPath $cryptoYamlPath) {
    $item = Get-Item -LiteralPath $cryptoYamlPath -ErrorAction SilentlyContinue
    if ($item -and $item.PSIsContainer) {
      Remove-Item -Recurse -Force -LiteralPath $cryptoYamlPath -ErrorAction SilentlyContinue
    }
  }
  $cryptoYamlContent = @"
OrdererOrgs:
  - Name: Orderer
    Domain: grambank.com
    EnableNodeOUs: true
    Specs:
      - Hostname: orderer
PeerOrgs:
  - Name: GramBank
    Domain: grambank.com
    EnableNodeOUs: true
    Template:
      Count: 1
    Users:
      Count: 1
"@
  Set-Content -Path $cryptoYamlPath -Value $cryptoYamlContent -Force

  # --- RUN CRYPTOGEN (args as separate strings for safety) ---
  Write-Host "[FABRIC] Running cryptogen..." -ForegroundColor Cyan
  Write-Host "  Command: cryptogen generate --config $cryptoYamlPath --output $CRYPTO_DIR_SHORT" -ForegroundColor Gray
  & cryptogen generate --config "$cryptoYamlPath" --output "$CRYPTO_DIR_SHORT"
  $exitCode = $LASTEXITCODE
  if ($exitCode -ne 0) {
    Write-Host "[FABRIC:ERROR] cryptogen failed with exit code $exitCode" -ForegroundColor Red
    Write-Host "  Check that crypto-config.yaml is valid YAML." -ForegroundColor Red
    throw "cryptogen failed (exit $exitCode)"
  }
  Write-Host "[FABRIC] cryptogen succeeded" -ForegroundColor Green

  # --- Copy admin cert to admincerts dirs (cryptogen skips this with EnableNodeOUs) ---
  Write-Host "[FABRIC] Populating admincerts directories..." -ForegroundColor Cyan
  $peerOrgMSP = Join-Path $ROOT_DIR "crypto-config/peerOrganizations/grambank.com/msp"
  $adminSignCert = Join-Path $ROOT_DIR "crypto-config/peerOrganizations/grambank.com/users/Admin@grambank.com/msp/signcerts/Admin@grambank.com-cert.pem"
  $adminAdminCerts = Join-Path $ROOT_DIR "crypto-config/peerOrganizations/grambank.com/users/Admin@grambank.com/msp/admincerts"
  $orgAdminCerts = Join-Path $peerOrgMSP "admincerts"
  if (-not (Test-Path $adminAdminCerts)) { New-Item -ItemType Directory -Path $adminAdminCerts -Force | Out-Null }
  if (-not (Test-Path $orgAdminCerts)) { New-Item -ItemType Directory -Path $orgAdminCerts -Force | Out-Null }
  Copy-Item -Path $adminSignCert -Destination "$adminAdminCerts/Admin@grambank.com-cert.pem" -Force
  Copy-Item -Path $adminSignCert -Destination "$orgAdminCerts/Admin@grambank.com-cert.pem" -Force
  Write-Host "[FABRIC] Admin certs copied" -ForegroundColor Green

  # --- Fix Windows backslashes in generated MSP config.yaml files ---
  # cryptogen on Windows generates paths like cacerts\file.pem instead of
  # cacerts/file.pem. Linux containers require forward slashes, otherwise
  # TLS verification fails with "certificate signed by unknown authority".
  Write-Host "[FABRIC] Fixing MSP config.yaml path separators..." -ForegroundColor Cyan
  $fixedCount = 0
  Get-ChildItem -Path $CRYPTO_DIR_SHORT -Recurse -Filter "config.yaml" | ForEach-Object {
    $content = Get-Content -Path $_.FullName -Raw
    if ($content -match '\\') {
      $fixed = $content -replace '\\', '/'
      Set-Content -Path $_.FullName -Value $fixed -NoNewline -Force
      $fixedCount++
    }
  }
  Write-Host "[FABRIC] Fixed $fixedCount config.yaml files (backslash -> forward slash)" -ForegroundColor Green

  # --- RUN CONFIGTXGEN for genesis block ---
  Write-Host "[FABRIC] Generating genesis block..." -ForegroundColor Cyan
  $genesisBlock = Join-Path $ROOT_DIR "configtx/genesis.block"
  Write-Host "  Command: configtxgen -profile GramBankChannelGenesis -channelID system-channel -outputBlock $genesisBlock -configPath $DOCKER_DIR_SHORT" -ForegroundColor Gray
  & configtxgen -profile GramBankChannelGenesis -channelID system-channel -outputBlock "$genesisBlock" -configPath "$DOCKER_DIR_SHORT"
  if ($LASTEXITCODE -ne 0) { throw "configtxgen genesis block failed (exit $LASTEXITCODE)" }
  Write-Host "[FABRIC] Genesis block created" -ForegroundColor Green

  # --- RUN CONFIGTXGEN for channel tx ---
  Write-Host "[FABRIC] Creating channel tx..." -ForegroundColor Cyan
  $channelTx = Join-Path $ROOT_DIR "configtx/channel.tx"
  & configtxgen -profile GramBankChannel -outputCreateChannelTx "$channelTx" -channelID $CHANNEL_NAME -configPath "$DOCKER_DIR_SHORT"
  if ($LASTEXITCODE -ne 0) { throw "configtxgen channel tx failed (exit $LASTEXITCODE)" }
  Write-Host "[FABRIC] Channel tx created" -ForegroundColor Green

  # --- RUN CONFIGTXGEN for anchor peer ---
  Write-Host "[FABRIC] Generating anchor peer tx..." -ForegroundColor Cyan
  $anchorTx = Join-Path $ROOT_DIR "configtx/GramBankMSPanchors.tx"
  & configtxgen -profile GramBankChannel -outputAnchorPeersUpdate "$anchorTx" -channelID $CHANNEL_NAME -asOrg GramBankMSP -configPath "$DOCKER_DIR_SHORT"
  if ($LASTEXITCODE -ne 0) { throw "configtxgen anchor peer failed (exit $LASTEXITCODE)" }
  Write-Host "[FABRIC] Anchor peer tx created" -ForegroundColor Green

  Write-Host "[FABRIC] Crypto material generated successfully" -ForegroundColor Green
}

# -------------------------------------------------------------------
# START NETWORK
# -------------------------------------------------------------------
function startNetwork {
  Assert-DockerReady

  Write-Host "[FABRIC] Starting Hyperledger Fabric network..." -ForegroundColor Yellow
  Write-Host "  Compose file: $DOCKER_COMPOSE_FILE" -ForegroundColor Gray

  docker compose -f "$DOCKER_COMPOSE_FILE" up -d
  if ($LASTEXITCODE -ne 0) { throw "docker compose up failed (exit $LASTEXITCODE)" }

  Write-Host "[FABRIC] Waiting 25s for containers to initialize..." -ForegroundColor Cyan
  Start-Sleep -Seconds 25

  Write-Host "[FABRIC] Verifying containers..." -ForegroundColor Cyan
  docker compose -f "$DOCKER_COMPOSE_FILE" ps
  $status = docker compose -f "$DOCKER_COMPOSE_FILE" ps --status running 2>&1
  $running = ($status | Select-String -Pattern "Up" | Measure-Object).Count
  if ($running -lt 3) {
    Write-Host "[FABRIC:WARNING] Only $running/5 containers are running. Check 'docker compose ps' for details." -ForegroundColor Yellow
  } else {
    Write-Host "[FABRIC] $running/5 containers running" -ForegroundColor Green
  }
  Write-Host "[FABRIC] Network started" -ForegroundColor Green
}

# -------------------------------------------------------------------
# CREATE CHANNEL
# -------------------------------------------------------------------
function createChannel {
  Assert-DockerReady

  Write-Host "[FABRIC] Creating channel $CHANNEL_NAME..." -ForegroundColor Yellow

  $CLI = Get-CliContainer

  Write-Host "[FABRIC] Exec: peer channel create..." -ForegroundColor Cyan
  docker exec $CLI sh -c "peer channel create -o orderer.grambank.com:7050 -c $CHANNEL_NAME -f /etc/hyperledger/configtx/channel.tx --tls --cafile $ORDERER_CA"
  if ($LASTEXITCODE -ne 0) { throw "Channel creation failed" }

  Write-Host "[FABRIC] Exec: peer channel join..." -ForegroundColor Cyan
  docker exec $CLI sh -c "peer channel join -b ${CHANNEL_NAME}.block --tls --cafile $ORDERER_CA"
  if ($LASTEXITCODE -ne 0) { throw "Peer join channel failed" }

  Write-Host "[FABRIC] Channel '$CHANNEL_NAME' created and peer joined" -ForegroundColor Green
}

# -------------------------------------------------------------------
# INSTALL CHAINCODE
# -------------------------------------------------------------------
function installChaincode {
  Assert-DockerReady

  Write-Host "[FABRIC] Installing chaincode $CHAINCODE_NAME v$CHAINCODE_VERSION..." -ForegroundColor Yellow

  $CLI = Get-CliContainer

  Write-Host "[FABRIC] Packaging chaincode..." -ForegroundColor Cyan
  docker exec $CLI sh -c "peer lifecycle chaincode package ${CHAINCODE_NAME}.tar.gz --path $CHAINCODE_PATH --lang node --label ${CHAINCODE_NAME}_${CHAINCODE_VERSION}"
  $pkgExit = $LASTEXITCODE
  if ($pkgExit -ne 0) {
    # Ignore error if .tar.gz already exists
    Write-Host "[FABRIC] Package step returned $pkgExit (may already exist)" -ForegroundColor Yellow
  }

  Write-Host "[FABRIC] Installing chaincode..." -ForegroundColor Cyan
  $installOut = docker exec $CLI sh -c "peer lifecycle chaincode install ${CHAINCODE_NAME}.tar.gz" 2>&1
  $installExit = $LASTEXITCODE
  if ($installExit -ne 0) {
    if ($installOut -match "chaincode already successfully installed") {
      Write-Host "[FABRIC] Chaincode already installed" -ForegroundColor Yellow
    } else {
      Write-Host $installOut -ForegroundColor Red
      throw "Chaincode install failed"
    }
  }

  Write-Host "[FABRIC] Querying package ID..." -ForegroundColor Cyan
  $raw = docker exec $CLI sh -c "peer lifecycle chaincode queryinstalled 2>&1"
  $rawStr = ($raw | Out-String).Trim()
  Write-Host "  $rawStr" -ForegroundColor Gray

  # Extract package ID (text between "Package ID: " and ", Label:")
  if ($rawStr -match 'Package ID:\s*(\S+),') {
    $PACKAGE_ID = $Matches[1]
  } else {
    throw "Could not extract package ID from: $rawStr"
  }
  Write-Host "[FABRIC] Package ID: $PACKAGE_ID" -ForegroundColor Cyan

  Write-Host "[FABRIC] Approving chaincode for org..." -ForegroundColor Cyan
  $approveOut = docker exec $CLI sh -c "peer lifecycle chaincode approveformyorg -o orderer.grambank.com:7050 --tls --cafile $ORDERER_CA --channelID $CHANNEL_NAME --name $CHAINCODE_NAME --version $CHAINCODE_VERSION --package-id '$PACKAGE_ID' --sequence 1 --waitForEvent" 2>&1
  $approveExit = $LASTEXITCODE
  if ($approveExit -ne 0) {
    if ($approveOut -match "already" -or $approveOut -match "timed out") {
      Write-Host "[FABRIC] Approve step returned: $approveOut" -ForegroundColor Yellow
      Write-Host "[FABRIC] Will check commit readiness directly..." -ForegroundColor Cyan
    } else {
      Write-Host $approveOut -ForegroundColor Red
      throw "Chaincode approval failed"
    }
  }

  Write-Host "[FABRIC] Checking commit readiness..." -ForegroundColor Cyan
  $readinessOut = docker exec $CLI sh -c "peer lifecycle chaincode checkcommitreadiness --channelID $CHANNEL_NAME --name $CHAINCODE_NAME --version $CHAINCODE_VERSION --sequence 1 --tls --cafile $ORDERER_CA" 2>&1
  if ($LASTEXITCODE -ne 0) {
    Write-Host $readinessOut -ForegroundColor Yellow
    Write-Host "[FABRIC] Trying sequence 2 (if already at seq 1)..." -ForegroundColor Cyan
    $readinessOut = docker exec $CLI sh -c "peer lifecycle chaincode checkcommitreadiness --channelID $CHANNEL_NAME --name $CHAINCODE_NAME --version $CHAINCODE_VERSION --sequence 2 --tls --cafile $ORDERER_CA" 2>&1
    if ($LASTEXITCODE -ne 0) { throw "Chaincode commit readiness check failed at both sequences" }
    $CHAINCODE_SEQUENCE = 2
  } else {
    $CHAINCODE_SEQUENCE = 1
  }
  Write-Host "[FABRIC] Using sequence $CHAINCODE_SEQUENCE" -ForegroundColor Cyan

  Write-Host "[FABRIC] Committing chaincode..." -ForegroundColor Cyan
  $commitOut = docker exec $CLI sh -c "peer lifecycle chaincode commit -o orderer.grambank.com:7050 --tls --cafile $ORDERER_CA --channelID $CHANNEL_NAME --name $CHAINCODE_NAME --version $CHAINCODE_VERSION --sequence $CHAINCODE_SEQUENCE" 2>&1
  $commitExit = $LASTEXITCODE
  if ($commitExit -ne 0) {
    if ($commitOut -match "already" -or $commitOut -match "MVCC_READ_CONFLICT") {
      Write-Host "[FABRIC] Commit may already be done (MVCC conflict): $commitOut" -ForegroundColor Yellow
    } else {
      Write-Host $commitOut -ForegroundColor Red
      throw "Chaincode commit failed"
    }
  }

  Write-Host "[FABRIC] Chaincode $CHAINCODE_NAME v$CHAINCODE_VERSION installed and committed" -ForegroundColor Green
}

# -------------------------------------------------------------------
# ENROLL ADMIN USER FOR SDK
# -------------------------------------------------------------------
function enrollAdminUser {
  Write-Host "[FABRIC] Preparing admin wallet for SDK..." -ForegroundColor Yellow

  Write-Host "[FABRIC] NOTE: For production SDK wallet, use the Node.js enrollAdmin.js script." -ForegroundColor Cyan
  Write-Host "[FABRIC] The fabricClient.js will auto-enroll if wallet is empty." -ForegroundColor Cyan

  Write-Host "[FABRIC] Admin wallet prepared" -ForegroundColor Green
}

# -------------------------------------------------------------------
# STOP NETWORK
# -------------------------------------------------------------------
function stopNetwork {
  Assert-DockerReady

  Write-Host "[FABRIC] Stopping network..." -ForegroundColor Yellow
  docker compose -f "$DOCKER_COMPOSE_FILE" stop
  if ($LASTEXITCODE -ne 0) { Write-Host "[FABRIC] Warning: stop returned exit $LASTEXITCODE" -ForegroundColor Red }
  Write-Host "[FABRIC] Network stopped" -ForegroundColor Green
}

# -------------------------------------------------------------------
# STATUS
# -------------------------------------------------------------------
function showStatus {
  if (-not (Test-Path $DOCKER_COMPOSE_FILE)) {
    Write-Host "[FABRIC] Docker compose file not found at $DOCKER_COMPOSE_FILE" -ForegroundColor Red
    return
  }
  Write-Host "[FABRIC] Network status:" -ForegroundColor Yellow
  docker compose -f "$DOCKER_COMPOSE_FILE" ps
}

# -------------------------------------------------------------------
# DISPATCH
# -------------------------------------------------------------------
try {
  switch ($Action.ToLower()) {
    "clean"            { clean }
    "generate"         { generate }
    "start"            { startNetwork }
    "create-channel"   { createChannel }
    "install-chaincode" { installChaincode }
    "enroll-admin"     { enrollAdminUser }
    "stop"             { stopNetwork }
    "status"           { showStatus }
    "all" {
      clean
      generate
      startNetwork
      createChannel
      installChaincode
      enrollAdminUser
      Write-Host "[FABRIC] Full setup complete!" -ForegroundColor Green
    }
    default {
@"
Usage: .\setup-fabric.ps1 [action]

Actions:
  clean              - Remove crypto material + stop network
  generate           - Generate crypto material + genesis block
  start              - Start Docker network
  create-channel     - Create channel + join peer
  install-chaincode  - Package + install + approve + commit chaincode
  enroll-admin       - Prepare admin wallet for SDK
  stop               - Stop the network
  status             - Show container status
  all                - Run full setup (clean → generate → start → channel → chaincode)
"@ | Write-Host

}
  }
} catch {
  Write-Host ""
  Write-Host "FABRIC SETUP FAILED" -ForegroundColor Red
  Write-Host "Error: $_" -ForegroundColor Red
  Write-Host ""
  Write-Host "TROUBLESHOOTING:" -ForegroundColor Yellow
  Write-Host "1. Ensure Docker Desktop is running" -ForegroundColor Yellow
  Write-Host "2. Check crypto-config.yaml" -ForegroundColor Yellow
  Write-Host "3. Run steps individually" -ForegroundColor Yellow
  Write-Host '4. Consider moving project to C:\GramBankAPI' -ForegroundColor Yellow
  exit 1
}
