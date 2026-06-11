const googleIt = require('google-it');

async function test() {
  try {
    const results = await googleIt({ query: 'Puravankara Purva Silver Sky' });
    console.log("Success! Found:", results.length);
    console.log(results.slice(0, 2));
  } catch (e) {
    console.error("Error:", e.message);
  }
}
test();
