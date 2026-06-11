const axios = require('axios');
const cheerio = require('cheerio');

async function searchWeb(query) {
  try {
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const response = await axios.get(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
      }
    });

    const $ = cheerio.load(response.data);
    const results = [];
    $('.result__snippet').each((i, element) => {
      const parent = $(element).closest('.result');
      const titleLink = parent.find('.result__url');
      results.push({ title: titleLink.text().trim(), url: titleLink.attr('href') });
    });
    console.log(results);
  } catch (error) {
    console.error(error.message);
  }
}
searchWeb("Puravankara Purva Silver Sky");
