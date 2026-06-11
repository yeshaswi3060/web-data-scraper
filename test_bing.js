const axios = require('axios');
const cheerio = require('cheerio');

async function testBing() {
  const query = "Puravankara Purva Silver Sky";
  try {
    const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}`;
    const { data } = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      }
    });
    const $ = cheerio.load(data);
    const results = [];
    $('.b_algo').each((i, el) => {
       const title = $(el).find('h2 a').text();
       const url = $(el).find('h2 a').attr('href');
       if (title && url) {
           results.push({title, url});
       }
    });
    console.log("Bing results:", results.length);
    console.log(results.slice(0, 2));
  } catch(e) {
    console.log("Error:", e.message);
  }
}
testBing();
