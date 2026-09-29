#!/bin/bash
set -e

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
CRYPTO_DIR="$ROOT_DIR/crypto-config"
CONFIGTX_DIR="$ROOT_DIR/configtx"
CHANNEL_NAME="grambankchannel"
CHAINCODE_NAME="auditcc"
CHAINCODE_VERSION="1.0"
CHAINCODE_PATH="github.com/chaincode"

clean() {
  echo "[FABRIC] Cleaning up..."
  rm -rf "$CRYPTO_DIR" "$CONFIGTX_DIR"
  docker-compose -f "$ROOT_DIR/docker/docker-compose.yaml" down -v 2>/dev/null || true
  echo "[FABRIC] Cleanup complete"
}

generate() {
  echo "[FABRIC] Generating crypto material..."
  mkdir -p "$CONFIGTX_DIR"

  cat > "$ROOT_DIR/crypto-config.yaml" << EOF
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
EOF

  cryptogen generate --config="$ROOT_DIR/crypto-config.yaml" --output="$CRYPTO_DIR"

  configtxgen -profile GramBankChannelGenesis -channelID system-channel \
    -outputBlock "$CONFIGTX_DIR/genesis.block" -configPath "$ROOT_DIR/docker"
  configtxgen -profile GramBankChannelGenesis -outputCreateChannelTx "$CONFIGTX_DIR/channel.tx" \
    -channelID "$CHANNEL_NAME" -configPath "$ROOT_DIR/docker"
  configtxgen -profile GramBankChannelGenesis -outputAnchorPeersUpdate "$CONFIGTX_DIR/GramBankMSPanchors.tx" \
    -channelID "$CHANNEL_NAME" -asOrg GramBankMSP -configPath "$ROOT_DIR/docker"

  echo "[FABRIC] Crypto material generated"
}

start() {
  echo "[FABRIC] Starting network..."
  docker-compose -f "$ROOT_DIR/docker/docker-compose.yaml" up -d
  echo "[FABRIC] Network started"
}

create_channel() {
  echo "[FABRIC] Creating channel $CHANNEL_NAME..."
  docker exec cli.grambank.com peer channel create -o orderer.grambank.com:7050 \
    -c "$CHANNEL_NAME" -f /etc/hyperledger/configtx/channel.tx \
    --tls --cafile /etc/hyperledger/tls/ca.crt
  docker exec cli.grambank.com peer channel join -b "${CHANNEL_NAME}.block" \
    --tls --cafile /etc/hyperledger/tls/ca.crt
  echo "[FABRIC] Channel created and peer joined"
}

install_chaincode() {
  echo "[FABRIC] Installing chaincode..."
  docker exec cli.grambank.com peer lifecycle chaincode package "${CHAINCODE_NAME}.tar.gz" \
    --path "$CHAINCODE_PATH" --lang node --label "${CHAINCODE_NAME}_${CHAINCODE_VERSION}"
  docker exec cli.grambank.com peer lifecycle chaincode install "${CHAINCODE_NAME}.tar.gz"

  PACKAGE_ID=$(docker exec cli.grambank.com peer lifecycle chaincode queryinstalled 2>&1 \
    | grep "${CHAINCODE_NAME}" | awk -F 'Package ID: ' '{print $2}' | awk -F ', Label' '{print $1}')

  docker exec cli.grambank.com peer lifecycle chaincode approveformyorg \
    -o orderer.grambank.com:7050 --tls --cafile /etc/hyperledger/tls/ca.crt \
    --channelID "$CHANNEL_NAME" --name "$CHAINCODE_NAME" --version "$CHAINCODE_VERSION" \
    --package-id "$PACKAGE_ID" --sequence 1

  docker exec cli.grambank.com peer lifecycle chaincode checkcommitreadiness \
    --channelID "$CHANNEL_NAME" --name "$CHAINCODE_NAME" --version "$CHAINCODE_VERSION" \
    --sequence 1 --tls --cafile /etc/hyperledger/tls/ca.crt

  docker exec cli.grambank.com peer lifecycle chaincode commit \
    -o orderer.grambank.com:7050 --tls --cafile /etc/hyperledger/tls/ca.crt \
    --channelID "$CHANNEL_NAME" --name "$CHAINCODE_NAME" --version "$CHAINCODE_VERSION" \
    --sequence 1

  echo "[FABRIC] Chaincode installed and committed"
}

stop() {
  echo "[FABRIC] Stopping network..."
  docker-compose -f "$ROOT_DIR/docker/docker-compose.yaml" stop
  echo "[FABRIC] Network stopped"
}

status() {
  docker-compose -f "$ROOT_DIR/docker/docker-compose.yaml" ps
}

case "${1:-help}" in
  clean) clean ;;
  generate) generate ;;
  start) start ;;
  create-channel) create_channel ;;
  install-chaincode) install_chaincode ;;
  stop) stop ;;
  status) status ;;
  all)
    clean
    generate
    start
    create_channel
    install_chaincode
    echo "[FABRIC] Full setup complete!"
    ;;
  *)
    echo "Usage: $0 [action]

Actions:
  clean              - Remove all crypto material and stop network
  generate           - Generate crypto material and genesis block
  start              - Start the Docker network
  create-channel     - Create and join channel
  install-chaincode  - Install and commit chaincode
  stop               - Stop the network
  status             - Show container status
  all                - Run full setup (clean -> generate -> start -> channel -> chaincode)
"
    ;;
esac
