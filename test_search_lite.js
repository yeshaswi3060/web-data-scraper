const axios = require('axios');
const cheerio = require('cheerio');

async function searchWeb(query) {
  try {
    const searchUrl = `https://lite.duckduckgo.com/lite/`;
    const response = await axios.post(searchUrl, `q=${encodeURIComponent(query)}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    const $ = cheerio.load(response.data);
    const results = [];
    $('tr').each((i, element) => {
      const titleLink = $(element).find('.result-snippet');
      const hrefLink = $(element).find('.result-url');
      if (titleLink.length > 0) {
          results.push({ snippet: titleLink.text().trim() });
      }
    });
    console.log(response.data.substring(0, 500));
  } catch (error) {
    console.error(error.message);
  }
}
searchWeb("Puravankara Purva Silver Sky");
