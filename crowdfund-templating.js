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
const getMaxFee = Utils.getMaxFee;
const addInput = Utils.addInput;

const fundingTarget = 100000000; // 1 BTC
const txRate = 10000; // 10000 satoshis/kb

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
```javascript{

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

/**
Step 2

Since ALL|ANYONECANPAY transactions mean a fixed output,
you can't add new outputs without other signatures becoming invalid.
Adding too many outputs will also increase the size of the tx exponentially
and make the tx costs too high.
So what we want to do is have each funder create a coin (UTXO) with the value
of what they want to donate.
**/

async function splitCoinbase(coins, targetAmount) {
  // make an output of the right size available
  // loop through each coinbase coin to split
  for(const coinsIndex in coins) {
    // funder will be at the same index as the key of the coins we are accessing
    const funderKeyring = funders[coinsIndex];
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

(async () => {
  const amountToFund = 50000000; // .5 BTC
  const funderCoins = await splitCoinbase(coins, amountToFund);

  /**
    funderCoins should return x number of coin arrays, where X is
    the number of coinbases we created earlier (should be 2)
    with each array having a coin equal to the amount we want to donate

    ```javascript
    {
      '0':
         [ { type: 'pubkeyhash',
             version: 1,
             height: -1,
             value: '0.5',
             script: <Script: OP_DUP OP_HASH160 0x14 0x62f725e83caf894aa6c3efd29ef28649fc448825 OP_EQUALVERIFY OP_CHECKSIG>,
             coinbase: false,
             hash: '774822d84bd5af02f1b3eacd6215e0a1bcf07cfb6675a000c8a01d2ea34f2a32',
             index: 0,
             address: <Address: type=pubkeyhash version=-1 str=mpYEb17KR7MVhuPZT1GsW3SywZx8ihYube> },
             ...
          ],
      '1': [...]
    }
    ```
  **/

  /**
  Step 2.5
  We have a tricky problem now. In a real world situation you're not going to know how many inputs (i.e. funders) you will have.
  But the more inputs you have, the bigger the transaction and thus the higher the fee you will need to broadcast it.
  The best we can do is to estimate the size based off of the max number of inputs we are willing to accept.

  In our example, we know there are two inputs. In a more complex application, you might put a cap of say 5, then
  estimate the fee based on that. If there turn out to be fewer then you just have a relatively high fee.
  **/
  const maxInputs = 5;
  const maxFee = getMaxFee(
    maxInputs,
    funderCoins['0'][0],
    fundeeAddress,
    funder1Keyring,
    txRate
  );

  console.log(`Based on a rate of ${txRate} satoshis/kb and a tx with max ${maxInputs}`);
  console.log(`the tx fee should be ${maxFee} satoshis`);

  /**
  Step 3
  Now that our funder wallets have funds available
  we can begin to construct the fundee transaction they will donate to
  **/

  const fundMe = new MTX();

  // add an output with the target funding amount

  fundMe.addOutput({ value: fundingTarget - maxFee, address: fundeeAddress });

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
  assert(tx.verify(fundMe.view), 'there is a problem with your tx');

  console.log('final tx: ', tx);
})();



