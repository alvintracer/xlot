
import { validateAndDeriveAddress } from './src/utils/keyManager.ts';

async function testTron() {
    console.log("Testing TRON key derivation...");

    // 32-byte private key (random hex)
    // 64 chars hex
    const dummyKey = "0101010101010101010101010101010101010101010101010101010101010101";

    const result = validateAndDeriveAddress('TRON', dummyKey);
    console.log("Result:", result);

    if (result.isValid && result.address.startsWith('T')) {
        console.log("SUCCESS: Derived valid TRON address starting with T");
    } else {
        console.error("FAILURE: Did not derive valid TRON address");
        process.exit(1);
    }
}

testTron();
