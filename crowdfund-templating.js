'use strict';

const assert = require('assert');
const bcoin = require('bcoin');
const MTX = bcoin.mtx;
const Keyring = bcoin.keyring;
const Outpoint = bcoin.outpoint;
const Script = bcoin.script;
const Coin = bcoin.coin;
const policy = bcoin.protocol.policy

const Utils = require('./utils.js');
const addInput = Utils.addInput;
const getFeeForInput = Utils.getFeeForInput;

/**
Step 1

This is mostly setup so that we have some phony funded wallets.
If you're testing this on a real network you can use existing
wallets that have funds already.
**/

// Let's setup our wallets for a fundee and 2 funders
// Much of this code is taken from the Working With Transactions guide

// Create an HD master keypair.
const master = bcoin.hd.generate();

// Derive private hd key for fundee and create a "keyring" object.
// A keyring object is basically a key manager that
// is also able to tell you info such as: your redeem script, your scripthash,
// your program hash, your pubkey hash, your scripthash program hash, etc.

const fundeeKey = master.derive(0);
const fundeeKeyring = new Keyring(fundeeKey.privateKey);
const fundeeAddress = fundeeKeyring.getAddress();

// Derive 2 more private hd keys and keyrings for funders
const funder1Key = master.derive(1);
const funder1Keyring = new Keyring(funder1Key.privateKey);

const funder2Key = master.derive(2);
const funder2Keyring = new Keyring(funder2Key.privateKey);

const funders = [funder1Keyring, funder2Keyring];

// create some coinbase transactions to fund our wallets
const coins = {};

for(let i=0; i < funders.length; i++) {
  const cb = new MTX();

  // Add a typical coinbase input
  cb.addInput({
    prevout: new Outpoint(),
    script: new Script()
  });

  cb.addOutput({
    address: funders[i].getAddress(),
    value: 500000000 // give the funder 5BTC
  });

  assert(cb.inputs[0].isCoinbase());

  // Convert the coinbase output to a Coin
  // object and add it to the available coins for that keyring.
  // In reality you might get these coins from a wallet.
  coins[i] = [Coin.fromTX(cb, 0, -1)];
}


/**
coins object should look something like:
```javascript
  {
    '0':
        [
          {
            type: 'pubkeyhash',
            version: 1,
            height: -1,
            value: '5.0',
            script: <Script: OP_DUP OP_HASH160 0x14 0x64cc4e55b2daec25431bd879ef39302a77c1c1ce OP_EQUALVERIFY OP_CHECKSIG>,
            coinbase: true,
            hash: '151e5551cdcec5fff06818fb78ac3d584361276e862b5700110ec8321869d650',
            index: 0,
            address: <Address: type=pubkeyhash version=-1 str=mphvcfcFneRZvyYsmzhy57cSDzFbGrWaRb>
          }
        ],
    '1': [...]
  }
```
**/

const composeCrowdfund = async function composeCrowdfund(coins) {
  const fundingTarget = 100000000; // 1 BTC
  const amountToFund = 50000000; // .5 BTC
  const txRate = 10000; // 10000 satoshis/kb
  /**
  Step 2

  Since ALL|ANYONECANPAY transactions mean a fixed output,
  you can't add new outputs without other signatures becoming invalid.

  So what we want to do is have each funder create a coin (UTXO) with the value
  of what they want to donate.

  A second consideration we need to make is how to fund the transaction fees.
  `getFeeForInput` takes care of this by creating a sample tx with just one input
  for each funder. Since different keyrings can be using different transaction types
  of different sizes (p2sh, multisig, etc.) we will add the estimated fee on each input
  and use that to split the coins.
  **/
  const funderCoins = {};
  // Loop through each coinbase
  for (let index in coins) {
    const coinbase = coins[index][0];
    // estimate fee for each coin (assuming their split coins will use same tx type)
    const estimatedFee = getFeeForInput(coinbase, fundeeAddress, funders[index], txRate);
    const targetPlusFee = amountToFund + estimatedFee;

    // split the coinbase with targetAmount plus estimated fee
    const splitCoins = await Utils.splitCoinbase(funders[index], coinbase, targetPlusFee, txRate);

    // add to funderCoins object with returned coins from splitCoinbase being value,
    // and index being the key
    funderCoins[index] = splitCoins;
  }
  console.log('funderCoins', funderCoins)

  /**
    funderCoins should return x number of coin arrays, where X is
    the number of coinbases we created earlier (should be 2)
    with each array having a coin equal to the amount we
    want to donate (including fee)

    ```javascript
    {
      '0':
         [ { type: 'pubkeyhash',
             version: 1,
             height: -1,
             value: '0.5000157',
             script: <Script: OP_DUP OP_HASH160 0x14 0x59e3cf2f7de8846ca63a026f19c5e5d7e4ae197e OP_EQUALVERIFY OP_CHECKSIG>,
             coinbase: false,
             hash: '94a4e11c514119113ebd8b5eb237cdcd98cf25027f9f34a1ed5e10c85dff6b35',
             index: 0,
             address: <Address: type=pubkeyhash version=-1 str=19CJ3YRm1wdKUFBC4siGeNsazEkoEj3nMn> },
             ...
          ],
      '1': [...]
    }
    ```
  **/

  /**
  Step 3
  Now that our funder wallets have funds available
  we can begin to construct the fundee transaction they will donate to
  **/

  const fundMe = new MTX();

  // add an output with the target funding amount

  fundMe.addOutput({ value: fundingTarget, address: fundeeAddress });

  // fund with first funder
  let fundingCoin = funderCoins['0'][0];
  addInput(fundingCoin, 0, fundMe, funder1Keyring);

  // fund with second funder
  fundingCoin = funderCoins['1'][0];
  addInput(fundingCoin, 1, fundMe, funder2Keyring);

  // We want to confirm that total value of inputs covers the funding goal
  // NOTE: the difference goes to the miner in the form of fees
  assert(fundMe.getInputValue() >= fundMe.outputs[0].value, 'Total inputs not enough to fund');
  assert(fundMe.verify(), 'The mtx is malformed');

  const tx = fundMe.toTX();
  console.log('total input value = ', fundMe.getInputValue());
  console.log('Fee getting sent to miners:', fundMe.getInputValue() - fundingTarget, 'satoshis');

  assert(tx.verify(fundMe.view), 'there is a problem with your tx');

  return tx;
};

composeCrowdfund(coins).then(myCrowdfundTx => console.log(myCrowdfundTx)).catch(e => console.log('there was an error: ', e));
