const axios = require('axios');
const cheerio = require('cheerio');

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
    const $ = cheerio.load(data);
    const results = [];
    $('.algo').each((i, el) => {
       const title = $(el).find('h3 a').text();
       const url = $(el).find('h3 a').attr('href');
       if (title && url) {
           results.push({title, url});
       }
    });
    console.log("Yahoo results:", results.length);
    console.log(results.slice(0, 2));
  } catch(e) {
    console.log("Error:", e.message);
  }
}
testYahoo();
