'use strict';

const assert = require('assert');
const bcoin = require('bcoin');
const MTX = bcoin.mtx;
const Script = bcoin.script;
const HashTypes = bcoin.script.hashType;
const httpWallet = bcoin.http.Wallet;
const policy = bcoin.protocol.policy;

const network = 'simnet';
const VERIFY_FLAGS = Script.hashType.ANYONECANPAY | Script.hashType.ALL;

(async () => {
  const client = await new bcoin.http.Client({ network });

  // Step 1: Setup our wallets and funding targets
  const fundeeWallet = await new httpWallet({ id: 'fundee', network });

  const fundeeAddress = await fundeeWallet.createAddress('default');

  const funders = {
    'funder1': await new httpWallet({ id: 'funder1', network }),
    'funder2': await new httpWallet({ id: 'funder2', network })
  };

  const fundingTarget = 100000000; // 1 BTC
  const amountToFund = 50000000; // .5 BTC
  const rate = 3000; // satoshis per kb

  // Step 2: Create coin/outpoint that equals the target fund amount for funders
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
  console.log('coins: ', fundingCoins);

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
  // Step 3: Create and template the mtx with output for funding target
  const fundMe = new MTX();
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
    fundMe.signInput(inputCounter, coin, keyring, VERIFY_FLAGS);
    inputCounter++;
    assert(fundMe.isSigned(), 'Input has not been signed correctly');
  }

  // confirm that the transaction has been properly templated and signed
  assert(fundMe.verify(VERIFY_FLAGS), 'MTX is malformed');
  console.log(fundMe);

  // Step 5: estimate fee based on rate and size of transaction
  // and subtract from output value
  const txSize = fundMe.getSize();
  const fee = policy.getMinFee(txSize, 10000);

  fundMe.subtractFee(fee);

  const tx = fundMe.toTX();

  // Step 6: broadcast tx
  console.log(tx);
  const broadcastStatus = await client.broadcast(tx);
  console.log('tx broadcasted: ', broadcastStatus);
})();

/**
 NOTE:
 Verification is failing in the mempool and the blockchain for the nonstandard transaction
 Commenting out line 692-695 in chain.js and 1036-1039 in mempool.js will allow the
 the tx verification to pass
 **/
