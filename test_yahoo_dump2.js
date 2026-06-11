const axios = require('axios');
const fs = require('fs');
async function testYahoo() {
  const query = "Puravankara Purva Silver Sky";
  try {
    const url = `https://search.yahoo.com/search?p=${encodeURIComponent(query)}`;
    const { data } = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      }
    });
    fs.writeFileSync('yahoo.html', data);
    console.log("Yahoo HTML saved");
  } catch(e) {
    console.log("Error:", e.message);
  }
}
testYahoo();
