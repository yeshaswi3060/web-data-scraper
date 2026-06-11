const axios = require('axios');
const cheerio = require('cheerio');
async function test() {
  const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent("Puravankara Purva Silver Sky")}`;
  try {
     const response = await axios.get(searchUrl, {
       headers: {
         'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
         'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
       }
     });
     console.log(response.data.substring(0, 500));
     const $ = cheerio.load(response.data);
     const links = [];
     $('.result__snippet').each((i, el) => {
        links.push($(el).text());
     });
     console.log("Links found:", links.length);
  } catch(e) {
     console.log("Error:", e.message);
  }
}
test();
