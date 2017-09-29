'use strict';

const assert = require('assert');
const bcoin = require('bcoin');
const MTX = bcoin.mtx;
const Script = bcoin.script;
const Coin = bcoin.coin;

const getMaxFee = function getMaxFee(maxInputs, coin, address, keyring, rate) {
  const fundingTarget = 100000000; // 1 BTC (arbitrary for purposes of this function)
  const testMTX = new MTX();

  // we're not actually going to use this tx for anything other than calculate what fee should be
  testMTX.addOutput({ value: fundingTarget, address })

  while(testMTX.inputs.length < maxInputs) {
    const index = testMTX.inputs.length;
    addInput(coin, index, testMTX, keyring);
  }

  return testMTX.getMinFee(null, rate);
}

const addInput = function addInput(coin, inputIndex, mtx, keyring, hashType) {
  const sampleCoin = coin instanceof Coin ? coin : Coin.fromJSON(coin);
  if(!hashType) hashType = Script.hashType.ANYONECANPAY | Script.hashType.ALL;

  mtx.addCoin(sampleCoin);
  mtx.scriptInput(inputIndex, sampleCoin, keyring);
  mtx.signInput(inputIndex, sampleCoin, keyring, hashType);
  assert(mtx.isSigned(), 'Input was not signed properly');
}

module.exports = {
  getMaxFee,
  addInput
}