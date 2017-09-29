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

const splitCoinbase = async function splitCoinbase(keyrings, coins, targetAmount, txRate) {
  // make an output of the right size available
  // loop through each coinbase coin to split
  for(const coinsIndex in coins) {
    // funder will be at the same index as the key of the coins we are accessing
    const funderKeyring = keyrings[coinsIndex];
    const mtx = new MTX();

    assert(coins[coinsIndex][0].value > targetAmount, 'coin value is not enough!');

    // creating a transaction that will have an output equal to what we want to fund
    mtx.addOutput({
      address: funderKeyring.getAddress(),
      value: targetAmount
    });

    // shift off the coinbase coin to use to fund the splitting transaction
    // the fund method will automatically split the remaining funds to the change address
    await mtx.fund([coins[coinsIndex].shift()], {
      rate: txRate,
      // send change back to an address belonging to the funder
      changeAddress: funderKeyring.getAddress()
    }).then(() => {
      // sign the mtx to finalize split
      mtx.sign(funderKeyring);
      assert(mtx.verify());

      const tx = mtx.toTX();
      assert(tx.verify(mtx.view));

      const outputs = tx.outputs;

      // get coins from tx
      outputs.forEach((outputs, index) => {
        coins[coinsIndex].push(Coin.fromTX(tx, index, -1));
      });
    })
    .catch(e => console.log('There was an error: ', e));
  }

  return coins;
};

module.exports = {
  getMaxFee,
  addInput,
  splitCoinbase
}