'use strict';

const assert = require('assert');
const bcoin = require('bcoin');
const MTX = bcoin.mtx;
const Script = bcoin.script;
const HashTypes = bcoin.script.hashType;
const httpWallet = bcoin.http.Wallet;

const network = 'simnet';

(async () => {
  // const primary = await new httpWallet({id: 'primary', network: 'simnet'});
  // const balance = await primary.getBalance('default');
  const client = await new bcoin.http.Client({ network });

  // Step 1: Setup our wallets and funding targets
  const fundeeWallet = await new httpWallet({ id: 'fundee', network });

  const fundeeAddress = await fundeeWallet.createAddress('default');

  const funders = {
    'funder-1': await new httpWallet({ id: 'funder-1', network }),
    'funder-2': await new httpWallet({ id: 'funder-2', network })
  };

  const fundingTarget = 100000000; // 1 BTC
  const amountToFund = 50000000; // .5 BTC
  const rate = 300; // satoshis per kb

  // Step 2: Create coin/outpoint that equals the target fund amount for funders
  const fundingCoins = {};

  // go through each funding wallet to prepare coins
  for(let id in funders) {
    const funder = funders[id];

    const coins = await funder.getCoins();
    const funderInfo = await funder.getInfo();

    // go through available coins to find a coin equal to or greater than value to fund
    let funderCoin = {};
    for(let coin of coins) {
      if (coin.value === amountToFund) {
        // if we already have a coin of the right value we can use that
        funderCoin = coin;
        break;
      }
    }
    if (!Object.keys(funderCoin).length) {
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

      // confirm index of output
      assert(tx.outputs[0].value === amountToFund);

      // first argument is for the account
      // default is being used for all examples
      funderCoin = await funder.getCoin('default', tx.hash, 0);
    }
    fundingCoins[funder.id] = funderCoin;
  }
  /**
  fundingCoins should be object with wallet id and corresponding coin to be used for funding
  ```javascript
    { 'funder-1':
       { version: 1,
         height: -1,
         value: 50000000,
         script: '76a914127cb1a40212169c49fe22d13307b18af1fa07ad88ac',
         address: 'SNykaBMuTyeUQkK8exZyymWNrnYX5vVPuY',
         coinbase: false,
         hash: '163068016a39e2d9c869bcdb8646dbca93e07824db39217b5c444e7c61d1a82c',
         index: 0 },
      'funder-2':
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
  // Step 3: Create and template the mtx with output for funding target
  const fundMe = new MTX();
  // need this because can't serialize and output mtx with no input

  fundMe.addOutput({value: fundingTarget, address: fundeeAddress.address });

  // Step 4: Add inputs from the funder wallets
  let inputCounter = 0;
  for(let funder in fundingCoins) {
    const wallet = funders[funder];
    const coinOptions = fundingCoins[funder];

    const key = await wallet.getWIF(coinOptions.address);
    const keyring = new bcoin.keyring.fromSecret(key.privateKey);
    const coin = bcoin.coin.fromJSON(coinOptions);

    fundMe.addCoin(coin);
    fundMe.scriptInput(inputCounter, coin, keyring);
    fundMe.signInput(inputCounter, coin, keyring, Script.hashType.ANYONECANPAY | Script.hashType.ALL);
    inputCounter++;
  }

  // confirm that the transaction has been properly templated and signed
  assert(fundMe.isSigned(), 'Inputs have not been signed correctly');

  console.log(fundMe);
  return;

  // Step 5: estimate fee based on rate and size of transaction
  // and subtract from output value

  // Step 6: Transmit the splitting transactions followed by the fund tx

    // Sign and broadcast tx

  // console.log('transaction: ', fundMe);
})();

/** *****
NOTES:
- need to account for change addresses:
    - only "exact" UTXOs added, so process for in-exact would be
      to split a UTXO first sending to yourself
- need to account for who pays the fee
  - maybe the receiver adds one final input that is entirely for fee

Extra Features:
- funder that does "matching donations"
- need to account for change addresses
- need to account for who pays the fee (probably should be the receiver)
***** **/
