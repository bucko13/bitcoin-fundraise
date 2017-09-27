'use strict';

const bcoin = require('bcoin');
const MTX = bcoin.mtx;
const HashTypes = bcoin.script.hashType;
const httpWallet = bcoin.http.Wallet;

const fundingTarget = 100000000; // 1 BTC
const network = 'testnet';

(async () => {
  const primary = await new httpWallet({id: 'primary', network: 'simnet'});
  const balance = await primary.getBalance('default');
  console.log('primary balance: ', bcoin.amount.btc(balance.unconfirmed));
  const client = await new bcoin.http.Client({ network });

  // Step 1: Setup our wallets and funding targets
  const fundeeWallet = await new httpWallet({ id: 'foo', network });

  const fundeeAddress = await fundeeWallet.createAddress('default');

  let funder1Wallet = await new httpWallet({ id: 'funder-1', network });
  let funder2Wallet = await new httpWallet({ id: 'funder-2', network });

  // Step 2: Create coin/outpoint that equals the target fund amount for funders

  // Step 3: Create and template the mtx with output for funding target
  const fundMe = new MTX();
  // need this because can't serialize and output mtx with no input
  fundMe.addInput(new bcoin.primitives.Input());

  fundMe.addOutput({value: fundingTarget, address: fundeeAddress.address });

  // Step 4: Add inputs from the funder wallets
  // Note that the following steps assume the funder wallet has balance > 0

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
