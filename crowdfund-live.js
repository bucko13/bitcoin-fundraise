'use strict';

const assert = require('assert');
const bcoin = require('bcoin');
const MTX = bcoin.mtx;
const Script = bcoin.script;
const HashTypes = bcoin.script.hashType;
const httpWallet = bcoin.http.Wallet;
const policy = bcoin.protocol.policy;

const Utils = require('./utils.js');

const network = 'simnet';
const SCRIPT_HASHTYPE = Script.hashType.ANYONECANPAY | Script.hashType.ALL;

const fundingTarget = 100000000; // 1 BTC
const amountToFund = 50000000; // .5 BTC
const rate = 10000; // satoshis per kb
const maxInputs = 5; // this will be used in calculating fee

(async () => {
  const client = await new bcoin.http.Client({ network });

  // Step 1: Setup our wallets and funding targets
  const fundeeWallet = await new httpWallet({ id: 'fundee', network });
  const fundeeAddress = await fundeeWallet.createAddress('default');
  const funders = {
    'funder1': await new httpWallet({ id: 'funder1', network }),
    'funder2': await new httpWallet({ id: 'funder2', network })
  };


  // Step 2: Prepare coins for funding
  // Because ALL | ANYONECANPAY inputs txs must keep a fixed number of outputs
  // There can be no change outputs, which means that inputs must come from exact change outpoints/coins

  const fundingCoins = {};

  // go through each funding wallet to prepare coins
  for(let id in funders) {
    const funder = funders[id];

    const coins = await funder.getCoins();
    const funderInfo = await funder.getInfo();

    // go through available coins to find a coin equal to or greater than value to fund
    let fundingCoin = {};
    for(let coin of coins) {
      if (coin.value === amountToFund) {
        // if we already have a coin of the right value we can use that
        fundingCoin = coin;
        break;
      }
    }

    if (!Object.keys(fundingCoin).length) {
      // if we don't have a coin of the right amount to fund with
      // we need to create one by sending the funder wallet
      // a tx that includes an output of the right amount

      const receiveAddress = await funder.createAddress('default') // send it back to the funder
      const tx = await funder.send({
        rate,
        outputs: [{
          value: amountToFund,
          address: receiveAddress.address
        }]
      });

      // get index of ouput for fundingCoin
      let coinIndex;
      for (let i=0; i < tx.outputs.length; i++) {
        if (tx.outputs[i].value === amountToFund) {
          coinIndex = i;
          break;
        }
      }

      assert(tx.outputs[coinIndex].value === amountToFund, 'value of output at index not correct');

      // first argument is for the account
      // default is being used for all examples
      fundingCoin = await funder.getCoin('default', tx.hash, coinIndex);
    }
    fundingCoins[funder.id] = fundingCoin;
  }

  /**
  fundingCoins should be object with wallet id and corresponding coin to be used for funding
  ```javascript
    { 'funder1':
       { version: 1,
         height: -1,
         value: 50000000,
         script: '76a914127cb1a40212169c49fe22d13307b18af1fa07ad88ac',
         address: 'SNykaBMuTyeUQkK8exZyymWNrnYX5vVPuY',
         coinbase: false,
         hash: '163068016a39e2d9c869bcdb8646dbca93e07824db39217b5c444e7c61d1a82c',
         index: 0 },
      'funder2':
       { version: 1,
         height: -1,
         value: 50000000,
         script: '76a9146e08c73b355e690ba0b1198d578c4c6c52b3813688ac',
         address: 'SXKossD65D7h62fhzGrntERBrPeXUfiC92',
         coinbase: false,
         hash: '11f3180c5069f2692f1ee1463257b21dc217441e792493c8f5ee230c35d97d96',
         index: 0 }
    }

  ```
  **/

  /**
  Step 2.5
  We have a tricky problem now. In a real world situation you're not going to know how many inputs (i.e. funders) you will have.
  But the more inputs you have, the bigger the transaction and thus the higher the fee you will need to broadcast it.
  The best we can do is to estimate the size based off of the max number of inputs we are willing to accept.

  In our example, we know there are two inputs. In a more complex application, you might put a cap of say 10, then
  estimate the fee based on that. If there turn out to be fewer then you just have a relatively high fee.
  **/

  const testKey = await funders['funder1'].getWIF(fundingCoins['funder1'].address);
  const testKeyring = new bcoin.keyring.fromSecret(testKey.privateKey);
  const maxFee = Utils.getMaxFee(maxInputs, fundingCoins['funder1'], fundeeAddress.address, testKeyring, rate);

  console.log(`Based on a rate of ${rate} satoshis/kb and a tx with max ${maxInputs}`);
  console.log(`the tx fee should be ${maxFee} satoshis`);

  // Step 3: Create and template the mtx with output for funding target
  const fundMe = new MTX();

  // Use the maxFee to calculate output value for transaction
  fundMe.addOutput({value: fundingTarget - maxFee, address: fundeeAddress.address });

  // Step 4: Add inputs from the funder wallets
  let inputCounter = 0;
  for(let funder in fundingCoins) {
    const wallet = funders[funder];
    const coinOptions = fundingCoins[funder];

    const key = await wallet.getWIF(coinOptions.address);
    const keyring = new bcoin.keyring.fromSecret(key.privateKey);

    Utils.addInput(coinOptions, inputCounter, fundMe, keyring);
    inputCounter++;
    assert(fundMe.isSigned(), 'Input has not been signed correctly');
  }

  // confirm that the transaction has been properly templated and signed
  assert(
    fundMe.inputs.length === Object.keys(funders).length,
    'Number of inputs in MTX is incorrect'
  );
  assert(fundMe.verify(), 'MTX is malformed');

  const tx = fundMe.toTX();

  assert(tx.verify(fundMe.view), 'TX is malformed. Fix before broadcasting');

  // Step 6: broadcast tx
  try {
    const broadcastStatus = await client.broadcast(tx);
    console.log('Final TX:', tx);
    console.log('tx broadcasted: ', broadcastStatus);
  } catch(e){
    console.log(e);
  }
})();

