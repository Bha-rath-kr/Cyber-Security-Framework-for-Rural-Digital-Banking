const brain = require('brain.js');
const fs = require('fs');
const path = require('path');

const modelPath = path.join(__dirname, '..', 'data', 'anomaly-model.json');

let net;

function buildNetwork() {
  net = new brain.NeuralNetwork({ hiddenLayers: [8, 6] });
}

function normalizeFeatures(r) {
  return {
    amount: (r.amount || 0) / 10000,
    hour: (r.hour || 0) / 24,
    day: (r.day || 0) / 7,
    txns_24h: (r.txns_last_24h || 0) / 50,
    avg7d: (r.avg_amount_7d || 0) / 10000,
    balance: (r.balance_before || 0) / 20000,
    loc_delta: (r.location_delta_km || 0) / 1000,
    is_foreign: (r.is_foreign_device || 0)
  };
}

async function trainFromDataset(datasetFile) {
  if (!datasetFile) {
    datasetFile = path.join(__dirname, '..', 'data', 'ml_fraud_dataset_50.json');
  }
  try {
    let raw = fs.readFileSync(datasetFile, 'utf8');
    if (raw.charCodeAt(0) === 0xFEFF) {
      raw = raw.slice(1);
    }
    const rows = JSON.parse(raw);
    const normal = rows.filter(r => r.is_fraud === 0).map(r => {
      return { input: normalizeFeatures(r), output: normalizeFeatures(r) };
    });
    if (normal.length === 0) return;
    if (!net) buildNetwork();

    net.train(normal, { iterations: 300, log: true, logPeriod: 100, learningRate: 0.01 });
    fs.writeFileSync(modelPath, JSON.stringify(net.toJSON()), 'utf8');
    console.log('[ML] Model trained and saved');
  } catch (err) {
    console.error('[ML] Train error:', err.message);
  }
}

function loadModelIfExists() {
  try {
    if (fs.existsSync(modelPath)) {
      const json = JSON.parse(fs.readFileSync(modelPath, 'utf8'));
      net = new brain.NeuralNetwork();
      net.fromJSON(json);
      console.log('[ML] Model loaded from disk');
      return true;
    }
  } catch (err) {
    console.error('[ML] Load model error:', err.message);
  }
  return false;
}

async function scoreAnomaly(features) {
  if (!net) {
    const ok = loadModelIfExists();
    if (!ok) {
      buildNetwork();
      return 0.0;
    }
  }
  const input = normalizeFeatures(features);
  const out = net.run(input);
  let err = 0;
  const keys = Object.keys(input);
  keys.forEach(k => {
    const diff = (input[k] || 0) - (out[k] || 0);
    err += diff * diff;
  });
  const mse = err / keys.length;
  const score = Math.tanh(mse * 50);
  return score;
}

module.exports = { trainFromDataset, scoreAnomaly, loadModelIfExists };
