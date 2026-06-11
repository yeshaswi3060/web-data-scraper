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
    $('.result-snippet').each((i, element) => {
      const snippet = $(element).text().trim();
      const trPrev = $(element).closest('tr').prev();
      const url = trPrev.find('.result-url').attr('href');
      const title = trPrev.find('.result-title').text().trim();
      if (url) {
         results.push({ title, url, snippet });
      }
    });
    console.log(results);
  } catch (error) {
    console.error(error.message);
  }
}
searchWeb("Puravankara Purva Silver Sky");
