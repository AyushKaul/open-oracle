const { address, bytes, hexToNumberString, time } = require('./Helpers');
const { encode, sign } = require('../sdk/javascript/.tsbuilt/reporter');

// let proof = {
//   a: [
//     3558717173933884933635554802976169264909392168481272748946306906126253416064,
//     14237936417496311712442381993805199727085903274773704935591104564390560900246
//   ],
//   b: [
//     [
//       14818843079760354093235090100818493063836549557589740631710920777448258987865,
//       11533436085046180789808917451892768944094078272725117305052138073606445941739
//     ],
//     [
//       17526215328972423909740990207097311382081258713561740989673940764047212020575,
//       8496030358798491383595052456988383004414301688228229592713688997034730403001
//     ]
//   ],
//   c: [
//     13878315445454056812322154040455087529989837766119462119899411350931853127303,
//     8472664978432294110810371909106739189341547670063267655649417995345305548170
//   ]
// };

// let inputs = {
//   inp: [700, 800, 1]
// };

let proof = {
  a: [
    hexToNumberString("0x07de299c4d168b30f4f6bd4cf5f2dd20bedf6682ffbb632a5887f74aedc1de80"),
    hexToNumberString("0x1f7a62ed542823e002fa55f22b1c7d83abb4f2d24678c520ee574f63adc5a496")
  ],
  b: [
    [
      hexToNumberString("0x20c32afef9a5f1af53e0c9c7976c14d540606203f790e1a5fd85a7165862e759"),
      hexToNumberString("0x197fb188a6f259b6e9763625e217abd90bd921c97191c513e84ce95a830143eb")
    ],
    [
      hexToNumberString("0x26bf7c80f70810f811b89b63afb1c067d61842029c99caa246e2b090cd8c035f"),
      hexToNumberString("0x12c89530a200c4eee4cef9ed0f07d9215be417573ab384375c3bac14beeb34b9")
    ]
  ],
  c: [
    hexToNumberString("0x1eaed9221d5565333129226ca30d3479f3a872b444708edc1f22e07371adae87"),
    hexToNumberString("0x12bb5bc281d490b1ccd4535deb40fcbd86f4cfdadbb1bedc330f745ac598358a")
  ]
}

let inputs = {
  inp: [
    hexToNumberString("0x00000000000000000000000000000000000000000000000000000000000002bc"),
    hexToNumberString("0x0000000000000000000000000000000000000000000000000000000000000320"),
    hexToNumberString("0x0000000000000000000000000000000000000000000000000000000000000001")
  ]
};

describe('OpenOracleData', () => {
  let oracleData;
  let priceData;
  const privateKey =
    '0x177ee777e72b8c042e05ef41d1db0f17f1fcb0e8150b37cfad6993e4373bdf10';
  const signer = '0x1826265c3156c3B9b9e751DC4635376F3CD6ee06';

  beforeEach(async done => {
    oracleData = await deploy('OpenOracleData', []);
    const verifier = await deploy("Verifier", []);
    priceData = await deploy('OpenOraclePriceData', [verifier._address]);
    done();
  });

  it('has correct default data', async () => {
    let { 0: timestamp, 1: value } = await call(priceData, 'get', [
      address(0),
      'ETH'
    ]);

    expect(timestamp).numEquals(0);
    expect(value).numEquals(0);
  });

  it.only('source() should ecrecover correctly', async () => {
    const [{ message, signature }] = sign(
      encode('prices', time(), [['ETH', 700, 800]]),
      privateKey
    );

    const data = await send(priceData, 'put', [message, signature, proof, inputs], {
      gas: 1000000
    });

    expect(await call(oracleData, 'source', [message, signature])).toEqual(
      signer
    );
    expect(
      await call(oracleData, 'source', [bytes('bad'), signature])
    ).not.toEqual(signer);
    await expect(
      call(oracleData, 'source', [message, bytes('0xbad')])
    ).rejects.toRevert();
  });

  it('should save data from put()', async () => {
    const timestamp = time() - 1;
    const ethPrice = 700;
    const [{ message, signature }] = sign(
      encode('prices', timestamp, [['ETH', ethPrice]]),
      privateKey
    );

    const putTx = await send(priceData, 'put', [message, signature], {
      gas: 1000000
    });
    expect(putTx.gasUsed).toBeLessThan(86000);
  });


  it('sending data from before previous checkpoint should fail', async () => {
    const timestamp = time() - 1;
    let [{ message, signature }] = sign(
      encode('prices', timestamp, [['ABC', 100]]),
      privateKey
    );
    await send(priceData, 'put', [message, signature], {
      gas: 1000000
    });

    const timestamp2 = timestamp - 1;
    const [{ message: message2, signature: signature2 }] = sign(
      encode('prices', timestamp2, [['ABC', 150]]),
      privateKey
    );
    const putTx = await send(priceData, 'put', [message2, signature2], {
      gas: 1000000
    });

    expect(putTx.events.NotWritten).not.toBe(undefined);

    ({ 0: signedTimestamp, 1: value } = await call(priceData, 'get', [
      signer,
      'ABC'
    ]));
    expect(value / 1e6).toBe(100);
  });

  it('signing future timestamp should not write to storage', async () => {
    const timestamp = time() + 3601;
    const [{ message, signature }] = sign(
      encode('prices', timestamp, [['ABC', 100]]),
      privateKey
    );
    const putTx = await send(priceData, 'put', [message, signature], {
      gas: 1000000
    });
    expect(putTx.events.NotWritten).not.toBe(undefined);
    ({ 0: signedTimestamp, 1: value } = await call(priceData, 'get', [
      signer,
      'ABC'
    ]));
    expect(+value).toBe(0);
  });

  it('two pairs with update', async () => {
    const timestamp = time() - 2;
    const signed = sign(
      encode('prices', timestamp, [['ABC', 100], ['BTC', 9000]]),
      privateKey
    );

    for ({ message, signature } of signed) {
      await send(priceData, 'put', [message, signature], {
        gas: 1000000
      });
    }

    ({ 0: signedTime, 1: value } = await call(priceData, 'get', [
      signer,
      'BTC'
    ]));
    expect(value / 1e6).numEquals(9000);

    ({ 0: signedTime, 1: value } = await call(priceData, 'get', [
      signer,
      'ABC'
    ]));
    expect(value / 1e6).numEquals(100);

    //2nd tx
    const later = timestamp + 1;

    const signed2 = sign(
      encode('prices', later, [['ABC', 101], ['BTC', 9001]]),
      privateKey
    );

    for ({ message, signature } of signed2) {
      const wrote2b = await send(priceData, 'put', [message, signature], {
        gas: 1000000
      });
      expect(wrote2b.gasUsed).toBeLessThan(75000);
    }

    ({ 0: signedTime, 1: value } = await call(priceData, 'get', [
      signer,
      'BTC'
    ]));
    expect(value / 1e6).numEquals(9001);

    ({ 0: signedTime, 1: value } = await call(priceData, 'get', [
      signer,
      'ABC'
    ]));
    expect(value / 1e6).numEquals(101);
  });
});
