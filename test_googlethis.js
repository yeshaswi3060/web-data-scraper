const google = require('googlethis');
async function test() {
  const options = { page: 0, safe: false, parse_ads: false, additional_params: {} };
  const res = await google.search("Puravankara Purva Silver Sky", options);
  console.log(res.results.slice(0, 2));
}
test();
