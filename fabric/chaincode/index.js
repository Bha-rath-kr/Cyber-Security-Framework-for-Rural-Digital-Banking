'use strict';

const AuditLedger = require('./lib/auditLedger');
const { Contract } = require('fabric-contract-api');

module.exports.AuditLedger = AuditLedger;
module.exports.contracts = [AuditLedger];
